import { ipDigest, normalizeName } from '../auth.js'
import { resolveAdminPeriod } from '../admin-period.js'
import { hashStaffPassword } from '../staff-auth.js'

const socialImageSignatures = {
  'image/jpeg': (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/webp': (bytes) => bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP',
}

const decodeSocialImage = ({ imageBase64, imageMimeType }) => {
  if (!imageBase64 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(imageBase64) || imageBase64.length % 4 !== 0) return null
  const bytes = Buffer.from(imageBase64, 'base64')
  return bytes.length && bytes.length <= 2 * 1024 * 1024 && socialImageSignatures[imageMimeType]?.(bytes) ? bytes : null
}

const idParams = {
  type: 'object', additionalProperties: false, required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
}

const analyticsQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    from: { type: 'string', format: 'date' },
    to: { type: 'string', format: 'date' },
    compare: { type: 'string', enum: ['previous_period', 'previous_month', 'year_over_year', 'none'] },
    dentistId: { type: 'string', format: 'uuid' },
    serviceId: { type: 'string', format: 'uuid' },
  },
}

const staffPassword = { type: 'string', pattern: '^[0-9]{8,72}$' }

const accountBody = (dentist) => ({
  type: 'object',
  additionalProperties: false,
  required: ['displayName', 'password'],
  properties: {
    displayName: { type: 'string', minLength: 2, maxLength: 160 },
    password: staffPassword,
    ...(dentist ? { specialty: { type: 'string', maxLength: 120 } } : {}),
  },
})

const publicAccount = ({ id, displayName, role, active, dentistId = null, dentistName = null, specialty = null, createdAt = null, lastLoginAt = null }) => ({
  id, displayName, role, active, dentistId, dentistName, specialty, createdAt, lastLoginAt,
})

