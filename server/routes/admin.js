import { ipDigest, normalizeName } from '../auth.js'
import { resolveAdminPeriod } from '../admin-period.js'
import { hashStaffPassword } from '../staff-auth.js'

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

const accountBody = (dentist) => ({
  type: 'object',
  additionalProperties: false,
  required: ['displayName', 'password'],
  properties: {
    displayName: { type: 'string', minLength: 2, maxLength: 160 },
    password: { type: 'string', minLength: 12, maxLength: 72 },
    ...(dentist ? { specialty: { type: 'string', maxLength: 120 } } : {}),
  },
})

const publicAccount = ({ id, displayName, role, active, dentistId = null, dentistName = null, specialty = null, createdAt = null, lastLoginAt = null }) => ({
  id, displayName, role, active, dentistId, dentistName, specialty, createdAt, lastLoginAt,
})

export default async function adminRoutes(app, { store, config, now, randomBytes, randomUUID }) {
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
    ['meeting', 'admin.meeting_viewed'],
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
    if (!normalizedName || Buffer.byteLength(request.body.password) > 72) {
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
      body: { type: 'object', additionalProperties: false, required: ['password'], properties: { password: { type: 'string', minLength: 12, maxLength: 72 } } },
    },
  }, async (request, reply) => {
    if (Buffer.byteLength(request.body.password) > 72) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'The password is too long.' } })
    }
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
}
