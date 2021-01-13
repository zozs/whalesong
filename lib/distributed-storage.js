/*
 * Distributed (hyperbee(hypercore) + ipfs) based storage.
 *
 * Hyperbee is used to store the mutable state, i.e. tags and manifests. It also stores
 * mappings between docker digests and ipfs digests.
 *
 * IPFS is used to store immutable blobs, such as the layers themselves.
 */

import assert from 'assert'
import crypto from 'crypto'
import Debug from 'debug'
import { getHyperbee, getOwnHyperbee, getSettingsHyperbee, getIpfsClient, setup } from './distributed-clients.js'
import all from 'it-all'
import uint8arrays from 'uint8arrays'
import { v4 as uuidv4 } from 'uuid'
import Settings from './settings.js'

const debug = Debug('whalesong:storage')

// After syncing a new hyperbee, wait for a couple of seconds to allow for an initial sync.
// This is to avoid whalesong to return 404 Not Found for a manifest even though it actually exists.
// TODO: actually detect if we have synced something, and then stop waiting to avoid unnecessary wait.
const INITIAL_SYNC_SETTLE = 10

class DistributedStorage {
  constructor () {
    this.ipfs = null
    this.hyperbees = new Map()
    this.uploadStore = new Map()
  }

  blobStore (org) {
    // returns the blob sub-database for the hyperbee for a given organization if it exists, otherwise nullish
    const bee = this.hyperbees.get(org)
    return bee?.sub('blob')
  }

  manifestStore (org, name) {
    // returns the manifest sub-database for the hyperbee for a given organization if it exists, otherwise nullish
    const bee = this.hyperbees.get(org)
    return bee?.sub('manifest').sub(name)
  }

  async getBlob (org, name, dockerDigest) {
    const blobs = this.blobStore(org)
    if (blobs) {
      const ipfsCidNode = await blobs.get(dockerDigest)
      const ipfsCid = ipfsCidNode?.value

      debug(`retrieving blob from IPFS with CID ${ipfsCid}, based on digest ${dockerDigest}`)

      // Now get the blob from ipfs.
      // TODO: this should of course be done efficiently by not reading everything into memory first.
      const data = uint8arrays.concat(await all(this.ipfs.cat(ipfsCid)))

      // Pin it so we keep it in storage.
      // TODO: sometime in the future (tm) we should unpin them so storage doesn't grow indefinitely.
      debug('pinning ipfs cid %s', ipfsCid)
      await this.ipfs.pin.add(ipfsCid)

      // sanity check.
      const hash = crypto.createHash('sha256')
      hash.update(data)
      const dockerDigestActual = `sha256:${hash.digest('hex')}`
      if (dockerDigest !== dockerDigestActual) {
        throw new Error('mismatching digests from ipfs')
      }

      return Buffer.from(data) // TODO: data may be uint8array which express doesnt like, so convert it here.
    }
    return null
  }

  async hasBlob (org, name, digest) {
    const blobs = this.blobStore(org)
    const result = await blobs?.get(digest)
    return !!result
  }

  async _putBlob (org, name, data) {
    // Calculate digest.
    const hash = crypto.createHash('sha256')
    hash.update(data)
    const dockerDigest = `sha256:${hash.digest('hex')}`

    // Add to IPFS and get CID.
    const ipfsAdded = await this.ipfs.add(data)
    const ipfsCid = ipfsAdded.cid.toString()
    debug(`stored blob in IPFS with CID ${ipfsCid} and digest ${dockerDigest}`)

    // Store the mapping between digest and cid in hyperdrive for that org.
    const blobs = this.blobStore(org)
    if (blobs) {
      await blobs.put(dockerDigest, ipfsCid)
    } else {
      throw new Error('tried to put blob into non-existing (thus not writable) org')
    }

    return dockerDigest
  }

