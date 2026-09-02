import sharp from 'sharp'
import { ipDigest, sha256 } from '../auth.js'
import { normalizeSocialImage, SocialBlockedError } from '../social-publishing.js'

const idParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
}

const completionParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'appointmentId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    appointmentId: { type: 'string', format: 'uuid' },
  },
}

const availabilityQuery = {
  type: 'object', additionalProperties: false, required: ['date'],
  properties: { date: { type: 'string', format: 'date' } },
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
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || !imageSignatures[imageMimeType]?.(bytes)) return null
  const originalName = imageOriginalName
    .split(/[\\/]/u)
    .at(-1)
    .replace(/[^a-zA-Z0-9_. ()-]/gu, '_')
    .slice(0, 160) || 'prescription-image'
  return { bytes, originalName }
}

const socialContentTypes = [
  'clinic_team', 'educational', 'facility_equipment', 'patient_portrait',
  'before_after', 'intraoral_clinical', 'other',
]
const patientSocialContent = new Set(['patient_portrait', 'before_after', 'intraoral_clinical'])
const heicSignature = (bytes) => bytes.subarray(4, 8).toString() === 'ftyp'
  && /^(?:heic|heix|hevc|hevx|mif1)$/u.test(bytes.subarray(8, 12).toString())
const socialImageSignatures = {
  ...imageSignatures,
  'image/heic': heicSignature,
  'image/heif': heicSignature,
}
export const MAX_SOCIAL_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024

export const decodeSocialImage = ({ imageBase64, imageMimeType, imageOriginalName }) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(imageBase64) || imageBase64.length % 4 !== 0) return null
  const bytes = Buffer.from(imageBase64, 'base64')
  if (!bytes.length || bytes.length > MAX_SOCIAL_SOURCE_IMAGE_BYTES || !socialImageSignatures[imageMimeType]?.(bytes)) return null
  return {
    bytes,
    originalName: imageOriginalName.split(/[\\/]/u).at(-1).replace(/[^a-zA-Z0-9_. ()-]/gu, '_').slice(0, 160) || 'clinic-photo',
  }
}

export async function combineSocialImages(images) {
  const [left, right] = await Promise.all(images.map(async (image) => ({
    bytes: image,
    metadata: await sharp(image).metadata(),
  })))
  const leftWidth = left.metadata.width || 1
  const rightWidth = right.metadata.width || 1
  const height = Math.max(left.metadata.height || 1, right.metadata.height || 1)
  const composite = await sharp({
    create: { width: leftWidth + rightWidth, height, channels: 3, background: '#ffffff' },
  }).composite([
    { input: left.bytes, left: 0, top: Math.floor((height - (left.metadata.height || height)) / 2) },
    { input: right.bytes, left: leftWidth, top: Math.floor((height - (right.metadata.height || height)) / 2) },
  ]).jpeg({ quality: 84, progressive: true }).toBuffer()
  return normalizeSocialImage(composite)
}

