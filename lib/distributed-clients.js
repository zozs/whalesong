import fs from 'fs/promises'
import path from 'path'
import { createRequire } from 'module'
import IPFSCtl from 'ipfsd-ctl'
import Debug from 'debug'
import Hyperbee from 'hyperbee'
import { Client as HyperspaceClient, Server as HyperspaceServer } from 'hyperspace'
import { baseDir } from './utils.js'

const debug = Debug('whalesong:clients')

const clients = new Map()

export async function setup () {
  // TODO: init hyperbees and ipfs in parallell for speedup.
  await setupIpfsClient()
  await setupHyperspaceServer()
  await setupHyperspaceClient()
}

export async function shutdown () {
  debug('shutting down ipfsd')
  await clients.get('ipfsd')?.stop()
  debug('shutting down hyperspace corestore')
  await clients.get('corestore')?.close()
  debug('shutting down hyperspace client')
  await clients.get('hyperspace-client')?.close()
  debug('shutting down hyperspace server')
  await clients.get('hyperspace-server')?.stop()
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

async function setupHyperspaceServer () {
  const server = new HyperspaceServer({
    storage: path.join(await baseDir(), 'hyperspace'),
    host: 'whalesong-hyperspace'
  })
  await server.ready()

  clients.set('hyperspace-server', server)
}

async function setupHyperspaceClient () {
  const client = new HyperspaceClient({
    host: 'whalesong-hyperspace'
  })

  await client.ready()
  debug('hyperspace client is now ready')

  clients.set('hyperspace-client', client)
  clients.set('corestore', client.corestore('whalesong'))
}

async function setupHyperbeeClient (feedOrPubKey, shouldReplicate) {
  const corestore = clients.get('corestore')
  let core

  if (feedOrPubKey === 'settings') {
    core = corestore.default()
  } else if (feedOrPubKey === null) {
    core = corestore.get() // creates a new hypercore
  } else if (feedOrPubKey.match(/^[0-9a-fA-F]{64}$/)) {
    core = corestore.get(feedOrPubKey)
  } else {
    debug(`invalid feed or pubkey given, got: ${feedOrPubKey}`)
    throw new Error(`invalid feed or pubkey given, got: ${feedOrPubKey}`)
  }

  const bee = new Hyperbee(core, {
    keyEncoding: 'utf-8',
    valueEncoding: 'json'
  })

  // start replicating core.
  if (shouldReplicate) {
    await clients.get('hyperspace-client').replicate(bee.feed)
    debug('Started replicating feed')
  }

  await bee.ready()
  const key = bee.feed.key.toString('hex')
  debug('Created hyperbee client with feed %s. feed writable: %s', key, bee.feed.writable)

  return {
    key,
    bee
  }
}

export function getIpfsClient () {
  return clients.get('ipfsd').api
}

export async function getHyperbee (pubKey) {
  return setupHyperbeeClient(pubKey, true)
}

export async function getSettingsHyperbee () {
  return setupHyperbeeClient('settings', false)
}

export async function getNewHyperbee () {
  return setupHyperbeeClient(null, true)
}
