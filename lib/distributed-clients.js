import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
import IPFSCtl from 'ipfsd-ctl'
import Debug from 'debug'
import hypercore from 'hypercore'
import Hyperbee from 'hyperbee'
import replicator from '@hyperswarm/replicator'

const debug = Debug('whalesong:clients')

const clients = new Map()

async function baseDir () {
  const baseDir = path.join(
    os.homedir(),
    '.whalesong'
  )
  await fs.mkdir(baseDir, { recursive: true })
  return baseDir
}

export async function setup () {
  // TODO: init hyperdrive and ipfs in parallell for speedup.
  await setupIpfsClient()
  // await setupHyperbeeClient()
}

async function setupIpfsClient () {
  const require = createRequire(import.meta.url)

  const ipfsd = await IPFSCtl.createController({
    ipfsHttpModule: require('ipfs-http-client'),
    ipfsBin: require('go-ipfs').path(),
    disposable: false,
    ipfsOptions: {
      repo: path.join(await baseDir(), 'ipfs')
    }
  })
  debug(`ipfsd initialized?: ${ipfsd.initialized}`)
  if (!ipfsd.initialized) {
    await ipfsd.init()
    debug(`initialized ipfsd: ${ipfsd.initialized}`)
  }
  debug(`ipfsd started?: ${ipfsd.started}`)
  if (!ipfsd.started) {
    await ipfsd.start()
    debug(`started ipfsd: ${ipfsd.started}`)
  }
  const id = await ipfsd.api.id()
  debug('IPFS daemon initialized, it has id %j', id)

  clients.set('ipfsd', ipfsd)

  // TODO: add sigint/sigterm handler here to gracefully shut down?
}

async function setupHyperbeeClient (pubKey) {
  // Setup a hyperbee instance for a given public key. If no key is given, use the default
  // core with name "whalesong", which will also store our own (writable) feed.

  // TODO: verify that feed (if given) is really a pubkey and doesnt contain slashes/dots/or stuff.
  let feed = pubKey
  if (pubKey === undefined) {
    feed = 'own'
  }
  const corePath = path.join(await baseDir(), 'hypercores', feed)

  let core
  if (pubKey === undefined) {
    core = hypercore(corePath, { sparse: true })
  } else {
    core = hypercore(corePath, pubKey, { sparse: true })
  }

  const bee = new Hyperbee(core, {
    keyEncoding: 'utf-8',
    valueEncoding: 'utf-8'
  })
  await bee.ready()
  const key = bee.feed.key.toString('hex')
  debug('Create hyperbee client with feed %s. feed writable: %s', key, bee.feed.writable)

  // start replicating feed.
  replicator(bee.feed, { announce: true, lookup: true, live: true })
  debug('Started replicating feed.')

  return {
    key,
    bee
  }
}

export function getIpfsClient () {
  return clients.get('ipfsd').api
}

export async function getHyperbee (pubKey) {
  return setupHyperbeeClient(pubKey)
}

export async function getOwnHyperbee () {
  return setupHyperbeeClient()
}
