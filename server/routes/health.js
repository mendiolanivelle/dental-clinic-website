export default async function healthRoutes(app, { store }) {
  app.get('/api/health', async (_request, reply) => {
    try {
      await store.health()
      return { status: 'ok', database: 'ready' }
    } catch {
      return reply.code(503).send({ status: 'unavailable', database: 'unavailable' })
    }
  })
}
