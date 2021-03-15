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

    const res = await request(app)
      .get('/')
      .expect(200)
    t.equal(res.text, 'Hello World!', 'Root route is greeting folks')

    // TODO: Getting a non-existing blob should return 404.
  })
})
