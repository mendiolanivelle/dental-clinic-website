import { ipDigest, sha256 } from '../auth.js'

const idParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
}

const manilaDate = (date) =>
  new Date(date.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 10)

const imageSignatures = {
  'image/jpeg': (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/webp': (bytes) => bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP',
}

const decodeImage = ({ imageBase64, imageMimeType, imageOriginalName }) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) || imageBase64.length % 4 !== 0) return null
  const bytes = Buffer.from(imageBase64, 'base64')
  if (!bytes.length || bytes.length > 5 * 1024 * 1024 || !imageSignatures[imageMimeType]?.(bytes)) return null
  const originalName = imageOriginalName
    .split(/[\\/]/u)
    .at(-1)
    .replace(/[^a-zA-Z0-9_. ()-]/gu, '_')
    .slice(0, 160) || 'prescription-image'
  return { bytes, originalName }
}

export default async function dentistRoutes(app, { store, config, now }) {
  const requireDentist = async (request, reply) => {
    await app.authenticateStaff(request, reply)
    if (reply.sent) return
    if (request.staff.role !== 'dentist') {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'This account does not have dentist access.' },
      })
    }
    if (!request.staff.dentistId) {
      return reply.code(403).send({
        error: { code: 'DENTIST_PROFILE_INCOMPLETE', message: 'This dentist account is not linked to a clinical profile.' },
      })
    }
  }

  const audit = async (request, action, objectType = null, objectId = null) => {
    await store.addAudit({
      actorType: 'staff',
      actorId: request.staff.id,
      action,
      objectType,
      objectId,
      occurredAt: now(),
      requestId: request.id,
      ipDigest: ipDigest(config.sessionPepper, request.ip),
      userAgent: request.headers['user-agent'],
    })
  }

  app.get('/api/dentist/dashboard', { preHandler: requireDentist }, async (request) => {
    const dashboard = await store.getDentistDashboard(request.staff.dentistId, manilaDate(now()))
    await audit(request, 'dentist.dashboard_viewed')
    return dashboard
  })

  app.get(
    '/api/dentist/patients',
    {
      preHandler: requireDentist,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['q'],
          properties: { q: { type: 'string', maxLength: 100 } },
        },
      },
    },
    async (request) => {
      const patients = await store.searchDentistPatients(request.staff.dentistId, request.query.q.trim())
      await audit(request, 'dentist.patient_directory_searched')
      return { patients }
    },
  )

  app.get(
    '/api/dentist/patients/:id',
    { preHandler: requireDentist, schema: { params: idParams } },
    async (request, reply) => {
      const chart = await store.getDentistPatient(request.staff.dentistId, request.params.id)
      if (!chart) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That patient record was not found.' } })
      }
      await audit(request, 'dentist.patient_chart_viewed', 'patient', request.params.id)
      return chart
    },
  )

  app.post(
    '/api/dentist/patients/:id/prescriptions',
    {
      preHandler: requireDentist,
      bodyLimit: 7 * 1024 * 1024,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['prescribedOn', 'genericName', 'instructions', 'imageMimeType', 'imageOriginalName', 'imageBase64'],
          properties: {
            prescribedOn: { type: 'string', format: 'date' },
            genericName: { type: 'string', minLength: 1, maxLength: 240 },
            instructions: { type: 'string', minLength: 1, maxLength: 2000 },
            imageMimeType: { type: 'string', enum: Object.keys(imageSignatures) },
            imageOriginalName: { type: 'string', minLength: 1, maxLength: 255 },
            imageBase64: { type: 'string', minLength: 4, maxLength: 7_000_000 },
          },
        },
      },
    },
    async (request, reply) => {
      const image = decodeImage(request.body)
      if (!image || request.body.prescribedOn > manilaDate(now())) {
        return reply.code(400).send({
          error: { code: 'INVALID_PRESCRIPTION_IMAGE', message: 'Upload a valid JPEG, PNG, or WebP image up to 5 MB.' },
        })
      }
      const id = await store.createDentistPrescription({
        dentistId: request.staff.dentistId,
        staffId: request.staff.id,
        patientId: request.params.id,
        prescribedOn: request.body.prescribedOn,
        genericName: request.body.genericName.trim(),
        instructions: request.body.instructions.trim(),
        imageMimeType: request.body.imageMimeType,
        imageOriginalName: image.originalName,
        imageBytes: image.bytes,
        imageSha256: sha256(image.bytes),
        now: now(),
      })
      if (!id) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That patient record was not found.' } })
      }
      await audit(request, 'dentist.prescription_uploaded', 'prescription', id)
      return reply.code(201).send({ prescriptionId: id })
    },
  )

  app.get(
    '/api/dentist/prescriptions/:id/image',
    { preHandler: requireDentist, schema: { params: idParams } },
    async (request, reply) => {
      const image = await store.getDentistPrescriptionImage(request.staff.dentistId, request.params.id)
      if (!image) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That prescription image was not found.' } })
      }
      await audit(request, 'dentist.prescription_image_viewed', 'prescription', request.params.id)
      return reply
        .type(image.mimeType)
        .header('content-disposition', `inline; filename="${image.originalName}"`)
        .send(image.bytes)
    },
  )

  app.post(
    '/api/dentist/patients/:id/follow-ups',
    {
      preHandler: requireDentist,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['recommendedOn'],
          properties: {
            recommendedOn: { type: 'string', format: 'date' },
            appointmentTypeId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
            notes: { type: 'string', maxLength: 1000 },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.body.recommendedOn < manilaDate(now())) {
        return reply.code(400).send({ error: { code: 'INVALID_DATE', message: 'Choose today or a future date.' } })
      }
      const id = await store.createDentistFollowUp({
        dentistId: request.staff.dentistId,
        staffId: request.staff.id,
        patientId: request.params.id,
        appointmentTypeId: request.body.appointmentTypeId || null,
        recommendedOn: request.body.recommendedOn,
        notes: request.body.notes?.trim() || null,
        now: now(),
      })
      if (!id) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That patient or service was not found.' } })
      }
      await audit(request, 'dentist.follow_up_recommended', 'follow_up_recommendation', id)
      return reply.code(201).send({ followUpId: id })
    },
  )
}
