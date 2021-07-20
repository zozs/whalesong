import request from 'supertest'
import tap from 'tap'
import { setupApp } from '../lib/api.js'
import DistributedStorage from '../lib/distributed-storage.js'

tap.test('init', async tapinit => {
  console.debug('Initializing storage provider for test')
  const storage = new DistributedStorage()
  await storage.init()

  tapinit.test('api basics', async t => {
    // Stop storage provider when done to avoid hang.
    t.teardown(async () => await storage.shutdown())
    const koaApp = await setupApp(storage, '<irrelevant host>', '<irrelevant port>')
    const app = koaApp.callback()

    let res = await request(app)
      .get('/')
      .expect(200)
    t.equal(res.text, 'Hello World!', 'Root route is greeting folks')

    // Since we're in debug mode, we should be able to get an URL.
    res = await request(app)
      .get('/whalesong/mypubkey')
      .expect(200)
    t.match(res.text, /^[0-9a-f]{64}$/, 'own pubkey is 32 bytes long and in hex')
    const myPubKey = res.text

    // Getting a non-existing blob for an existing pubkey should return 404.
    const randomBlob = 'sha256:ff786fa4831a6d0652b81874417a1440848f06b22dc3b4ac380f16f3f15f1935'
    res = await request(app)
      .get(`/v2/${myPubKey}/nosuchrepo/blobs/${randomBlob}`)
    t.match(res.status, 404, 'non-existing blob for an existing pubkey should return 404')

    // Getting a non-existing blob for a non-existing pubkey should return 404.
    const randomPubkey = '11c5a22d849f712ebda1f9f1c5a729b87d7381e079864ceea2769138412c4428'
    res = await request(app)
      .get(`/v2/${randomPubkey}/somerepo/blobs/${randomBlob}`)
    t.match(res.status, 404, 'non-existing blob for a non-existing pubkey should return 404')
  })
})