export default async function adminRoutes(app, {
  store, config, now, randomBytes, randomUUID, socialStorage, socialPublisher,
}) {
  const requireAdmin = async (request, reply) => {
    await app.authenticateStaff(request, reply)
    if (reply.sent) return
    if (request.staff.role !== 'super_admin') {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'This account does not have super-admin access.' },
      })
    }
  }

  const audit = (request, action, objectType = null, objectId = null) => store.addAudit({
    actorType: 'staff', actorId: request.staff.id, action, objectType, objectId,
    occurredAt: now(), requestId: request.id,
    ipDigest: ipDigest(config.sessionPepper, request.ip),
    userAgent: request.headers['user-agent'],
  })

  const getAnalytics = async (request, reply, action) => {
    let period
    try {
      period = resolveAdminPeriod(request.query, now())
    } catch {
      return reply.code(400).send({
        error: { code: 'INVALID_DATE_RANGE', message: 'Choose a valid reporting period of two years or less.' },
      })
    }
    const data = await store.getAdminAnalytics({
      ...period,
      dentistId: request.query.dentistId || null,
      serviceId: request.query.serviceId || null,
      now: now(),
    })
    await audit(request, action)
    return { period, ...data }
  }

  for (const [path, action] of [
    ['overview', 'admin.overview_viewed'],
    ['sales', 'admin.sales_viewed'],
    ['services', 'admin.services_viewed'],
    ['comparisons', 'admin.comparisons_viewed'],
    ['doctors', 'admin.doctors_viewed'],
  ]) {
    app.get(`/api/admin/${path}`, {
      preHandler: requireAdmin,
      schema: { querystring: analyticsQuery },
    }, (request, reply) => getAnalytics(request, reply, action))
  }

  app.get('/api/admin/team', { preHandler: requireAdmin }, async (request) => {
    const staff = await store.listAdminStaff()
    await audit(request, 'admin.team_viewed')
    return { staff: staff.map(publicAccount) }
  })

  const createAccount = (role) => async (request, reply) => {
    const displayName = request.body.displayName.trim().replace(/\s+/gu, ' ')
    const normalizedName = normalizeName(displayName)
    if (!normalizedName) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Check the name and password.' } })
    }
    const credentials = await hashStaffPassword(request.body.password, randomBytes)
    const authUserId = randomUUID()
    const result = await store.createAdminStaff({
      authUserId,
      email: `${authUserId}@staff.local`,
      displayName,
      normalizedName,
      role,
      specialty: request.body.specialty?.trim() || null,
      ...credentials,
      now: now(),
    })
    if (result.outcome === 'already_exists') {
      return reply.code(409).send({
        error: { code: 'STAFF_EXISTS', message: 'A staff account with that login name already exists.' },
      })
    }
    await audit(request, 'admin.staff_created', 'staff_profile', result.staff.id)
    return reply.code(201).send({ staff: publicAccount(result.staff) })
  }

  app.post('/api/admin/team/dentists', {
    preHandler: requireAdmin, schema: { body: accountBody(true) },
  }, createAccount('dentist'))

  app.post('/api/admin/team/receptionists', {
    preHandler: requireAdmin, schema: { body: accountBody(false) },
  }, createAccount('receptionist'))

  for (const [actionName, active] of [['deactivate', false], ['reactivate', true]]) {
    app.post(`/api/admin/team/:id/${actionName}`, {
      preHandler: requireAdmin, schema: { params: idParams },
    }, async (request, reply) => {
      if (request.params.id === request.staff.id) {
        return reply.code(400).send({ error: { code: 'SELF_CHANGE_FORBIDDEN', message: 'You cannot change your own active status.' } })
      }
      const staff = await store.setAdminStaffActive(request.params.id, active, now())
      if (!staff) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That staff account was not found.' } })
      await audit(request, `admin.staff_${actionName}d`, 'staff_profile', request.params.id)
      return { staff: publicAccount(staff) }
    })
  }

  app.post('/api/admin/team/:id/reset-password', {
    preHandler: requireAdmin,
    schema: {
      params: idParams,
      body: { type: 'object', additionalProperties: false, required: ['password'], properties: { password: staffPassword } },
    },
  }, async (request, reply) => {
    const credentials = await hashStaffPassword(request.body.password, randomBytes)
    const changed = await store.resetAdminStaffPassword(request.params.id, credentials, now())
    if (!changed) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That staff account was not found.' } })
    await audit(request, 'admin.staff_password_reset', 'staff_profile', request.params.id)
    return reply.code(204).send()
  })

  app.post('/api/admin/team/:id/revoke-sessions', {
    preHandler: requireAdmin, schema: { params: idParams },
  }, async (request, reply) => {
    if (request.params.id === request.staff.id) {
      return reply.code(400).send({ error: { code: 'SELF_CHANGE_FORBIDDEN', message: 'Use Log out to end your own session.' } })
    }
    const changed = await store.revokeAdminStaffSessions(request.params.id, now())
    if (!changed) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That staff account was not found.' } })
    await audit(request, 'admin.staff_sessions_revoked', 'staff_profile', request.params.id)
    return reply.code(204).send()
  })

  app.get('/api/admin/audit', {
    preHandler: requireAdmin,
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { limit: { type: 'integer', minimum: 1, maximum: 200 } } } },
  }, async (request) => {
    const events = await store.listAdminAudit(request.query.limit || 100)
    await audit(request, 'admin.audit_viewed')
    return { events }
  })

  const publicSocialSettings = (settings) => ({
    ...settings,
    logoDriveFileId: undefined,
    logoMimeType: undefined,
    integrationConfigured: Boolean(socialPublisher?.configured),
    aiConfigured: Boolean(config.openAiApiKey),
    tokenEncryptionConfigured: Boolean(config.socialTokenEncryptionKey),
    storageConfigured: Boolean(socialStorage),
  })

  app.get('/api/admin/social/settings', { preHandler: requireAdmin }, async (request) => {
    const settings = await store.getSocialSettings()
    await audit(request, 'admin.social_settings_viewed')
    return { settings: publicSocialSettings(settings) }
  })

  app.put('/api/admin/social/settings', {
    preHandler: requireAdmin,
    bodyLimit: 3 * 1024 * 1024,
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: [
          'clinicName', 'primaryColor', 'secondaryColor', 'fontFamily', 'brandVoice', 'defaultLanguage',
          'defaultHashtags', 'prohibitedPhrases', 'patientPostsEnabled', 'minorPostsEnabled',
          'automaticPublishingEnabled', 'dailyPostLimit', 'weeklyPostLimit',
          'postingStartHour', 'postingEndHour',
        ],
        properties: {
          clinicName: { type: 'string', minLength: 2, maxLength: 160 },
          primaryColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          secondaryColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          fontFamily: { type: 'string', enum: ['Arial', 'Georgia', 'Verdana'] },
          brandVoice: { type: 'string', minLength: 2, maxLength: 500 },
          defaultLanguage: { type: 'string', enum: ['english', 'filipino', 'taglish'] },
          contactPhone: { anyOf: [{ type: 'string', maxLength: 80 }, { type: 'null' }] },
          address: { anyOf: [{ type: 'string', maxLength: 300 }, { type: 'null' }] },
          defaultCallToAction: { anyOf: [{ type: 'string', maxLength: 300 }, { type: 'null' }] },
          defaultHashtags: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 80 } },
          requiredDisclaimer: { anyOf: [{ type: 'string', maxLength: 500 }, { type: 'null' }] },
          prohibitedPhrases: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 120 } },
          patientPostsEnabled: { type: 'boolean' },
          minorPostsEnabled: { type: 'boolean' },
          automaticPublishingEnabled: { type: 'boolean' },
          dailyPostLimit: { type: 'integer', minimum: 1, maximum: 25 },
          weeklyPostLimit: { type: 'integer', minimum: 1, maximum: 100 },
          postingStartHour: { type: 'integer', minimum: 0, maximum: 23 },
          postingEndHour: { type: 'integer', minimum: 0, maximum: 23 },
          logo: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object', additionalProperties: false,
                required: ['imageBase64', 'imageMimeType'],
                properties: {
                  imageBase64: { type: 'string', minLength: 4, maxLength: 2_800_000 },
                  imageMimeType: { type: 'string', enum: Object.keys(socialImageSignatures) },
                },
              },
            ],
          },
        },
      },
    },
  }, async (request, reply) => {
    const current = await store.getSocialSettings()
    let logoDriveFileId = null
    let logoMimeType = null
    if (request.body.logo) {
      if (!socialStorage) return reply.code(503).send({ error: { code: 'STORAGE_NOT_CONFIGURED', message: 'Private image storage is not configured.' } })
      const bytes = decodeSocialImage(request.body.logo)
      if (!bytes) return reply.code(400).send({ error: { code: 'INVALID_LOGO', message: 'Upload a valid logo image up to 2 MB.' } })
      logoDriveFileId = await socialStorage.upload({ bytes, mimeType: request.body.logo.imageMimeType, prefix: 'social-logo' })
      logoMimeType = request.body.logo.imageMimeType
    }
    try {
      const clean = (value) => value?.trim() || null
      const settings = await store.updateSocialSettings({
        ...request.body,
        clinicName: request.body.clinicName.trim(),
        brandVoice: request.body.brandVoice.trim(),
        contactPhone: clean(request.body.contactPhone),
        address: clean(request.body.address),
        defaultCallToAction: clean(request.body.defaultCallToAction),
        requiredDisclaimer: clean(request.body.requiredDisclaimer),
        defaultHashtags: request.body.defaultHashtags.map((value) => value.trim()).filter(Boolean),
        prohibitedPhrases: request.body.prohibitedPhrases.map((value) => value.trim()).filter(Boolean),
        logoDriveFileId,
        logoMimeType,
      }, now())
      if (logoDriveFileId && current.logoDriveFileId) await socialStorage.remove(current.logoDriveFileId)
      await audit(request, 'admin.social_settings_updated')
      return { settings: publicSocialSettings(settings) }
    } catch (error) {
      if (logoDriveFileId) await socialStorage.remove(logoDriveFileId)
      throw error
    }
  })

  app.post('/api/admin/social/facebook/connect', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['pageId', 'accessToken'],
        properties: {
          pageId: { type: 'string', minLength: 1, maxLength: 100 },
          accessToken: { type: 'string', minLength: 20, maxLength: 2000 },
        },
      },
    },
  }, async (request, reply) => {
    if (!socialPublisher) return reply.code(503).send({ error: { code: 'SOCIAL_NOT_CONFIGURED', message: 'Social publishing is not configured on this server.' } })
    let page
    try {
      page = await socialPublisher.verifyPage({ pageId: request.body.pageId.trim(), accessToken: request.body.accessToken.trim() })
    } catch (error) {
      return reply.code(400).send({ error: { code: 'FACEBOOK_CONNECTION_FAILED', message: error.message } })
    }
    await store.setSocialPageConnection({ ...page, staffId: request.staff.id, now: now() })
    await audit(request, 'admin.facebook_page_connected')
    return { page: { id: page.pageId, name: page.pageName, status: 'connected' } }
  })

  app.delete('/api/admin/social/facebook/connection', { preHandler: requireAdmin }, async (request, reply) => {
    await store.disconnectSocialPage(now())
    await audit(request, 'admin.facebook_page_disconnected')
    return reply.code(204).send()
  })

  app.get('/api/admin/social/posts', { preHandler: requireAdmin }, async (request) => {
    const posts = await store.listSocialPosts({ limit: 200 })
    await audit(request, 'admin.social_posts_viewed')
    return { posts }
  })

  app.get('/api/admin/social/posts/:id/image', {
    preHandler: requireAdmin, schema: { params: idParams },
  }, async (request, reply) => {
    const image = await store.getSocialPostImage({ id: request.params.id })
    if (!image || !socialStorage) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That post image was not found.' } })
    const bytes = await socialStorage.download(image.driveFileId, 2 * 1024 * 1024)
    await audit(request, 'admin.social_post_image_viewed', 'social_post', request.params.id)
    return reply.type(image.mimeType).send(bytes)
  })

  app.post('/api/admin/social/posts/:id/remove', {
    preHandler: requireAdmin, schema: { params: idParams },
  }, async (request, reply) => {
    if (!socialPublisher || !await socialPublisher.removePost(request.params.id)) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That published Facebook post was not found.' } })
    }
    await audit(request, 'admin.social_post_removed', 'social_post', request.params.id)
    return reply.code(204).send()
  })
}
