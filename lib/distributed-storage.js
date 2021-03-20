/*
 * Distributed (hyperbee(hypercore) + ipfs) based storage.
 *
 * Hyperbee is used to store the mutable state, i.e. tags and manifests. It also stores
 * mappings between docker digests and ipfs digests.
 *
 * IPFS is used to store immutable blobs, such as the layers themselves.
 */

import crypto from 'crypto'
import Debug from 'debug'
import { getHyperbee, getOwnHyperbee, getSettingsHyperbee, getIpfsClient, setup, shutdown } from './distributed-clients.js'
import Settings from './settings.js'
import UploadStore from './upload-store.js'
import { pipeline as pipelineCb, PassThrough } from 'stream'
import { pipeline } from 'stream/promises'

const debug = Debug('whalesong:storage')

// After syncing a new hyperbee, wait for a couple of seconds to allow for an initial sync.
// This is to avoid whalesong to return 404 Not Found for a manifest even though it actually exists.
// TODO: actually detect if we have synced something, and then stop waiting to avoid unnecessary wait,
// or wait even a bit longer if nothing has been synced yet.
const INITIAL_SYNC_SETTLE = 10

class DistributedStorage {
  constructor () {
    this.ipfs = null
    this.hyperbees = new Map()
    this.uploadStore = new UploadStore()
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
    // TODO: should we make an initial sync here too just like for manifests if org. does not exist?
    if (blobs) {
      const blobObjectNode = await blobs.get(dockerDigest)
      const blobObject = blobObjectNode?.value

      if (!blobObject) {
        return { stream: null, size: null, contentType: null }
      }

      const { contentType, size } = blobObject
      const ipfsCid = blobObject.locations[0] // currently, support only ipfs cid and a single location for every blob

      debug(`retrieving blob stream from IPFS with CID ${ipfsCid}, based on digest ${dockerDigest}. size ${size}, content type: ${contentType}`)

      // Now get the blob from ipfs.
      const data = this.ipfs.cat(ipfsCid)

      // Pin it so we keep it in storage.
      // TODO: sometime in the future (tm) we should unpin them so storage doesn't grow indefinitely.
      debug('pinning ipfs cid %s', ipfsCid)
      await this.ipfs.pin.add(ipfsCid)

      // skip sanity check here, we trust that we have stored the correct hash in ipfs.
      const pass = new PassThrough()
      const hash = crypto.createHash('sha256')
      pipelineCb(
        data,
        async function * (source) {
          for await (const chunk of source) {
            hash.update(chunk)
            yield chunk
          }
        },
        pass,
        (err) => {
          if (err) {
            console.error('Error in get blob stream pipeline:', err)
            return
          }
          // Trust but verify: we will return the digest we got (manifestDigest) as the digest of
          // the data, but will verify the digest in the background and log any mismatch.
          const actual = `sha256:${hash.digest('hex')}`
          if (actual !== dockerDigest) {
            console.error(`Mismatching digest when fetching from IPFS, expected ${dockerDigest}, actual ${actual}`)
          }
        }
      )
      return { stream: pass, size, contentType }
    }
    return { stream: null, size: null, contentType: null }
  }

  async hasBlob (org, name, digest) {
    const blobs = this.blobStore(org)
    const blobObjectNode = await blobs?.get(digest)
    if (blobObjectNode) {
      const { contentType, size } = blobObjectNode?.value
      return { contentType, size }
    }
    return { contentType: null, size: null }
  }