export default async function dentistRoutes(app, {
  store, config, now, prescriptionStorage, socialStorage, socialPublisher,
}) {
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

  const placeImage = async (prescription) => {
    if (!prescription || !prescriptionStorage) return prescription
    const driveFileId = await prescriptionStorage.upload({
      bytes: prescription.imageBytes,
      mimeType: prescription.imageMimeType,
    })
    return { ...prescription, driveFileId, imageBytes: null }
  }

  const cleanupImage = async (prescription) => {
    if (prescription?.driveFileId) await prescriptionStorage.remove(prescription.driveFileId)
  }

  app.get('/api/dentist/dashboard', { preHandler: requireDentist }, async (request) => {
    const dashboard = await store.getDentistDashboard(request.staff.dentistId, manilaDate(now()), now())
    await audit(request, 'dentist.dashboard_viewed')
    return dashboard
  })

  app.get('/api/dentist/availability', {
    preHandler: requireDentist,
    schema: { querystring: availabilityQuery },
  }, async (request, reply) => {
    if (request.query.date < manilaDate(now())) {
      return reply.code(400).send({ error: { code: 'INVALID_DATE', message: 'Choose today or a future date.' } })
    }
    const slots = (await store.listAvailability(request.query.date, now()))
      .filter(({ dentistId }) => dentistId === request.staff.dentistId)
    await audit(request, 'dentist.availability_viewed')
    return { date: request.query.date, timezone: 'Asia/Manila', slotMinutes: 60, slots }
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
      const patients = await store.searchDentistPatients(request.staff.dentistId, request.query.q.trim(), now())
      await audit(request, 'dentist.patient_directory_searched')
      return { patients }
    },
  )

  app.get(
    '/api/dentist/patients/:id',
    { preHandler: requireDentist, schema: { params: idParams } },
    async (request, reply) => {
      const chart = await store.getDentistPatient(request.staff.dentistId, request.params.id, now())
      if (!chart) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That patient record was not found.' } })
      }
      await audit(request, 'dentist.patient_chart_viewed', 'patient', request.params.id)
      return chart
    },
  )

  app.post(
    '/api/dentist/patients/:id/appointments/:appointmentId/complete',
    {
      preHandler: requireDentist,
      bodyLimit: 3 * 1024 * 1024,
      schema: {
        params: completionParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['proposedFeeCents', 'prescription', 'followUp'],
          properties: {
            proposedFeeCents: { type: 'integer', minimum: 1, maximum: 100_000_000 },
            prescription: {
              anyOf: [
                { type: 'null' },
                {
                  type: 'object',
                  additionalProperties: false,
                  required: ['prescribedOn', 'genericName', 'instructions', 'imageMimeType', 'imageOriginalName', 'imageBase64'],
                  properties: {
                    prescribedOn: { type: 'string', format: 'date' },
                    genericName: { type: 'string', minLength: 1, maxLength: 240 },
                    instructions: { type: 'string', minLength: 1, maxLength: 2000 },
                    imageMimeType: { type: 'string', enum: Object.keys(imageSignatures) },
                    imageOriginalName: { type: 'string', minLength: 1, maxLength: 255 },
                    imageBase64: { type: 'string', minLength: 4, maxLength: 2_800_000 },
                  },
                },
              ],
            },
            followUp: {
              anyOf: [
                { type: 'null' },
                {
                  type: 'object',
                  additionalProperties: false,
                  required: ['startsAt', 'appointmentTypeId'],
                  properties: {
                    startsAt: { type: 'string', format: 'date-time' },
                    appointmentTypeId: { type: 'string', format: 'uuid' },
                    notes: { type: 'string', maxLength: 1000 },
                  },
                },
              ],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const today = manilaDate(now())
      let prescription = null
      if (request.body.prescription) {
        const image = decodeImage(request.body.prescription)
        const genericName = request.body.prescription.genericName.trim()
        const instructions = request.body.prescription.instructions.trim()
        if (!image || !genericName || !instructions || request.body.prescription.prescribedOn > today) {
          return reply.code(400).send({
            error: { code: 'INVALID_PRESCRIPTION', message: 'Upload a valid prescription photo up to 2 MB.' },
          })
        }
        prescription = {
          prescribedOn: request.body.prescription.prescribedOn,
          genericName,
          instructions,
          imageMimeType: request.body.prescription.imageMimeType,
          imageOriginalName: image.originalName,
          imageBytes: image.bytes,
          imageByteSize: image.bytes.length,
          imageSha256: sha256(image.bytes),
        }
      }

      const followUp = request.body.followUp
        ? {
            startsAt: request.body.followUp.startsAt,
            appointmentTypeId: request.body.followUp.appointmentTypeId,
            notes: request.body.followUp.notes?.trim() || null,
          }
        : null
      prescription = await placeImage(prescription)

      let result
      try {
        result = await store.completeDentistVisit({
          appointmentId: request.params.appointmentId,
          patientId: request.params.id,
          dentistId: request.staff.dentistId,
          staffId: request.staff.id,
          proposedFeeCents: request.body.proposedFeeCents,
          prescription,
          followUp,
          now: now(),
        })
      } catch (error) {
        await cleanupImage(prescription)
        throw error
      }
      if (result.outcome === 'not_found') {
        await cleanupImage(prescription)
        return reply.code(409).send({
          error: { code: 'VISIT_NOT_READY', message: 'This visit is already done or is not ready to finish.' },
        })
      }
      if (result.outcome === 'invalid_service') {
        await cleanupImage(prescription)
        return reply.code(400).send({
          error: { code: 'INVALID_SERVICE', message: 'Choose a valid follow-up service.' },
        })
      }
      if (result.outcome === 'slot_unavailable') {
        await cleanupImage(prescription)
        return reply.code(409).send({
          error: { code: 'SLOT_UNAVAILABLE', message: 'That follow-up hour is no longer available. Choose another time.' },
        })
      }
      await audit(request, 'dentist.visit_finished', 'appointment', request.params.appointmentId)
      return { completed: true }
    },
  )

  app.post(
    '/api/dentist/patients/:id/prescriptions',
    {
      preHandler: requireDentist,
      bodyLimit: 3 * 1024 * 1024,
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
            imageBase64: { type: 'string', minLength: 4, maxLength: 2_800_000 },
          },
        },
      },
    },
    async (request, reply) => {
      const image = decodeImage(request.body)
      if (!image || request.body.prescribedOn > manilaDate(now())) {
        return reply.code(400).send({
          error: { code: 'INVALID_PRESCRIPTION_IMAGE', message: 'Upload a valid JPEG, PNG, or WebP image up to 2 MB.' },
        })
      }
      const placedImage = await placeImage({
        imageMimeType: request.body.imageMimeType,
        imageBytes: image.bytes,
      })
      let id
      try {
        id = await store.createDentistPrescription({
          dentistId: request.staff.dentistId,
          staffId: request.staff.id,
          patientId: request.params.id,
          prescribedOn: request.body.prescribedOn,
          genericName: request.body.genericName.trim(),
          instructions: request.body.instructions.trim(),
          imageMimeType: placedImage.imageMimeType,
          imageOriginalName: image.originalName,
          imageBytes: placedImage.imageBytes,
          imageByteSize: image.bytes.length,
          driveFileId: placedImage.driveFileId || null,
          imageSha256: sha256(image.bytes),
          now: now(),
        })
      } catch (error) {
        await cleanupImage(placedImage)
        throw error
      }
      if (!id) {
        await cleanupImage(placedImage)
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
      const bytes = image.driveFileId
        ? await prescriptionStorage.download(image.driveFileId)
        : image.bytes
      await audit(request, 'dentist.prescription_image_viewed', 'prescription', request.params.id)
      return reply
        .type(image.mimeType)
        .header('content-disposition', `inline; filename="${image.originalName}"`)
        .send(bytes)
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
          required: ['startsAt', 'appointmentTypeId'],
          properties: {
            startsAt: { type: 'string', format: 'date-time' },
            appointmentTypeId: { type: 'string', format: 'uuid' },
            notes: { type: 'string', maxLength: 1000 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await store.createDentistFollowUp({
        dentistId: request.staff.dentistId,
        patientId: request.params.id,
        appointmentTypeId: request.body.appointmentTypeId,
        startsAt: request.body.startsAt,
        notes: request.body.notes?.trim() || null,
        now: now(),
      })
      if (result.outcome === 'not_found') {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That patient or service was not found.' } })
      }
      if (result.outcome === 'slot_unavailable') {
        return reply.code(409).send({ error: { code: 'SLOT_UNAVAILABLE', message: 'That hour is no longer available. Choose another time.' } })
      }
      await audit(request, 'dentist.follow_up_scheduled', 'appointment', result.id)
      return reply.code(201).send({ appointmentId: result.id })
    },
  )

  app.get('/api/dentist/social/patients', {
    preHandler: requireDentist,
    schema: {
      querystring: {
        type: 'object', additionalProperties: false, required: ['q'],
        properties: { q: { type: 'string', maxLength: 100 } },
      },
    },
  }, async (request) => {
    const patients = await store.searchDentistSocialPatients(request.staff.dentistId, request.query.q.trim())
    await audit(request, 'dentist.social_patient_directory_searched')
    return { patients }
  })

  app.get('/api/dentist/social/posts', { preHandler: requireDentist }, async (request) => {
    const [posts, settings] = await Promise.all([
      store.listSocialPosts({ staffId: request.staff.id, limit: 100 }),
      store.getSocialSettings(),
    ])
    await audit(request, 'dentist.social_posts_viewed')
    return {
      posts,
      publishing: {
        configured: Boolean(socialPublisher?.configured),
        enabled: settings.automaticPublishingEnabled,
        pageName: settings.page?.status === 'connected' ? settings.page.name : null,
        patientPostsEnabled: settings.patientPostsEnabled,
        minorPostsEnabled: settings.minorPostsEnabled,
      },
    }
  })

  app.post('/api/dentist/social/posts', {
    preHandler: requireDentist,
    bodyLimit: 28 * 1024 * 1024,
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['submissionId', 'contentType', 'description'],
        anyOf: [{ required: ['image'] }, { required: ['images'] }],
        properties: {
          submissionId: { type: 'string', format: 'uuid' },
          contentType: { type: 'string', enum: socialContentTypes },
          description: { type: 'string', minLength: 2, maxLength: 2000 },
          patientId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
          image: {
            type: 'object', additionalProperties: false,
            required: ['imageBase64', 'imageMimeType', 'imageOriginalName'],
            properties: {
              imageBase64: { type: 'string', minLength: 4, maxLength: 28_000_000 },
              imageMimeType: { type: 'string', enum: Object.keys(socialImageSignatures) },
              imageOriginalName: { type: 'string', minLength: 1, maxLength: 255 },
            },
          },
          images: {
            type: 'array', minItems: 2, maxItems: 2,
            items: {
              type: 'object', additionalProperties: false,
              required: ['imageBase64', 'imageMimeType', 'imageOriginalName'],
              properties: {
                imageBase64: { type: 'string', minLength: 4, maxLength: 28_000_000 },
                imageMimeType: { type: 'string', enum: Object.keys(socialImageSignatures) },
                imageOriginalName: { type: 'string', minLength: 1, maxLength: 255 },
              },
            },
          },
          consent: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object', additionalProperties: false,
                required: ['evidence', 'coversPublicSocialMedia', 'coversAiProcessing', 'subjectIsMinor', 'grantedAt'],
                properties: {
                  evidence: { type: 'string', minLength: 2, maxLength: 500 },
                  coversPublicSocialMedia: { type: 'boolean' },
                  coversAiProcessing: { type: 'boolean' },
                  subjectIsMinor: { type: 'boolean' },
                  guardianName: { anyOf: [{ type: 'string', maxLength: 160 }, { type: 'null' }] },
                  grantedAt: { type: 'string', format: 'date-time' },
                },
              },
            ],
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!socialStorage || !socialPublisher?.configured) {
      return reply.code(503).send({ error: { code: 'SOCIAL_NOT_CONFIGURED', message: 'Automatic social publishing is not configured yet. Ask the super admin to finish setup.' } })
    }
    const settings = await store.getSocialSettings()
    if (!settings.automaticPublishingEnabled || settings.page?.status !== 'connected') {
      return reply.code(409).send({ error: { code: 'PUBLISHING_DISABLED', message: 'Automatic Facebook publishing is currently disabled or disconnected.' } })
    }
    const description = request.body.description.trim()
    const patientPost = patientSocialContent.has(request.body.contentType)
    if (patientPost && !settings.patientPostsEnabled) return reply.code(400).send({ error: { code: 'PATIENT_POSTS_DISABLED', message: 'Patient-related Facebook posts are disabled by the super admin.' } })
    const consent = patientPost ? {
      evidence: 'Dentist confirmed signed patient or guardian paper consent is on file.',
      coversPublicSocialMedia: true, coversAiProcessing: true,
      subjectIsMinor: false, guardianName: null, grantedAt: now(),
    } : null
    const incomingImages = request.body.images || [request.body.image]
    if (request.body.contentType === 'before_after' && incomingImages.length !== 2) return reply.code(400).send({ error: { code: 'TWO_IMAGES_REQUIRED', message: 'Before-and-after posts require both photos.' } })
    if (request.body.contentType !== 'before_after' && incomingImages.length !== 1) return reply.code(400).send({ error: { code: 'ONE_IMAGE_REQUIRED', message: 'Choose one photo for this post.' } })
    const decodedImages = incomingImages.map(decodeSocialImage)
    if (decodedImages.some((image) => !image)) return reply.code(400).send({ error: { code: 'INVALID_IMAGE', message: 'Upload a valid JPEG, PNG, or WebP photo up to 20 MB.' } })
    let normalized
    try {
      const normalizedImages = await Promise.all(decodedImages.map(({ bytes }) => normalizeSocialImage(bytes)))
      normalized = normalizedImages.length === 2 ? await combineSocialImages(normalizedImages) : normalizedImages[0]
    } catch (error) {
      if (error instanceof SocialBlockedError) return reply.code(400).send({ error: { code: 'INVALID_IMAGE', message: error.message } })
      return reply.code(400).send({ error: { code: 'INVALID_IMAGE', message: 'The selected image could not be safely processed.' } })
    }
    const driveFileId = await socialStorage.upload({ bytes: normalized, mimeType: 'image/jpeg', prefix: 'social-original' })
    let result
    try {
      result = await store.createSocialPost({
        dentistId: request.staff.dentistId,
        staffId: request.staff.id,
        patientId: null,
        contentType: request.body.contentType,
        description,
        image: {
          driveFileId,
          mimeType: 'image/jpeg',
          originalName: decodedImages.length === 2 ? 'before-and-after.jpg' : decodedImages[0].originalName.replace(/\.[^.]+$/u, '').slice(0, 156) + '.jpg',
          sha256: sha256(normalized),
        },
        idempotencyKey: request.body.submissionId,
        consent,
        now: now(),
      })
    } catch (error) {
      await socialStorage.remove(driveFileId)
      throw error
    }
    if (result.outcome !== 'created') {
      await socialStorage.remove(driveFileId)
      if (result.outcome === 'patient_not_found') {
        return reply.code(404).send({ error: { code: 'PATIENT_NOT_FOUND', message: 'That patient is not part of your clinical history.' } })
      }
      return reply.code(202).send({ postId: result.id, duplicate: true })
    }
    await audit(request, 'dentist.social_post_confirmed', 'social_post', result.id)
    socialPublisher.wake()
    return reply.code(202).send({ postId: result.id, status: 'confirmed' })
  })

  app.get('/api/dentist/social/posts/:id/image', {
    preHandler: requireDentist, schema: { params: idParams },
  }, async (request, reply) => {
    const image = await store.getSocialPostImage({ id: request.params.id, staffId: request.staff.id })
    if (!image || !socialStorage) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That post image was not found.' } })
    const bytes = await socialStorage.download(image.driveFileId, 2 * 1024 * 1024)
    await audit(request, 'dentist.social_post_image_viewed', 'social_post', request.params.id)
    return reply.type(image.mimeType).send(bytes)
  })
}