  async getManifest (org, name, tagOrDigest) {
    let manifests = this.manifestStore(org, name)
    if (!manifests) {
      // try to get new manifest store for this pubkey.
      // TODO: how is this affected if pubkey doesn't exist? sync is slow? etc.
      debug(`we did not have hyperbee for org ${org}, so we try to sync it now.`)
      const { key, bee } = await getHyperbee(org)
      const initialSyncSettle = INITIAL_SYNC_SETTLE
      debug('storing reference to hyperbee for key %s. Allowing %d seconds for initial sync.',
        key, initialSyncSettle)
      this.hyperbees.set(key, bee)
      await this.settings.addSubscribedFeed(org)
      manifests = this.manifestStore(org, name)
      await new Promise(resolve => setTimeout(resolve, initialSyncSettle * 1000))
      debug('Finished waiting for initial sync of %s.', key)
    }

    // Check if we got a tag or a digest.
    let manifestDigest = tagOrDigest
    if (!tagOrDigest.startsWith('sha256:')) {
      // Find by tag. Perform following lookup org[tag] -> dockerdigest -> org[dockerdigest] -> ipfs cid
      debug('looking up manifest by tag for tag %s', tagOrDigest)
      const manifestDigestNode = await manifests.get(tagOrDigest)
      manifestDigest = manifestDigestNode?.value
      debug(`got manifest for ${org}/${name}:${tagOrDigest} returned digest ${manifestDigest}`)
    }

    if (manifestDigest) {
      // We now know the digest to use. Grab it!
      const data = await this.getBlob(org, name, manifestDigest)
      if (data !== null) {
        // TODO: don't calculate this here? verify at all?
        const hash = crypto.createHash('sha256')
        hash.update(data)
        const digest = `sha256:${hash.digest('hex')}`
        return { digest, data }
      }
    }
    return { digest: null, data: null }
  }

  async putManifest (org, name, tag, data) {
    assert.ok(Buffer.isBuffer(data))

    // Store the manifest as a blob itself inside ipfs, the KV mapping is
    // tag-name -> dockerdigest (!)
    const digest = await this._putBlob(org, name, data)

    const manifests = this.manifestStore(org, name)
    if (manifests) {
      await manifests.put(tag, digest)
      debug(`stored manifest for ${org}/${name}:${tag} as digest ${digest}`)
    } else {
      throw new Error('tried to put manifest into non-existing (thus not writable) org')
    }

    return digest
  }

  async newUpload (org, name) {
    const uuid = uuidv4()
    const u = new Map()
    u.set('data', Buffer.alloc(0))
    this.uploadStore.set(uuid, u)
    return uuid
  }

  async patchUpload (org, name, uuid, data) {
    if (!this.uploadStore.has(uuid)) {
      throw new Error('no such uuid')
    }

    this.uploadStore.get(uuid).set('data', Buffer.concat([this.uploadStore.get(uuid).get('data'), data]))
    return this.uploadStore.get(uuid).get('data').length
  }

  async putUpload (org, name, uuid, data) {
    if (!this.uploadStore.has(uuid)) {
      throw new Error('no such uuid')
    }

    this.uploadStore.get(uuid).set('data', Buffer.concat([this.uploadStore.get(uuid).get('data'), data]))
    const uploaded = this.uploadStore.get(uuid).get('data').length

    const digest = await this._putBlob(org, name, this.uploadStore.get(uuid).get('data'))

    debug(`Concluding upload ${uuid}`)
    this.uploadStore.delete(uuid)
    return { digest, uploaded }
  }

  async init () {
    // may require a "ipfs id" in terminal after ctrl-c for unknown reason.
    await setup()
    this.ipfs = getIpfsClient()

    // now initalize a hyperbee (our own, writable)
    const { key, bee } = await getOwnHyperbee()
    this.hyperbees.set(key, bee)

    // get our own settings bee.
    const { bee: settingsBee } = await getSettingsHyperbee()
    this.settings = new Settings(settingsBee)

    // get a list of previously subscribed feeds, and start listening for them too.
    const feeds = await this.settings.getSubscribedFeeds()
    for (const feed of feeds) {
      if (!this.hyperbees.has(feed)) {
        debug(`loading prev subscribed feed ${feed}.`)
      }
      const { key, bee } = await getHyperbee(feed)
      this.hyperbees.set(key, bee)
    }
    console.log(`Loaded ${feeds.length} previously subscribed feeds.`)
  }

  async getMyPubKey () {
    // Returns the first hyperbee that is writable, or null.
    for (const [key, bee] of this.hyperbees) {
      if (bee.feed.writable) {
        return key
      }
    }
    return null
  }
}

export default DistributedStorage
