import { setupApp } from './lib/api.js'
import DistributedStorage from './lib/distributed-storage.js'

async function main () {
  const host = process.env.WHALESONG_HOST || 'localhost'
  const port = process.env.WHALESONG_PORT || '5005'
  const hostport = `http://${host}:${port}`
  const externalUrl = process.env.WHALESONG_EXTERNAL_URL || hostport

  console.log('Initializing storage provider. Please wait.')
  const storage = new DistributedStorage()
  await storage.init()
  const app = await setupApp(storage, host, port, externalUrl)

  app.listen(port, host, () => {
    console.log(`Whalesong listening at ${externalUrl}`)
  })
}

main().catch(e => console.error(`top-level exception: ${e} json: ${JSON.stringify(e)}`))
