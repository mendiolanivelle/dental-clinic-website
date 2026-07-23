import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../server/app.js'
import {
  challengeDigest,
  normalizeName,
  normalizePatientNumber,
  sha256,
} from '../server/auth.js'
import { loadConfig } from '../server/config.js'

const config = {
  nodeEnv: 'test',
  publicOrigin: 'https://dental.test',
  databaseUrl: 'postgres://unused',
  sessionPepper: 'session-pepper-for-tests-only-000000000',
  otpPepper: 'one-time-code-pepper-tests-000000000',
  smsProvider: 'development',
  devOtpCode: '123456',
  sessionIdleMinutes: 30,
  sessionAbsoluteHours: 8,
  otpExpiryMinutes: 5,
  otpMaxAttempts: 5,
  loginStartMax: 50,
  loginWindowMinutes: 15,
}

class MemoryStore {
  constructor() {
    this.patient = {
      id: '10000000-0000-4000-8000-000000000001',
      displayName: 'Patricia Portal Demo',
      patientNumber: 'PT-DEMO01',
      phone: '+639000000001',
      enabled: true,
    }
    this.otherPatientId = '10000000-0000-4000-8000-000000000002'
    this.appointments = [
      {
        patientId: this.patient.id,
        id: '30000000-0000-4000-8000-000000000001',
        typeName: 'Brace Adjustment',
        startsAt: '2030-01-01T02:00:00.000Z',
        endsAt: '2030-01-01T02:30:00.000Z',
        status: 'confirmed',
        dentistName: 'Dr. Andrea Sample',
        patientInstructions: 'Arrive early.',
      },
      {
        patientId: this.otherPatientId,
        id: '30000000-0000-4000-8000-000000000099',
        typeName: 'Private appointment',
      },
    ]
    this.records = [
      {
        patientId: this.patient.id,
        published: true,
        id: '50000000-0000-4000-8000-000000000001',
        procedureName: 'Dental Cleaning',
        treatedOn: '2026-06-01',
        patientSummary: 'Published patient summary.',
        dentistName: 'Dr. Andrea Sample',
      },
      {
        patientId: this.patient.id,
        published: false,
        id: '50000000-0000-4000-8000-000000000002',
        procedureName: 'Unpublished treatment',
      },
      {
        patientId: this.otherPatientId,
        published: true,
        id: '50000000-0000-4000-8000-000000000099',
        procedureName: 'Other patient treatment',
      },
    ]
    this.plans = [
      {
        patientId: this.patient.id,
        published: true,
        id: '40000000-0000-4000-8000-000000000001',
        title: 'Orthodontic Care Plan',
        patientSummary: 'Published plan.',
        status: 'active',
      },
      {
        patientId: this.patient.id,
        published: false,
        id: '40000000-0000-4000-8000-000000000002',
        title: 'Unpublished plan',
      },
      {
        patientId: this.otherPatientId,
        published: true,
        id: '40000000-0000-4000-8000-000000000099',
        title: 'Other patient plan',
      },
    ]
    this.challenges = new Map()
    this.sessions = new Map()
    this.audits = []
    this.healthy = true
  }

  async health() {
    if (!this.healthy) throw new Error('unavailable')
  }

  async findPatientForLogin(name, number) {
    return this.patient.enabled &&
      name === normalizeName(this.patient.displayName) &&
      number === this.patient.patientNumber
      ? this.patient
      : null
  }

  challengeWithinLimit(challenge) {
    let ipCount = 0
    let lookupCount = 0
    for (const existing of this.challenges.values()) {
      if (existing.createdAt < challenge.rateLimitSince) continue
      if (existing.ipDigest === challenge.ipDigest) ipCount += 1
      if (existing.lookupDigest === challenge.lookupDigest) lookupCount += 1
    }
    return (
      ipCount < challenge.rateLimitMax &&
      lookupCount < challenge.rateLimitMax
    )
  }

