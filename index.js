import Debug from 'debug'
import express from 'express'
import DistributedStorage from './lib/distributed-storage.js'

const app = express()
const debug = Debug('whalesong:index')

const host = process.env.WHALESONG_HOST || 'localhost'
const port = process.env.WHALESONG_PORT || '5005'
const hostport = `http://${host}:${port}`

async function setUpApp () {
  debug('Initializing storage provider')
  const storage = new DistributedStorage()
  await storage.init()

  app.use(express.raw({ type: () => true, limit: 1024 * 1024 * 1024 })) // max 1 GiB chunk

  app.get('/', (req, res) => {
    res.send('Hello World!')
  })

  app.get('/v2/', (req, res) => {
    res.send('{}')
  })

  app.post('/v2/:org/:name/blobs/uploads/', async (req, res) => {
    const { org, name } = req.params
    const uuid = await storage.newUpload(org, name)

    debug('Creating temporary upload')

    res.set('Location', `${hostport}/v2/${org}/${name}/blobs/uploads/${uuid}`)
    res.set('Range', '0-0')
    res.sendStatus(202)
  })

  app.patch('/v2/:org/:name/blobs/uploads/:uuid', async (req, res) => {
    const { org, name, uuid } = req.params
    const uploaded = await storage.patchUpload(org, name, uuid, req.body)

    debug(`UUID ${uuid} now has ${uploaded} bytes.`)
    res.set('Location', `${hostport}/v2/${org}/${name}/blobs/uploads/${uuid}`)
    res.set('Range', `0-${uploaded}`)
    res.sendStatus(202)
  })

  app.put('/v2/:org/:name/blobs/uploads/:uuid', async (req, res) => {
    const { org, name, uuid } = req.params
    const expectedDigest = req.query.digest
    const { digest, uploaded } = await storage.putUpload(org, name, uuid, req.body)

    debug(`UUID ${uuid} now has ${uploaded} bytes after finish.`)
    if (expectedDigest !== digest) {
      console.warn(`expected digest ${expectedDigest} did not match actual digest ${digest}`)
      res.sendStatus(400)
    } else {
      console.log(`Finished uploading blob with digest ${digest}, for UUID ${uuid}`)
      res.set('Docker-Content-Digest', digest)
      res.set('Location', `${hostport}/v2/${org}/${name}/blobs/${digest}`)
      res.sendStatus(204)
    }
  })

  app.head('/v2/:org/:name/blobs/:digest', async (req, res) => {
    const { org, name, digest } = req.params
    if (await storage.hasBlob(org, name, digest)) {
      console.debug(`Blob with digest ${digest} exists.`)
      res.set('Docker-Content-Digest', digest)
      res.sendStatus(200)
    } else {
      console.debug(`Blob with digest ${digest} does not exists.`)
      res.sendStatus(404)
    }
  })

  app.get('/v2/:org/:name/blobs/:digest', async (req, res) => {
    const { org, name, digest } = req.params
    const data = await storage.getBlob(org, name, digest)
    if (data !== null) {
      console.debug(`Retrieving blob with digest ${digest}.`)
      res.set('Docker-Content-Digest', digest)
      res.send(data)
    } else {
      console.debug(`Blob with digest ${digest} does not exists.`)
      res.sendStatus(404)
    }
  })

  app.head('/v2/:org/:name/manifests/:tag', async (req, res) => {
    const { org, name, tag } = req.params
    const { digest } = await storage.getManifest(org, name, tag)
    if (digest !== null) {
      res.set('Docker-Content-Digest', digest)
      res.sendStatus(200)
    } else {
      console.debug(`Manifest with tag ${tag} does not exist`)
      res.sendStatus(404)
    }
  })

  app.get('/v2/:org/:name/manifests/:tag', async (req, res) => {
    const { org, name, tag } = req.params
    const { digest, data } = await storage.getManifest(org, name, tag)
    if (digest !== null) {
      console.debug(`Retrieving manifest with digest ${digest}`)
      res.set('Docker-Content-Digest', digest)
      res.set('Content-Type', 'application/vnd.docker.distribution.manifest.v2+json')
      res.send(data)
    } else {
      console.debug(`Manifest with tag ${tag} does not exist`)
      res.sendStatus(404)
    }
  })

  app.put('/v2/:org/:name/manifests/:tag', async (req, res) => {
    const { org, name, tag } = req.params
    const digest = await storage.putManifest(org, name, tag, req.body)

    console.log(`Stored manifest ${org}/${name}:${tag} with digest ${digest}`)

    res.set('Docker-Content-Digest', digest)
    res.set('Location', `${hostport}/v2/${org}/${name}/manifests/${digest}`)
    res.sendStatus(201)
  })

  app.listen(port, () => {
    console.log(`Whalesong listening at ${hostport}`)
  })
}

setUpApp().catch(e => console.error(`top-level exception: ${e} json: ${JSON.stringify(e)}`))
