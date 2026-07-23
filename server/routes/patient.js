import { ipDigest } from '../auth.js'

const notFound = {
  error: {
    code: 'NOT_FOUND',
    message: 'The requested item was not found.',
  },
}

const idParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
}

export default async function patientRoutes(app, { store, config, now }) {
  const audited = async (request, action, objectType = null, objectId = null) => {
    await store.addAudit({
      actorType: 'patient',
      actorId: request.patient.id,
      action,
      objectType,
      objectId,
      occurredAt: now(),
      requestId: request.id,
      ipDigest: ipDigest(config.sessionPepper, request.ip),
      userAgent: request.headers['user-agent'],
    })
  }

  app.get('/api/me', { preHandler: app.authenticate }, async (request) => {
    await audited(request, 'portal.profile_viewed')
    return {
      patient: {
        displayName: request.patient.displayName,
        patientNumber: request.patient.patientNumber,
      },
    }
  })

  app.get('/api/me/dashboard', { preHandler: app.authenticate }, async (request) => {
    const dashboard = await store.getDashboard(request.patient.id, now())
    await audited(request, 'portal.dashboard_viewed')
    return dashboard
  })

  app.get(
    '/api/me/appointments',
    {
      preHandler: app.authenticate,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            scope: { type: 'string', enum: ['upcoming', 'past'], default: 'upcoming' },
          },
        },
      },
    },
    async (request) => {
      const appointments = await store.listAppointments(
        request.patient.id,
        request.query.scope,
        now(),
      )
      await audited(request, 'portal.appointments_listed')
      return { appointments }
    },
  )

  app.get(
    '/api/me/appointments/:id',
    { preHandler: app.authenticate, schema: { params: idParams } },
    async (request, reply) => {
      const appointment = await store.getAppointment(request.patient.id, request.params.id)
      if (!appointment) return reply.code(404).send(notFound)
      await audited(request, 'portal.appointment_viewed', 'appointment', appointment.id)
      return { appointment }
    },
  )

  app.get('/api/me/records', { preHandler: app.authenticate }, async (request) => {
    const records = await store.listRecords(request.patient.id)
    await audited(request, 'portal.records_listed')
    return { records }
  })

  app.get(
    '/api/me/records/:id',
    { preHandler: app.authenticate, schema: { params: idParams } },
    async (request, reply) => {
      const record = await store.getRecord(request.patient.id, request.params.id)
      if (!record) return reply.code(404).send(notFound)
      await audited(request, 'portal.record_viewed', 'clinical_record', record.id)
      return { record }
    },
  )

  app.get(
    '/api/me/treatment-plan',
    { preHandler: app.authenticate },
    async (request) => {
      const treatmentPlan = await store.getTreatmentPlan(request.patient.id)
      await audited(
        request,
        'portal.treatment_plan_viewed',
        treatmentPlan ? 'treatment_plan' : null,
        treatmentPlan?.id || null,
      )
      return { treatmentPlan }
    },
  )
}