  async _putBlob (org, name, stream, contentType) {
    // hook into the stream to calculate the digest as data flows to ipfs.
    const hash = crypto.createHash('sha256')
    const pass = new PassThrough()
    let streamSize = 0

    const pipe = pipeline(
      stream,
      async function * (source) {
        for await (const chunk of source) {
          hash.update(chunk)
          streamSize += chunk.byteLength
          yield chunk
        }
      },
      pass
    )

    // Add to IPFS and get CID.
    const [, ipfsAdded] = await Promise.all([pipe, this.ipfs.add(pass)])
    const ipfsCid = ipfsAdded.cid.toString()
    const digest = `sha256:${hash.digest('hex')}`
    debug(`stored blob in IPFS with CID ${ipfsCid} and digest ${digest}`)

    // Store the mapping between digest and cid in hyperdrive for that org.
    const blobs = this.blobStore(org)
    if (blobs) {
      const blobObject = {
        size: streamSize,
        contentType,
        locations: [ipfsCid]
      }
      await blobs.put(digest, blobObject)
    } else {
      throw new Error('tried to put blob into non-existing (thus not writable) org')
    }

    return digest
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
      // Find by tag. Perform following lookup org[tag] -> { digest: dockerdigest } -> org[dockerdigest] -> ipfs cid
      debug('looking up manifest by tag for tag %s', tagOrDigest)
      const manifestDigestNode = await manifests.get(tagOrDigest)
      manifestDigest = manifestDigestNode?.value?.digest
      debug(`got manifest for ${org}/${name}:${tagOrDigest} returned digest ${manifestDigest}`)
    }

    if (manifestDigest) {
      // We now know the digest to use. Grab it!
      const { stream, size, contentType } = await this.getBlob(org, name, manifestDigest)
      if (stream != null) {
        return { digest: manifestDigest, stream, size, contentType }
      }
    }
    return { digest: null, stream: null, size: null, contentType: null }
  }

  async hasManifest (org, name, tagOrDigest) {
    let manifests = this.manifestStore(org, name)
    if (!manifests) {
      // TODO: should we even do this for a HEAD? I think yes but i'm not sure. if yes, break out to separate function.
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
      // Find by tag. Perform following lookup org[tag] -> { digest: dockerdigest } -> org[dockerdigest] -> ipfs cid
      debug('looking up manifest by tag for tag %s', tagOrDigest)
      const manifestDigestNode = await manifests.get(tagOrDigest)
      manifestDigest = manifestDigestNode?.value?.digest
      debug(`got manifest for ${org}/${name}:${tagOrDigest} returned digest ${manifestDigest}`)
    }

    if (manifestDigest) {
      // We now know the digest to use. Grab it!
      const { size, contentType } = await this.hasBlob(org, name, manifestDigest)
      if (size != null) {
        return { digest: manifestDigest, size, contentType }
      }
    }
    return { digest: null, size: null, contentType: null }
  }

  async putManifest (org, name, tag, stream, contentType) {
    // Store the manifest as a blob itself inside ipfs, the KV mapping is
    // tag-name -> { digest: dockerdigest } (i.e., not ipfs cid as for blobs)
    const digest = await this._putBlob(org, name, stream, contentType)

    const manifests = this.manifestStore(org, name)
    if (manifests) {
      await manifests.put(tag, { digest })
      debug(`stored manifest for ${org}/${name}:${tag} as digest ${digest} with contentType ${contentType}`)
    } else {
      throw new Error('tried to put manifest into non-existing (thus not writable) org')
    }

    return digest
  }

  async newUpload (org, name) {
    return this.uploadStore.newUpload()
  }

  async patchUpload (org, name, uuid, stream) {
    return this.uploadStore.appendUpload(uuid, stream)
  }

  async putUpload (org, name, uuid, inStream) {
    const uploaded = await this.uploadStore.appendUpload(uuid, inStream)
    const stream = await this.uploadStore.getUpload(uuid)
    const digest = await this._putBlob(org, name, stream, null) // TODO: content-type for regular blobs too?

    debug(`Concluding upload ${uuid}`)
    this.uploadStore.finishUpload(uuid)
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

    // init upload store
    await this.uploadStore.init()
  }

  async shutdown () {
    console.debug('Shutting down storage')
    await shutdown()
    console.debug('Shut down complete')
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
