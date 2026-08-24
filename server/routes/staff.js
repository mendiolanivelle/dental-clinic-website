import {
  SESSION_COOKIE,
  STAFF_SESSION_COOKIE,
  addHours,
  createSessionToken,
  ipDigest,
  sessionCookieOptions,
  sha256,
} from '../auth.js'

const loginError = Object.freeze({
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'The email or password is not recognized.',
  },
})

const unavailableError = Object.freeze({
  error: {
    code: 'STAFF_AUTH_UNAVAILABLE',
    message: 'Staff login is temporarily unavailable.',
  },
})

const idParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
}

const dateQuery = {
  type: 'object',
  additionalProperties: false,
  required: ['date'],
  properties: { date: { type: 'string', format: 'date' } },
}

const manilaDate = (date) =>
  new Date(date.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 10)

export default async function staffRoutes(
  app,
  { store, config, now, randomBytes, randomUUID, verifyStaffCredentials },
) {
  const checkLoginRateLimit = app.createRateLimit({
    max: config.loginMaxAttempts,
    timeWindow: config.loginWindowMinutes * 60_000,
    keyGenerator: (request) => request.ip,
  })

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

  const requireReception = async (request, reply) => {
    await app.authenticateStaff(request, reply)
    if (reply.sent) return
    if (!['receptionist', 'admin'].includes(request.staff.role)) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'This account does not have reception access.' },
      })
    }
  }

  app.post(
    '/api/staff/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 254 },
            password: { type: 'string', minLength: 8, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const currentLimit = await checkLoginRateLimit(request, { increment: false })
      if (currentLimit.isExceeded) {
        return reply.code(429).send({
          error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' },
        })
      }

      let identity
      try {
        identity = await verifyStaffCredentials({
          email: request.body.email.trim().toLowerCase(),
          password: request.body.password,
        })
      } catch (error) {
        if (error.statusCode === 429) return reply.code(429).send(loginError)
        if (error.statusCode === 503) return reply.code(503).send(unavailableError)
        throw error
      }

      if (!identity) {
        await checkLoginRateLimit(request)
        return reply.code(401).send(loginError)
      }

      const currentTime = now()
      const token = createSessionToken(randomBytes)
      const staff = await store.createStaffSessionForLogin({
        authUserId: identity.authUserId,
        sessionId: randomUUID(),
        tokenDigest: sha256(token),
        now: currentTime,
        absoluteExpiresAt: addHours(currentTime, config.sessionAbsoluteHours),
        audit: {
          requestId: request.id,
          ipDigest: ipDigest(config.sessionPepper, request.ip),
          userAgent: request.headers['user-agent'],
        },
      })
      if (!staff || !['receptionist', 'admin'].includes(staff.role)) {
        if (staff) await store.revokeStaffSession(sha256(token), currentTime)
        await checkLoginRateLimit(request)
        return reply.code(401).send(loginError)
      }

      const patientToken = request.cookies[SESSION_COOKIE]
      if (patientToken) {
        await store.revokeSession(sha256(patientToken), currentTime)
        reply.clearCookie(SESSION_COOKIE, sessionCookieOptions)
      }
      reply.setCookie(STAFF_SESSION_COOKIE, token, {
        ...sessionCookieOptions,
        maxAge: config.sessionAbsoluteHours * 60 * 60,
      })
      return { staff }
    },
  )

  app.post('/api/staff/auth/logout', async (request, reply) => {
    const token = request.cookies[STAFF_SESSION_COOKIE]
    if (token) await store.revokeStaffSession(sha256(token), now())
    reply.clearCookie(STAFF_SESSION_COOKIE, sessionCookieOptions)
    return reply.code(204).send()
  })

  app.get('/api/staff/me', { preHandler: requireReception }, async (request) => {
    await audit(request, 'staff.profile_viewed')
    return { staff: request.staff }
  })

  app.get('/api/staff/dashboard', { preHandler: requireReception }, async (request) => {
    const dashboard = await store.getReceptionDashboard(manilaDate(now()))
    await audit(request, 'staff.dashboard_viewed')
    return dashboard
  })

  app.get('/api/staff/appointment-requests', { preHandler: requireReception }, async (request) => {
    const appointmentRequests = await store.listReceptionRequests()
    await audit(request, 'staff.appointment_requests_listed')
    return { appointmentRequests }
  })

  app.patch(
    '/api/staff/appointment-requests/:id',
    {
      preHandler: requireReception,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['confirm', 'decline'] },
            clinicNote: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await store.updateReceptionRequest({
        id: request.params.id,
        action: request.body.action,
        clinicNote: request.body.clinicNote?.trim() || null,
        now: now(),
      })
      if (result.outcome === 'not_found') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'That pending request was not found.' },
        })
      }
      if (result.outcome === 'slot_unavailable') {
        return reply.code(409).send({
          error: { code: 'SLOT_UNAVAILABLE', message: 'That time is no longer available.' },
        })
      }
      await audit(
        request,
        request.body.action === 'confirm'
          ? 'staff.appointment_request_confirmed'
          : 'staff.appointment_request_declined',
        'appointment_request',
        request.params.id,
      )
      return reply.code(204).send()
    },
  )

  app.get(
    '/api/staff/calendar',
    { preHandler: requireReception, schema: { querystring: dateQuery } },
    async (request) => {
      const calendar = await store.listReceptionCalendar(request.query.date)
      await audit(request, 'staff.calendar_viewed')
      return { date: request.query.date, timezone: 'Asia/Manila', ...calendar }
    },
  )

  app.get(
    '/api/staff/patients',
    {
      preHandler: requireReception,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['q'],
          properties: { q: { type: 'string', minLength: 2, maxLength: 100 } },
        },
      },
    },
    async (request) => {
      const patients = await store.searchReceptionPatients(request.query.q.trim())
      await audit(request, 'staff.patient_directory_searched')
      return { patients }
    },
  )
}
