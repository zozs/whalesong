export function addDebugRoutes (router, myBaseUrl, myPubKey) {
  router.get('/whalesong/mypubkey', async (ctx) => {
    ctx.body = myPubKey
  })

  router.get('/whalesong/url', async (ctx) => {
    ctx.body = myBaseUrl
  })
}
