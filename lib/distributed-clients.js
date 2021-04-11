import fs from 'fs/promises'
import path from 'path'
import { createRequire } from 'module'
import IPFSCtl from 'ipfsd-ctl'
import Debug from 'debug'
import hypercore from 'hypercore'
import Hyperbee from 'hyperbee'
import Replicator from '@hyperswarm/replicator'
import { baseDir } from './utils.js'

const debug = Debug('whalesong:clients')

const clients = new Map()

export async function setup () {
  // TODO: init hyperbees and ipfs in parallell for speedup.
  await setupIpfsClient()
  await setupReplicator()
}

export async function shutdown () {
  debug('shutting down ipfsd')
  await clients.get('ipfsd')?.stop()
  debug('shutting down replicator')
  await clients.get('replicator')?.destroy()
  debug('shutdown finished')
}

async function setupIpfsClient () {
  const require = createRequire(import.meta.url)

  const ipfsd = await IPFSCtl.createController({
    ipfsHttpModule: require('ipfs-http-client'),
    ipfsBin: require('go-ipfs').path(),
    disposable: false,
    forceKillTimeout: 10000,
    ipfsOptions: {
      repo: path.join(await baseDir(), 'ipfs'),
      config: {
        Addresses: {
          Gateway: '' // disable gateway since it is quite common for people to have stuff listening on port 8080.
        }
      }
    }
  })
  debug(`ipfsd initialized?: ${ipfsd.initialized}`)
  if (!ipfsd.initialized) {
    await ipfsd.init()
    debug(`initialized ipfsd: ${ipfsd.initialized}`)
  }

  try {
    debug(`ipfsd started?: ${ipfsd.started}`)
    if (!ipfsd.started) {
      await ipfsd.start()
      debug(`started ipfsd: ${ipfsd.started}`)
    }
    const id = await ipfsd.api.id()
    debug('IPFS daemon initialized, it has id %j', id)
  } catch (e) {
    // On an unclean shutdown, IPFS may refuse to start.
    // Removing the api file in the ipfs repo seems to solve it, heh.
    // (alternatively, you can run "IPFS_PATH=~/.whalesong/ipfs ipfs id" which solves it)
    if (e.message.includes('ECONNREFUSED')) {
      // try to remove api file and then try starting again. If that fails too we just give up.
      const apiFilePath = path.join(ipfsd.path, 'api')
      debug('removing ipfs api file path since we couldnt start on first try. deleting %s', apiFilePath)
      await fs.unlink(apiFilePath)

      await ipfsd.start()
      debug(`started ipfsd: ${ipfsd.started}`)

      const id = await ipfsd.api.id()
      debug('IPFS daemon initialized, it has id %j', id)
    } else {
      throw e
    }
  }

  clients.set('ipfsd', ipfsd)

  // TODO: add sigint/sigterm handler here to gracefully shut down?
}

async function setupReplicator () {
  const r = new Replicator()
  clients.set('replicator', r)
}

async function setupHyperbeeClient (feed, pubKey, shouldReplicate) {
  // Setup a hyperbee instance for a given public key. If no key is given, use the default
  // core with name "own", which will also store our own (writable) feed.

  // TODO: verify that feed (if given) is really a pubkey and doesnt contain slashes/dots/or stuff.
  const corePath = path.join(await baseDir(), 'hypercores', feed)

  // TODO: to sparse, or not to sparse, that is the question.
  const core = hypercore(corePath, pubKey)
  // const core = hypercore(corePath, pubKey, { sparse: true })

  const bee = new Hyperbee(core, {
    keyEncoding: 'utf-8',
    valueEncoding: 'json'
  })
  await bee.ready()
  const key = bee.feed.key.toString('hex')
  debug('Create hyperbee client with feed %s. feed writable: %s', key, bee.feed.writable)

  // start replicating feed.
  if (shouldReplicate) {
    await clients.get('replicator').add(bee.feed, { announce: true, lookup: true, live: true })
    debug('Started replicating feed.')
  }

  return {
    key,
    bee
  }
}

async function setupHyperbeeClientPubkey (pubKey) {
  return setupHyperbeeClient(pubKey, pubKey, true)
}

async function setupHyperbeeClientSpecialFeed (feed, shouldReplicate) {
  return setupHyperbeeClient(feed, undefined, shouldReplicate)
}

export function getIpfsClient () {
  return clients.get('ipfsd').api
}

export async function getHyperbee (pubKey) {
  return setupHyperbeeClientPubkey(pubKey)
}

export async function getOwnHyperbee () {
  return setupHyperbeeClientSpecialFeed('own', true)
}

export async function getSettingsHyperbee () {
  return setupHyperbeeClientSpecialFeed('settings', false)
}