  async createChallenge(challenge) {
    const withinLimit = this.challengeWithinLimit(challenge)
    const patientId = withinLimit ? challenge.patientId : null
    for (const existing of this.challenges.values()) {
      if (patientId && existing.patientId === patientId && !existing.usedAt) {
        existing.usedAt = challenge.createdAt
      }
    }
    this.challenges.set(challenge.id, {
      ...challenge,
      patientId,
      codeDigest: patientId ? challenge.codeDigest : null,
      attemptCount: 0,
      usedAt: null,
    })
    return Boolean(patientId)
  }

  async invalidateChallenge(id, when) {
    const challenge = this.challenges.get(id)
    if (challenge && !challenge.usedAt) challenge.usedAt = when
  }

  async findChallengeForResend(id) {
    const challenge = this.challenges.get(id)
    return challenge
      ? {
          id,
          lookupDigest: challenge.lookupDigest,
          ipDigest: challenge.ipDigest,
        }
      : null
  }

  async replaceChallenge(challenge) {
    const previous = this.challenges.get(challenge.previousId)
    const deliverable = Boolean(
      this.challengeWithinLimit(challenge) &&
        previous &&
        !previous.usedAt &&
        previous.patientId &&
        this.patient.enabled,
    )
    if (previous && !previous.usedAt) previous.usedAt = challenge.createdAt
    this.challenges.set(challenge.id, {
      ...challenge,
      patientId: deliverable ? previous.patientId : null,
      codeDigest: deliverable ? challenge.codeDigest : null,
      attemptCount: 0,
      usedAt: null,
    })
    return deliverable ? { patientId: this.patient.id, phone: this.patient.phone } : null
  }

  async verifyChallengeAndCreateSession(input) {
    const challenge = this.challenges.get(input.challengeId)
    if (
      !challenge ||
      !challenge.patientId ||
      challenge.usedAt ||
      challenge.expiresAt <= input.now ||
      challenge.attemptCount >= challenge.maxAttempts
    ) {
      return null
    }
    challenge.attemptCount += 1
    if (challenge.codeDigest !== input.codeDigest || !this.patient.enabled) return null
    challenge.usedAt = input.now
    this.sessions.set(input.tokenDigest, {
      patient: this.patient,
      lastSeenAt: input.now,
      absoluteExpiresAt: input.absoluteExpiresAt,
      revokedAt: null,
    })
    return this.patient
  }

  async authenticateSession(tokenDigest, now, idleCutoff) {
    const session = this.sessions.get(tokenDigest)
    if (
      !session ||
      session.revokedAt ||
      session.absoluteExpiresAt <= now ||
      session.lastSeenAt < idleCutoff ||
      !session.patient.enabled
    ) {
      return null
    }
    session.lastSeenAt = now
    return session.patient
  }

  async revokeSession(tokenDigest, now) {
    const session = this.sessions.get(tokenDigest)
    if (session) session.revokedAt = now
  }

  async addAudit(event) {
    this.audits.push(event)
  }

  async getDashboard() {
    return { nextAppointment: null, treatmentPlan: null, recentRecord: null }
  }

  async listAppointments(patientId) {
    return this.appointments
      .filter((appointment) => appointment.patientId === patientId)
      .map(({ patientId: _patientId, ...appointment }) => appointment)
  }

  async getAppointment(patientId, appointmentId) {
    const appointment = this.appointments.find(
      (item) => item.patientId === patientId && item.id === appointmentId,
    )
    if (!appointment) return null
    const { patientId: _patientId, ...result } = appointment
    return result
  }

  async listRecords(patientId) {
    return this.records
      .filter((record) => record.patientId === patientId && record.published)
      .map(({ patientId: _patientId, published: _published, ...record }) => record)
  }

