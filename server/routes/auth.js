import {
  SESSION_COOKIE,
  addHours,
  createSessionToken,
  genericLoginError,
  ipDigest,
  normalizeName,
  normalizePatientNumber,
  sessionCookieOptions,
  sha256,
} from '../auth.js'

const auditMeta = (request, config) => ({
  requestId: request.id,
  ipDigest: ipDigest(config.sessionPepper, request.ip),
  userAgent: request.headers['user-agent'],
})

const rateLimitedError = Object.freeze({
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many incorrect attempts. Please wait and try again.',
  },
})

const sendRateLimited = (reply, limit) =>
  reply
    .header('retry-after', String(Math.max(1, limit.ttlInSeconds)))
    .code(429)
    .send(rateLimitedError)

export default async function authRoutes(
  app,
  { store, config, now, randomBytes, randomUUID },
) {
  const checkLoginRateLimit = app.createRateLimit({
    max: config.loginMaxAttempts,
    timeWindow: config.loginWindowMinutes * 60_000,
    keyGenerator: (request) => request.ip,
  })

  app.post(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['fullName', 'patientNumber'],
          properties: {
            fullName: { type: 'string', minLength: 1, maxLength: 160 },
            patientNumber: { type: 'string', minLength: 4, maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
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

      const currentLimit = await checkLoginRateLimit(request, {
        increment: false,
      })
      if (currentLimit.isExceeded) return sendRateLimited(reply, currentLimit)

      const currentTime = now()
      const token = createSessionToken(randomBytes)
      const patient = await store.createSessionForLogin({
        normalizedName,
        patientNumber,
        sessionId: randomUUID(),
        tokenDigest: sha256(token),
        now: currentTime,
        absoluteExpiresAt: addHours(currentTime, config.sessionAbsoluteHours),
        audit: auditMeta(request, config),
      })

      if (!patient) {
        const failedLimit = await checkLoginRateLimit(request)
        if (failedLimit.isExceeded) return sendRateLimited(reply, failedLimit)
        return reply.code(401).send(genericLoginError)
      }
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
