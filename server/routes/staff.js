import {
  SESSION_COOKIE,
  STAFF_SESSION_COOKIE,
  addHours,
  createSessionToken,
  ipDigest,
  normalizeName,
  normalizePhone,
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

const paymentMethods = ['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'other']

const paymentBody = {
  type: 'object',
  additionalProperties: false,
  required: ['amountCents', 'method'],
  properties: {
    amountCents: { type: 'integer', minimum: 1, maximum: 100_000_000 },
    method: { type: 'string', enum: paymentMethods },
    reference: { type: 'string', maxLength: 120 },
  },
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

  app.patch(
    '/api/staff/appointments/:id/schedule',
    {
      preHandler: requireReception,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['startsAt'],
          properties: { startsAt: { type: 'string', format: 'date-time' } },
        },
      },
    },
    async (request, reply) => {
      const result = await store.rescheduleReceptionAppointment({
        id: request.params.id,
        startsAt: request.body.startsAt,
        now: now(),
      })
      if (result.outcome === 'not_found') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'That appointment can no longer be rescheduled.' },
        })
      }
      if (result.outcome === 'slot_unavailable') {
        return reply.code(409).send({
          error: { code: 'SLOT_UNAVAILABLE', message: 'That time is unavailable. Choose another hourly slot.' },
        })
      }
      await audit(request, 'staff.appointment_rescheduled', 'appointment', request.params.id)
      return reply.code(204).send()
    },
  )

  app.get('/api/staff/billing', { preHandler: requireReception }, async (request) => {
    const billing = await store.listReceptionBilling(manilaDate(now()))
    await audit(request, 'staff.billing_viewed')
    return billing
  })

  app.post(
    '/api/staff/appointments/:id/checkout',
    {
      preHandler: requireReception,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'subtotalCents', 'paymentMethod', 'paymentConfirmed'],
          properties: {
            description: { type: 'string', minLength: 1, maxLength: 240 },
            subtotalCents: { type: 'integer', minimum: 1, maximum: 100_000_000 },
            paymentMethod: { type: 'string', enum: paymentMethods },
            paymentReference: { type: 'string', maxLength: 120 },
            paymentConfirmed: { const: true },
          },
        },
      },
    },
    async (request, reply) => {
      const description = request.body.description.trim()
      if (!description) {
        return reply.code(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Complete the service and payment details.' },
        })
      }
      const result = await store.createPatientCheckout({
        appointmentId: request.params.id,
        staffId: request.staff.id,
        description,
        subtotalCents: request.body.subtotalCents,
        paymentMethod: request.body.paymentMethod,
        paymentReference: request.body.paymentReference?.trim() || null,
        now: now(),
      })
      if (result.outcome === 'not_found') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'That appointment is no longer ready for checkout.' },
        })
      }
      if (result.outcome === 'already_checked_out') {
        return reply.code(409).send({
          error: { code: 'ALREADY_CHECKED_OUT', message: 'That appointment has already been checked out.' },
        })
      }
      if (result.outcome === 'invalid_amount') {
        return reply.code(400).send({
          error: { code: 'INVALID_AMOUNT', message: 'The service charge must be greater than zero.' },
        })
      }
      await audit(request, 'staff.patient_checkout_created', 'patient_charge', result.charge.id)
      return reply.code(201).send({ charge: result.charge })
    },
  )

  app.post(
    '/api/staff/charges/:id/payments',
    { preHandler: requireReception, schema: { params: idParams, body: paymentBody } },
    async (request, reply) => {
      const result = await store.addPatientPayment({
        chargeId: request.params.id,
        staffId: request.staff.id,
        amountCents: request.body.amountCents,
        method: request.body.method,
        reference: request.body.reference?.trim() || null,
        now: now(),
      })
      if (result.outcome === 'not_found') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'That payment record was not found.' },
        })
      }
      if (result.outcome === 'amount_exceeds_balance') {
        return reply.code(400).send({
          error: { code: 'INVALID_AMOUNT', message: 'The payment is greater than the remaining balance.' },
        })
      }
      await audit(request, 'staff.patient_payment_recorded', 'patient_payment', result.paymentId)
      return reply.code(201).send({ charge: result.charge })
    },
  )

  app.post(
    '/api/staff/payments/:id/void',
    {
      preHandler: requireReception,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 3, maxLength: 240 } },
        },
      },
    },
    async (request, reply) => {
      const reason = request.body.reason.trim()
      if (reason.length < 3) {
        return reply.code(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Enter a reason for voiding the payment.' },
        })
      }
      const result = await store.voidPatientPayment({
        paymentId: request.params.id,
        staffId: request.staff.id,
        reason,
        now: now(),
      })
      if (result.outcome === 'not_found') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'That active payment was not found.' },
        })
      }
      await audit(request, 'staff.patient_payment_voided', 'patient_payment', request.params.id)
      return { charge: result.charge }
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
          properties: { q: { type: 'string', maxLength: 100 } },
        },
      },
    },
    async (request) => {
      const patients = await store.searchReceptionPatients(request.query.q.trim())
      await audit(request, 'staff.patient_directory_searched')
      return { patients }
    },
  )

  app.post(
    '/api/staff/patients',
    {
      preHandler: requireReception,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['displayName', 'age', 'gender'],
          properties: {
            displayName: { type: 'string', minLength: 2, maxLength: 160 },
            phone: { type: 'string', maxLength: 32, pattern: '^[+0-9 ()-]*$' },
            age: { type: 'integer', minimum: 0, maximum: 130 },
            gender: {
              type: 'string',
              enum: ['female', 'male', 'non_binary', 'prefer_not_to_say'],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const displayName = request.body.displayName.trim().replace(/\s+/gu, ' ')
      const normalizedName = normalizeName(displayName)
      const submittedPhone = request.body.phone?.trim() || ''
      const phoneDigits = submittedPhone ? normalizePhone(submittedPhone) : ''
      const phoneE164 = phoneDigits ? `+${phoneDigits}` : null
      if (!normalizedName || (submittedPhone && !phoneDigits)) {
        return reply.code(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Enter a full name and a valid Philippine mobile number.' },
        })
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await store.createReceptionPatient({
          displayName,
          normalizedName,
          phoneE164,
          age: request.body.age,
          gender: request.body.gender,
          now: now(),
        })
        if (result.outcome === 'already_exists') {
          return reply.code(409).send({
            error: { code: 'PATIENT_EXISTS', message: 'A patient with that name already exists.' },
          })
        }
        if (result.outcome === 'created') {
          await audit(request, 'staff.patient_account_created', 'patient', result.patient.id)
          return reply.code(201).send({ patient: result.patient })
        }
      }
      return reply.code(503).send({
        error: { code: 'PATIENT_ID_UNAVAILABLE', message: 'A patient ID could not be generated. Please try again.' },
      })
    },
  )

  app.patch(
    '/api/staff/patients/:id',
    {
      preHandler: requireReception,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'displayName',
            'age',
            'gender',
            'weightKg',
            'bloodPressureSystolic',
            'bloodPressureDiastolic',
          ],
          properties: {
            displayName: { type: 'string', minLength: 2, maxLength: 160 },
            phone: { type: 'string', maxLength: 32, pattern: '^[+0-9 ()-]*$' },
            age: { type: 'integer', minimum: 0, maximum: 130 },
            gender: {
              type: 'string',
              enum: ['female', 'male', 'non_binary', 'prefer_not_to_say'],
            },
            weightKg: { anyOf: [{ type: 'number', minimum: 1, maximum: 500 }, { type: 'null' }] },
            bloodPressureSystolic: { anyOf: [{ type: 'integer', minimum: 50, maximum: 300 }, { type: 'null' }] },
            bloodPressureDiastolic: { anyOf: [{ type: 'integer', minimum: 30, maximum: 200 }, { type: 'null' }] },
          },
        },
      },
    },
    async (request, reply) => {
      const displayName = request.body.displayName.trim().replace(/\s+/gu, ' ')
      const normalizedName = normalizeName(displayName)
      const submittedPhone = request.body.phone?.trim() || ''
      const phoneDigits = submittedPhone ? normalizePhone(submittedPhone) : ''
      const systolic = request.body.bloodPressureSystolic
      const diastolic = request.body.bloodPressureDiastolic
      if (!normalizedName || (submittedPhone && !phoneDigits) || (systolic === null) !== (diastolic === null) || (systolic !== null && systolic <= diastolic)) {
        return reply.code(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Check the patient name, mobile number, and blood pressure values.' },
        })
      }
      const result = await store.updateReceptionPatient({
        id: request.params.id,
        displayName,
        normalizedName,
        phoneE164: phoneDigits ? `+${phoneDigits}` : null,
        age: request.body.age,
        gender: request.body.gender,
        weightKg: request.body.weightKg,
        bloodPressureSystolic: systolic,
        bloodPressureDiastolic: diastolic,
        now: now(),
      })
      if (result.outcome === 'not_found') {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'That patient was not found.' } })
      }
      if (result.outcome === 'already_exists') {
        return reply.code(409).send({ error: { code: 'PATIENT_EXISTS', message: 'A patient with that name already exists.' } })
      }
      await audit(request, 'staff.patient_profile_updated', 'patient', result.patient.id)
      return { patient: result.patient }
    },
  )
}
