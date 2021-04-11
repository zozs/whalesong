import { setupApp } from './lib/api.js'
import DistributedStorage from './lib/distributed-storage.js'

async function main () {
  const host = process.env.WHALESONG_HOST || 'localhost'
  const port = process.env.WHALESONG_PORT || '5005'
  const hostport = `http://${host}:${port}`

  console.log('Initializing storage provider. Please wait.')
  const storage = new DistributedStorage()
  await storage.init()
  const app = await setupApp(storage, host, port)

  app.listen(port, host, () => {
    console.log(`Whalesong listening at ${hostport}`)
  })
}

main().catch(e => console.error(`top-level exception: ${e} json: ${JSON.stringify(e)}`))