  async getRecord(patientId, recordId) {
    const record = this.records.find(
      (item) =>
        item.patientId === patientId &&
        item.id === recordId &&
        item.published,
    )
    if (!record) return null
    const { patientId: _patientId, published: _published, ...result } = record
    return result
  }

  async getTreatmentPlan(patientId) {
    const plan = this.plans.find(
      (item) =>
        item.patientId === patientId &&
        item.published &&
        item.status === 'active',
    )
    if (!plan) return null
    const { patientId: _patientId, published: _published, ...result } = plan
    return result
  }
}

let uuidCounter = 0
const nextUuid = () =>
  `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`
const store = new MemoryStore()
const delivered = []
let currentTime = new Date('2026-07-23T00:00:00.000Z')
const app = await buildApp({
  config,
  store,
  sms: { sendOtp: async (phone, code) => delivered.push({ phone, code }) },
  now: () => new Date(currentTime),
  randomUUIDFn: nextUuid,
  randomBytesFn: () => Buffer.alloc(32, 7),
  staticDir: false,
  logger: false,
})

before(() => app.ready())
after(() => app.close())

const post = (url, payload) =>
  app.inject({
    method: 'POST',
    url,
    headers: { origin: config.publicOrigin },
    payload,
  })

const startKnownLogin = () =>
  post('/api/auth/start', {
    fullName: '  PATRICIA   PORTAL DEMO ',
    patientNumber: ' pt-demo01 ',
  })

test('normalization and production configuration security', () => {
  assert.equal(normalizeName('  PATRICIA　PORTAL  DEMO '), 'patricia portal demo')
  assert.equal(normalizePatientNumber(' pt-ab12 '), 'PT-AB12')
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://db',
        PUBLIC_ORIGIN: 'http://dental.test',
        SESSION_PEPPER: 'replace-this-session-pepper-00000',
        OTP_PEPPER: 'replace-this-otp-pepper-00000000',
        SMS_PROVIDER: 'development',
        DEV_OTP_CODE: '123456',
      }),
    /forbidden in production/,
  )
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'prod',
        DATABASE_URL: 'postgres://db',
        PUBLIC_ORIGIN: 'http://dental.test',
        SESSION_PEPPER: 'session-pepper-for-tests-only-000000000',
        OTP_PEPPER: 'one-time-code-pepper-tests-000000000',
        SMS_PROVIDER: 'development',
      }),
    /NODE_ENV must be development, test, or production/,
  )
})

test('state-changing requests require the configured Origin', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/start',
    payload: { fullName: 'Patricia Portal Demo', patientNumber: 'PT-DEMO01' },
  })
  assert.equal(response.statusCode, 403)
  assert.equal(response.json().error.code, 'INVALID_ORIGIN')
})

test('request schemas reject missing and unexpected login fields', async () => {
  const missing = await post('/api/auth/start', {
    fullName: 'Patricia Portal Demo',
  })
  const unexpected = await post('/api/auth/start', {
    fullName: 'Patricia Portal Demo',
    patientNumber: 'PT-DEMO01',
    patientId: store.otherPatientId,
  })
  assert.equal(missing.statusCode, 400)
  assert.equal(unexpected.statusCode, 400)
})

test('known and unknown starts have equivalent public responses and store no plaintext OTP', async () => {
  const known = await startKnownLogin()
  const unknown = await post('/api/auth/start', {
    fullName: 'Unknown Demo Person',
    patientNumber: 'PT-NOBODY',
  })
  assert.equal(known.statusCode, 202)
  assert.equal(unknown.statusCode, 202)
  assert.deepEqual(Object.keys(known.json()).sort(), Object.keys(unknown.json()).sort())
  assert.equal(known.json().message, unknown.json().message)
  assert.equal(delivered.at(-1).code, '123456')
  const stored = store.challenges.get(known.json().challengeId)
  assert.equal(stored.codeDigest, challengeDigest(config.otpPepper, stored.id, '123456'))
  assert.notEqual(stored.codeDigest, '123456')
  assert.equal(store.challenges.get(unknown.json().challengeId).codeDigest, null)
  assert.equal(known.headers['cache-control'], 'no-store')
})

