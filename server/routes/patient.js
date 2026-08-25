import { ipDigest, normalizePhone } from '../auth.js'

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

const appointmentRequestBody = {
  type: 'object',
  additionalProperties: false,
  required: ['appointmentTypeId', 'dentistId', 'startsAt'],
  properties: {
    appointmentTypeId: { type: 'string', format: 'uuid' },
    dentistId: { type: 'string', format: 'uuid' },
    startsAt: { type: 'string', format: 'date-time' },
    patientNote: { type: 'string', maxLength: 1000 },
  },
}

const availabilityQuery = {
  type: 'object',
  additionalProperties: false,
  required: ['date'],
  properties: {
    date: { type: 'string', format: 'date' },
  },
}

const manilaDate = (date) => new Date(date.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 10)

export default async function patientRoutes(app, { store, config, now, prescriptionStorage }) {
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
        phone: request.patient.phone,
      },
    }
  })

  app.patch(
    '/api/me/profile',
    {
      preHandler: app.authenticate,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['phone'],
          properties: {
            phone: { type: 'string', minLength: 10, maxLength: 32, pattern: '^[+0-9 ()-]+$' },
          },
        },
      },
    },
    async (request, reply) => {
      const phoneDigits = normalizePhone(request.body.phone)
      if (!phoneDigits) {
        return reply.code(400).send({
          error: { code: 'INVALID_PHONE', message: 'Enter a valid Philippine mobile number.' },
        })
      }
      const phone = await store.updatePatientPhone(
        request.patient.id,
        `+${phoneDigits}`,
        now(),
      )
      if (!phone) return reply.code(404).send(notFound)
      await audited(request, 'portal.phone_updated', 'patient', request.patient.id)
      return { patient: { ...request.patient, phone } }
    },
  )

  app.get('/api/me/dashboard', { preHandler: app.authenticate }, async (request) => {
    const dashboard = await store.getDashboard(request.patient.id, now())
    await audited(request, 'portal.dashboard_viewed')
    return dashboard
  })

  app.get('/api/me/services', { preHandler: app.authenticate }, async (request) => {
    const services = await store.listServices()
    await audited(request, 'portal.services_listed')
    return { services }
  })

  app.get('/api/me/appointment-requests', { preHandler: app.authenticate }, async (request) => {
    const appointmentRequests = await store.listAppointmentRequests(request.patient.id)
    await audited(request, 'portal.appointment_requests_listed')
    return { appointmentRequests }
  })

  app.get(
    '/api/me/availability',
    { preHandler: app.authenticate, schema: { querystring: availabilityQuery } },
    async (request, reply) => {
      if (request.query.date < manilaDate(now())) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_DATE',
            message: 'Please choose today or a future date.',
          },
        })
      }
      const slots = await store.listAvailability(request.query.date, now())
      await audited(request, 'portal.availability_viewed')
      return {
        date: request.query.date,
        timezone: 'Asia/Manila',
        slotMinutes: 60,
        slots,
      }
    },
  )

  app.post(
    '/api/me/appointment-requests',
    { preHandler: app.authenticate, schema: { body: appointmentRequestBody } },
    async (request, reply) => {
      const { appointmentTypeId, dentistId, startsAt, patientNote = '' } = request.body

      const appointmentRequest = await store.createAppointmentRequest({
        patientId: request.patient.id,
        appointmentTypeId,
        dentistId,
        startsAt,
        patientNote: patientNote.trim() || null,
        now: now(),
      })
      if (!appointmentRequest) {
        return reply.code(409).send({
          error: {
            code: 'SLOT_UNAVAILABLE',
            message: 'That appointment time is no longer available. Please choose another slot.',
          },
        })
      }

      await audited(
        request,
        'portal.appointment_request_created',
        'appointment_request',
        appointmentRequest.id,
      )
      return reply.code(201).send({ appointmentRequest })
    },
  )

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
      const [appointments, followUps] = await Promise.all([
        store.listAppointments(request.patient.id, request.query.scope, now()),
        request.query.scope === 'upcoming'
          ? store.listPatientFollowUps(request.patient.id)
          : Promise.resolve([]),
      ])
      await audited(request, 'portal.appointments_listed')
      return { appointments, followUps: followUps.filter(({ status }) => status === 'pending') }
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
    const [records, prescriptions, followUps] = await Promise.all([
      store.listRecords(request.patient.id),
      store.listPatientPrescriptions(request.patient.id),
      store.listPatientFollowUps(request.patient.id),
    ])
    await audited(request, 'portal.records_listed')
    return { records, prescriptions, followUps }
  })

  app.get(
    '/api/me/prescriptions/:id/image',
    { preHandler: app.authenticate, schema: { params: idParams } },
    async (request, reply) => {
      const image = await store.getPatientPrescriptionImage(request.patient.id, request.params.id)
      if (!image) return reply.code(404).send(notFound)
      const bytes = image.driveFileId
        ? await prescriptionStorage.download(image.driveFileId)
        : image.bytes
      await audited(request, 'portal.prescription_image_viewed', 'prescription', request.params.id)
      return reply
        .type(image.mimeType)
        .header('content-disposition', `inline; filename="${image.originalName}"`)
        .send(bytes)
    },
  )

  app.get('/api/me/billing', { preHandler: app.authenticate }, async (request) => {
    const charges = await store.listPatientBilling(request.patient.id)
    await audited(request, 'portal.billing_listed')
    return { charges }
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
