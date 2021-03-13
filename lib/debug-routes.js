export function addDebugRoutes (router, myBaseUrl) {
  router.get('/whalesong/url', async (ctx) => {
    ctx.body = myBaseUrl
  })
}