test('OTP attempts, session cookie, authenticated access, and logout are enforced', async () => {
  const started = await startKnownLogin()
  const challengeId = started.json().challengeId
  const wrong = await post('/api/auth/verify', { challengeId, code: '000000' })
  assert.equal(wrong.statusCode, 401)
  assert.equal(store.challenges.get(challengeId).attemptCount, 1)

  const verified = await post('/api/auth/verify', { challengeId, code: '123456' })
  assert.equal(verified.statusCode, 200)
  assert.deepEqual(verified.json(), {
    patient: {
      displayName: 'Patricia Portal Demo',
      patientNumber: 'PT-DEMO01',
    },
  })
  const setCookie = verified.headers['set-cookie']
  assert.match(setCookie, /__Host-portal_session=/)
  assert.match(setCookie, /Secure/i)
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Lax/i)
  assert.match(setCookie, /Path=\//i)
  const cookie = setCookie.split(';')[0]
  const rawToken = cookie.split('=')[1]
  assert.ok(store.sessions.has(sha256(rawToken)))
  assert.ok(!store.sessions.has(rawToken))

  const replay = await post('/api/auth/verify', { challengeId, code: '123456' })
  assert.equal(replay.statusCode, 401)

  const me = await app.inject({ url: '/api/me', headers: { cookie } })
  assert.equal(me.statusCode, 200)
  assert.equal(me.headers['cache-control'], 'no-store')

  const logout = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: { origin: config.publicOrigin, cookie },
  })
  assert.equal(logout.statusCode, 204)
  const afterLogout = await app.inject({ url: '/api/me', headers: { cookie } })
  assert.equal(afterLogout.statusCode, 401)
})

test('expired OTPs fail and disabled portal access cannot create a session', async () => {
  const expiredStart = await startKnownLogin()
  store.challenges.get(expiredStart.json().challengeId).expiresAt =
    new Date(currentTime.getTime() - 1)
  const expired = await post('/api/auth/verify', {
    challengeId: expiredStart.json().challengeId,
    code: '123456',
  })
  assert.equal(expired.statusCode, 401)

  const disabledStart = await startKnownLogin()
  store.patient.enabled = false
  const disabled = await post('/api/auth/verify', {
    challengeId: disabledStart.json().challengeId,
    code: '123456',
  })
  store.patient.enabled = true
  assert.equal(disabled.statusCode, 401)
})

test('five incorrect OTP attempts lock the challenge and resend invalidates the old code', async () => {
  const first = await startKnownLogin()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await post('/api/auth/verify', {
      challengeId: first.json().challengeId,
      code: '000000',
    })
    assert.equal(response.statusCode, 401)
  }
  const locked = await post('/api/auth/verify', {
    challengeId: first.json().challengeId,
    code: '123456',
  })
  assert.equal(locked.statusCode, 401)

  const second = await startKnownLogin()
  const resent = await post('/api/auth/resend', {
    challengeId: second.json().challengeId,
  })
  assert.equal(resent.statusCode, 202)
  assert.notEqual(resent.json().challengeId, second.json().challengeId)
  const oldCode = await post('/api/auth/verify', {
    challengeId: second.json().challengeId,
    code: '123456',
  })
  assert.equal(oldCode.statusCode, 401)
})

