import DatDns from 'dat-dns'
import Debug from 'debug'
import Koa from 'koa'
import Router from '@koa/router'
import DistributedStorage from './lib/distributed-storage.js'
import { pipeline } from 'stream/promises'

const debug = Debug('whalesong:index')

const host = process.env.WHALESONG_HOST || 'localhost'
const port = process.env.WHALESONG_PORT || '5005'
const hostport = `http://${host}:${port}`

async function setUpApp () {
  const app = new Koa()
  const router = new Router()

  console.log('Initializing storage provider. Please wait.')
  const storage = new DistributedStorage()
  await storage.init()
  const myPubKey = await storage.getMyPubKey()
  console.log('Initialization complete. To tag and push images, use the following URL:')
  console.log(`${host}:${port}/${myPubKey}/<name>:<tag>`)

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

    ctx.set('Location', `${hostport}/v2/${org}/${name}/blobs/uploads/${uuid}`)
    ctx.set('Range', '0-0')
    ctx.status = 202
  })

  router.patch('/v2/:org/:name/blobs/uploads/:uuid', async (ctx) => {
    const { org, name, uuid } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const uploaded = await storage.patchUpload(pubKey, name, uuid, ctx.req)

    debug(`UUID ${uuid} now has ${uploaded} bytes.`)
    ctx.set('Location', `${hostport}/v2/${org}/${name}/blobs/uploads/${uuid}`)
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
      ctx.set('Location', `${hostport}/v2/${org}/${name}/blobs/${digest}`)
      ctx.status = 201
    }
  })

  router.head('/v2/:org/:name/blobs/:digest', async (ctx) => {
    const { org, name, digest } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    if (await storage.hasBlob(pubKey, name, digest)) {
      console.debug(`Blob with digest ${digest} exists.`)
      // TODO: ugly hack to get length, in the future, store length + content type in hyperbee
      const dataStream = await storage.getBlob(pubKey, name, digest)
      let contentLength = 0
      await pipeline(
        dataStream,
        async function * (source) {
          for await (const chunk of source) {
            contentLength += chunk.byteLength
          }
        }
      )
      ctx.body = null
      ctx.set('Docker-Content-Digest', digest)
      ctx.set('Content-Length', contentLength)
      ctx.set('Content-Type', 'application/vnd.docker.image.rootfs.diff.tar.gzip')
      ctx.status = 200
    } else {
      console.debug(`Blob with digest ${digest} does not exists (head).`)
      ctx.throw(404, 'Not found')
    }
  })

  router.get('/v2/:org/:name/blobs/:digest', async (ctx) => {
    const { org, name, digest } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const dataStream = await storage.getBlob(pubKey, name, digest)
    if (dataStream !== null) {
      console.debug(`Retrieving blob with digest ${digest}.`)
      ctx.body = dataStream
      ctx.set('Docker-Content-Digest', digest)
      ctx.set('Content-Type', 'application/vnd.docker.image.rootfs.diff.tar.gzip')
    } else {
      console.debug(`Blob with digest ${digest} does not exists.`)
      ctx.throw(404, 'Not found')
    }
  })

  router.head('/v2/:org/:name/manifests/:tag', async (ctx) => {
    const { org, name, tag } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const { digest, stream } = await storage.getManifest(pubKey, name, tag)
    if (digest !== null) {
      let contentLength = 0
      await pipeline(
        stream,
        async function * (source) {
          for await (const chunk of source) {
            contentLength += chunk.byteLength
          }
        }
      )

      ctx.body = null
      ctx.set('Docker-Content-Digest', digest)
      ctx.set('Content-Length', contentLength)
      ctx.set('Content-Type', 'application/vnd.docker.distribution.manifest.v2+json')
      ctx.status = 200
    } else {
      console.debug(`Manifest with tag ${tag} does not exist (head)`)
      ctx.throw(404, 'Not found')
    }
  })

  router.get('/v2/:org/:name/manifests/:tag', async (ctx) => {
    const { org, name, tag } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const { digest, stream } = await storage.getManifest(pubKey, name, tag)
    if (digest !== null) {
      console.debug(`Retrieving manifest with digest ${digest}`)
      ctx.body = stream
      ctx.set('Docker-Content-Digest', digest)
      ctx.set('Content-Type', 'application/vnd.docker.distribution.manifest.v2+json')
    } else {
      console.debug(`Manifest with tag ${tag} does not exist`)
      ctx.throw(404, 'Not found')
    }
  })

  router.put('/v2/:org/:name/manifests/:tag', async (ctx) => {
    const { org, name, tag } = ctx.params
    const pubKey = await lookupOrg(ctx, org)
    const digest = await storage.putManifest(pubKey, name, tag, ctx.req)

    console.log(`Stored manifest ${org}/${name}:${tag} with digest ${digest}`)

    ctx.status = 201
    ctx.set('Docker-Content-Digest', digest)
    ctx.set('Location', `${hostport}/v2/${org}/${name}/manifests/${digest}`)
  })

  app.use(router.routes())

  app.listen(port, host, () => {
    console.log(`Whalesong listening at ${hostport}`)
  })
}

setUpApp().catch(e => console.error(`top-level exception: ${e} json: ${JSON.stringify(e)}`))
