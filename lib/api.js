import DatDns from 'dat-dns'
import Debug from 'debug'
import Koa from 'koa'
import Router from '@koa/router'
import { addDebugRoutes } from './debug-routes.js'
import DistributedStorage from './distributed-storage.js'

const debug = Debug('whalesong:api')

export async function setupApp (storage, host, port, externalUrl) {
  const app = new Koa()
  const router = new Router()

  const myPubKey = await storage.getMyPubKey()
  const myBaseUrl = `${host}:${port}/${myPubKey}`
  console.log('Initialization complete. To tag and push images, use the following URL:')
  console.log(`${myBaseUrl}/<name>:<tag>`)

  const whalesongDns = DatDns({
    hashRegex: /^[0-9a-f]{64}?$/i,
    recordName: 'whalesong',
    protocolRegex: /^whalesong:\/\/([0-9a-f]{64})/i,
    txtRegex: /^"?whalesongkey=([0-9a-f]{64})"?$/i
  })

  const lookupOrg = async (ctx, org) => {
    try {
      return await whalesongDns.resolveName(org)
    } catch (e) {
      debug(`Got dat-dns exception, assuming 404: ${e}`)
      ctx.throw(404, 'Could not find public key from domain name.')
    }
  }

  router.get('/', (ctx) => {
    ctx.body = 'Hello World!'
  })

  router.get('/v2/', (ctx) => {
    ctx.body = {}
  })

  router.post('/v2/:org/:name/blobs/uploads/', async (ctx) => {
    const { org, name } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const uuid = await storage.newUpload(pubKey, name)

    debug('Creating temporary upload')

    ctx.set('Location', `${externalUrl}/v2/${org}/${name}/blobs/uploads/${uuid}`)
    ctx.set('Range', '0-0')
    ctx.status = 202
  })

  router.patch('/v2/:org/:name/blobs/uploads/:uuid', async (ctx) => {
    const { org, name, uuid } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const uploaded = await storage.patchUpload(pubKey, name, uuid, ctx.req)

    debug(`UUID ${uuid} now has ${uploaded} bytes.`)
    ctx.set('Location', `${externalUrl}/v2/${org}/${name}/blobs/uploads/${uuid}`)
    ctx.set('Range', `0-${uploaded - 1}`) // Range is inclusive, so should be one less than the upload count.
    ctx.status = 202
  })

  router.put('/v2/:org/:name/blobs/uploads/:uuid', async (ctx) => {
    const { org, name, uuid } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const expectedDigest = ctx.query.digest
    const { digest, uploaded } = await storage.putUpload(pubKey, name, uuid, ctx.req)

    debug(`UUID ${uuid} now has ${uploaded} bytes after finish.`)
    if (expectedDigest !== digest) {
      ctx.throw(400, `Expected digest ${expectedDigest} did not match actual digest ${digest}`)
    } else {
      console.log(`Finished uploading blob with digest ${digest}, for UUID ${uuid}`)
      ctx.set('Docker-Content-Digest', digest)
      ctx.set('Location', `${externalUrl}/v2/${org}/${name}/blobs/${digest}`)
      ctx.status = 201
    }
  })

  router.head('/v2/:org/:name/blobs/:digest', async (ctx) => {
    const { org, name, digest } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const { size } = await storage.hasBlob(pubKey, name, digest)
    if (size != null) {
      console.debug(`Blob with digest ${digest} exists.`)
      ctx.body = null
      ctx.set('Docker-Content-Digest', digest)
      ctx.set('Content-Length', size)
      ctx.status = 200
    } else {
      console.debug(`Blob with digest ${digest} does not exists (head).`)
      ctx.throw(404, 'Not found')
    }
  })

  router.get('/v2/:org/:name/blobs/:digest', async (ctx) => {
    const { org, name, digest } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const { stream } = await storage.getBlob(pubKey, name, digest)
    if (stream != null) {
      console.debug(`Retrieving blob with digest ${digest}.`)
      ctx.body = stream
      ctx.set('Docker-Content-Digest', digest)
    } else {
      console.debug(`Blob with digest ${digest} does not exists.`)
      ctx.throw(404, 'Not found')
    }
  })

  router.head('/v2/:org/:name/manifests/:tag', async (ctx) => {
    const { org, name, tag } = ctx.params
    debug(`Client requested (HEAD) (org,name,tag): (${org}, ${name}, ${tag})`)
    const pubKey = await lookupOrg(ctx, org)
    debug(`Found pubkey ${pubKey} from org ${org}`)
    const { digest, size, contentType } = await storage.hasManifest(pubKey, name, tag)
    debug(`hasManifest returned digest and size ${digest} size ${size}`)
    if (digest != null) {
      ctx.body = null
      ctx.set('Docker-Content-Digest', digest)
      ctx.set('Content-Length', size)
      ctx.set('Content-Type', contentType)
      ctx.status = 200
    } else {
      console.debug(`Manifest with tag ${tag} does not exist (head)`)
      ctx.throw(404, 'Not found')
    }
  })

  router.get('/v2/:org/:name/manifests/:tag', async (ctx) => {
    const { org, name, tag } = ctx.params
    debug(`Client requested (GET) (org,name,tag): (${org}, ${name}, ${tag})`)
    const pubKey = await lookupOrg(ctx, org)
    debug(`Found pubkey ${pubKey} from org ${org}`)
    const { digest, stream, contentType } = await storage.getManifest(pubKey, name, tag)
    debug(`getManifest returned digest ${digest} stream ${stream}`)
    if (digest != null) {
      console.debug(`Retrieving manifest with digest ${digest}`)
      ctx.body = stream
      ctx.set('Docker-Content-Digest', digest)
      if (contentType != null) {
        ctx.set('Content-Type', contentType)
      }
    } else {
      console.debug(`Manifest with tag ${tag} does not exist`)
      ctx.throw(404, 'Not found')
    }
  })

  router.put('/v2/:org/:name/manifests/:tag', async (ctx) => {
    const { org, name, tag } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const digest = await storage.putManifest(pubKey, name, tag, ctx.req, ctx.request.type)

    console.log(`Stored manifest ${org}/${name}:${tag} with digest ${digest}`)

    ctx.status = 201
    ctx.set('Docker-Content-Digest', digest)
    ctx.set('Location', `${externalUrl}/v2/${org}/${name}/manifests/${digest}`)
  })

  // Only expose debug routes when explicitly requested.
  if (process.env.WHALESONG_DEBUG_ROUTES) {
    addDebugRoutes(router, myBaseUrl, myPubKey)
  }

  app.use(router.routes())

  return app
}