test('patient endpoints require authentication and enforce patient ownership and publication', async () => {
  const unauthenticated = await app.inject({ url: '/api/me/appointments' })
  assert.equal(unauthenticated.statusCode, 401)

  const started = await startKnownLogin()
  const verified = await post('/api/auth/verify', {
    challengeId: started.json().challengeId,
    code: '123456',
  })
  const cookie = verified.headers['set-cookie'].split(';')[0]

  const appointments = await app.inject({
    url: '/api/me/appointments?scope=upcoming',
    headers: { cookie },
  })
  assert.deepEqual(
    appointments.json().appointments.map(({ id }) => id),
    ['30000000-0000-4000-8000-000000000001'],
  )
  assert.equal(appointments.headers['cache-control'], 'no-store')

  const otherAppointment = await app.inject({
    url: '/api/me/appointments/30000000-0000-4000-8000-000000000099',
    headers: { cookie },
  })
  assert.equal(otherAppointment.statusCode, 404)

  const records = await app.inject({
    url: '/api/me/records',
    headers: { cookie },
  })
  assert.deepEqual(
    records.json().records.map(({ id }) => id),
    ['50000000-0000-4000-8000-000000000001'],
  )
  assert.equal(records.headers['cache-control'], 'no-store')

  for (const id of [
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000099',
  ]) {
    const hidden = await app.inject({
      url: `/api/me/records/${id}`,
      headers: { cookie },
    })
    assert.equal(hidden.statusCode, 404)
  }

  const plan = await app.inject({
    url: '/api/me/treatment-plan',
    headers: { cookie },
  })
  assert.equal(plan.json().treatmentPlan.id, '40000000-0000-4000-8000-000000000001')
  assert.equal(plan.headers['cache-control'], 'no-store')

  const patientSelector = await app.inject({
    url: `/api/me/appointments?scope=upcoming&patientId=${store.otherPatientId}`,
    headers: { cookie },
  })
  assert.equal(patientSelector.statusCode, 400)
})

test('idle and absolute session timeouts and health readiness fail closed', async () => {
  const started = await startKnownLogin()
  const verified = await post('/api/auth/verify', {
    challengeId: started.json().challengeId,
    code: '123456',
  })
  const cookie = verified.headers['set-cookie'].split(';')[0]
  currentTime = new Date(currentTime.getTime() + 31 * 60_000)
  const expired = await app.inject({ url: '/api/me', headers: { cookie } })
  assert.equal(expired.statusCode, 401)

  const absoluteStart = await startKnownLogin()
  const absoluteVerified = await post('/api/auth/verify', {
    challengeId: absoluteStart.json().challengeId,
    code: '123456',
  })
  const absoluteCookie = absoluteVerified.headers['set-cookie'].split(';')[0]
  const absoluteToken = absoluteCookie.split('=')[1]
  currentTime = new Date(currentTime.getTime() + 9 * 60 * 60_000)
  store.sessions.get(sha256(absoluteToken)).lastSeenAt = new Date(currentTime)
  const absoluteExpired = await app.inject({
    url: '/api/me',
    headers: { cookie: absoluteCookie },
  })
  assert.equal(absoluteExpired.statusCode, 401)

  assert.equal((await app.inject({ url: '/api/health' })).statusCode, 200)
  store.healthy = false
  const unavailable = await app.inject({ url: '/api/health' })
  assert.equal(unavailable.statusCode, 503)
  store.healthy = true
})

test('SPA deep links return the React application while unknown API routes stay JSON 404s', async () => {
  const staticApp = await buildApp({
    config,
    store: new MemoryStore(),
    sms: { sendOtp: async () => {} },
    staticDir: fileURLToPath(new URL('./fixtures/static/', import.meta.url)),
    logger: false,
  })
  await staticApp.ready()
  try {
    const deepLink = await staticApp.inject({ url: '/portal/records' })
    assert.equal(deepLink.statusCode, 200)
    assert.match(deepLink.headers['content-type'], /text\/html/)
    assert.match(deepLink.body, /id="root"/)

    const missingApi = await staticApp.inject({ url: '/api/does-not-exist' })
    assert.equal(missingApi.statusCode, 404)
    assert.equal(missingApi.json().error.code, 'NOT_FOUND')
  } finally {
    await staticApp.close()
  }
})
