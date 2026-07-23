import {
  SESSION_COOKIE,
  addHours,
  addMinutes,
  challengeDigest,
  createOtp,
  createSessionToken,
  genericVerificationError,
  hmacDigest,
  ipDigest,
  lookupDigest,
  normalizeName,
  normalizePatientNumber,
  sessionCookieOptions,
  sha256,
} from '../auth.js'

const genericMessage = 'If the details match our records, a verification code was sent.'
const challengeBody = {
  type: 'object',
  additionalProperties: false,
  required: ['challengeId'],
  properties: {
    challengeId: { type: 'string', format: 'uuid' },
  },
}

const auditMeta = (request, config) => ({
  requestId: request.id,
  ipDigest: ipDigest(config.sessionPepper, request.ip),
  userAgent: request.headers['user-agent'],
})

export default async function authRoutes(
  app,
  { store, sms, config, now, randomInt, randomBytes, randomUUID },
) {
  const createCode = () => config.devOtpCode || createOtp(randomInt)
  const deliverCode = (phone, code, challengeId) => {
    if (!phone) return
    void sms.sendOtp(phone, code).catch(async () => {
      try {
        await store.invalidateChallenge(challengeId, now())
      } catch {
        app.log.error('Failed to invalidate an undeliverable login challenge')
      }
    })
  }
  const rateLimit = {
    max: config.loginStartMax,
    timeWindow: config.loginWindowMinutes * 60_000,
    keyGenerator: (request) => request.ip,
  }

  app.post(
    '/api/auth/start',
    {
      config: { rateLimit },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['fullName', 'patientNumber'],
          properties: {
            fullName: { type: 'string', minLength: 1, maxLength: 160 },
            patientNumber: {
              type: 'string',
              minLength: 4,
              maxLength: 40,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const createdAt = now()
      const normalizedName = normalizeName(request.body.fullName)
      const patientNumber = normalizePatientNumber(request.body.patientNumber)
      if (!normalizedName || !/^[A-Z0-9-]+$/.test(patientNumber)) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Please check the submitted details.',
          },
        })
      }
      const requestIpDigest = ipDigest(config.sessionPepper, request.ip)
      const requestLookupDigest = lookupDigest(
        config.otpPepper,
        normalizedName,
        patientNumber,
      )
      const since = addMinutes(createdAt, -config.loginWindowMinutes)
      const patient = await store.findPatientForLogin(normalizedName, patientNumber)
      const id = randomUUID()
      const code = createCode()

      const deliveryAllowed = await store.createChallenge({
        id,
        patientId: patient?.id || null,
        codeDigest: patient ? challengeDigest(config.otpPepper, id, code) : null,
        expiresAt: addMinutes(createdAt, config.otpExpiryMinutes),
        maxAttempts: config.otpMaxAttempts,
        lookupDigest: requestLookupDigest,
        ipDigest: requestIpDigest,
        createdAt,
        rateLimitSince: since,
        rateLimitMax: config.loginStartMax,
      })

      deliverCode(
        deliveryAllowed ? patient?.phone_e164 || patient?.phone : null,
        code,
        id,
      )

      return reply.code(202).send({ challengeId: id, message: genericMessage })
    },
  )

  app.post(
    '/api/auth/resend',
    {
      config: { rateLimit },
      schema: { body: challengeBody },
    },
    async (request, reply) => {
      const createdAt = now()
      const source = await store.findChallengeForResend(request.body.challengeId)
      const requestIpDigest = ipDigest(config.sessionPepper, request.ip)
      const requestLookupDigest =
        source?.lookupDigest ||
        hmacDigest(config.otpPepper, `unknown-resend:${request.body.challengeId}`)
      const id = randomUUID()
      const code = createCode()
      const recipient = await store.replaceChallenge({
        previousId: request.body.challengeId,
        id,
        codeDigest: challengeDigest(config.otpPepper, id, code),
        expiresAt: addMinutes(createdAt, config.otpExpiryMinutes),
        maxAttempts: config.otpMaxAttempts,
        lookupDigest: requestLookupDigest,
        ipDigest: requestIpDigest,
        createdAt,
        rateLimitSince: addMinutes(createdAt, -config.loginWindowMinutes),
        rateLimitMax: config.loginStartMax,
      })

      deliverCode(recipient?.phone, code, id)

      return reply.code(202).send({ challengeId: id, message: genericMessage })
    },
  )

  app.post(
    '/api/auth/verify',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: config.loginWindowMinutes * 60_000,
          keyGenerator: (request) => request.ip,
        },
      },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['challengeId', 'code'],
          properties: {
            challengeId: { type: 'string', format: 'uuid' },
            code: { type: 'string', pattern: '^\\d{6}$' },
          },
        },
      },
    },
    async (request, reply) => {
      const currentTime = now()
      const token = createSessionToken(randomBytes)
      const patient = await store.verifyChallengeAndCreateSession({
        challengeId: request.body.challengeId,
        codeDigest: challengeDigest(
          config.otpPepper,
          request.body.challengeId,
          request.body.code,
        ),
        sessionId: randomUUID(),
        tokenDigest: sha256(token),
        now: currentTime,
        absoluteExpiresAt: addHours(currentTime, config.sessionAbsoluteHours),
        audit: auditMeta(request, config),
      })

      if (!patient) return reply.code(401).send(genericVerificationError)
      reply.setCookie(SESSION_COOKIE, token, {
        ...sessionCookieOptions,
        maxAge: config.sessionAbsoluteHours * 60 * 60,
      })
      return {
        patient: {
          displayName: patient.displayName,
          patientNumber: patient.patientNumber,
        },
      }
    },
  )

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) await store.revokeSession(sha256(token), now())
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions)
    return reply.code(204).send()
  })
}
