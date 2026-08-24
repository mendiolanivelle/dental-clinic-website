import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../server/app.js'
import { normalizeName, normalizePatientNumber, sha256 } from '../server/auth.js'
import { loadConfig } from '../server/config.js'

const config = {
  nodeEnv: 'test',
  publicOrigin: 'https://dental.test',
  databaseUrl: 'postgres://unused',
  sessionPepper: 'session-pepper-for-tests-only-000000000',
  sessionIdleMinutes: 30,
  sessionAbsoluteHours: 8,
  loginMaxAttempts: 50,
  loginWindowMinutes: 15,
}

class MemoryStore {
  constructor() {
    this.patient = {
      id: '10000000-0000-4000-8000-000000000001',
      displayName: 'Patricia Portal Demo',
      patientNumber: 'PT-DEMO01',
      enabled: true,
    }
    this.staff = {
      id: '80000000-0000-4000-8000-000000000001',
      authUserId: '90000000-0000-4000-8000-000000000001',
      displayName: 'Rina Reception',
      email: 'reception@dental.test',
      role: 'receptionist',
      active: true,
    }
    this.otherPatientId = '10000000-0000-4000-8000-000000000002'
    this.dentist = {
      id: '20000000-0000-4000-8000-000000000001',
      displayName: 'Dr. Andrea Sample',
    }
    this.services = [
      {
        id: '60000000-0000-4000-8000-000000000001',
        name: 'Cleaning',
        durationMinutes: 45,
        patientDescription: 'Routine dental cleaning.',
      },
      {
        id: '60000000-0000-4000-8000-000000000002',
        name: 'Brace Adjustment',
        durationMinutes: 30,
        patientDescription: 'Scheduled orthodontic adjustment.',
      },
    ]
    this.appointmentRequests = []
    this.appointments = [
      {
        patientId: this.patient.id,
        id: '30000000-0000-4000-8000-000000000001',
        typeName: 'Brace Adjustment',
        startsAt: '2030-01-01T02:00:00.000Z',
        endsAt: '2030-01-01T02:30:00.000Z',
        status: 'confirmed',
        dentistId: this.dentist.id,
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
    this.sessions = new Map()
    this.staffSessions = new Map()
    this.charges = []
    this.audits = []
    this.healthy = true
  }

  async health() {
    if (!this.healthy) throw new Error('unavailable')
  }

  async createSessionForLogin(input) {
    if (
      !this.patient.enabled ||
      input.normalizedName !== normalizeName(this.patient.displayName) ||
      input.patientNumber !== this.patient.patientNumber
    ) {
      this.audits.push({
        actorType: 'anonymous',
        action: 'portal.login_failed',
        ...input.audit,
      })
      return null
    }
    this.sessions.set(input.tokenDigest, {
      patient: this.patient,
      lastSeenAt: input.now,
      absoluteExpiresAt: input.absoluteExpiresAt,
      revokedAt: null,
    })
    this.audits.push({
      actorType: 'patient',
      actorId: this.patient.id,
      action: 'portal.login_succeeded',
      ...input.audit,
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

  async createStaffSessionForLogin(input) {
    if (!this.staff.active || input.authUserId !== this.staff.authUserId) return null
    this.staffSessions.set(input.tokenDigest, {
      staff: this.staff,
      lastSeenAt: input.now,
      absoluteExpiresAt: input.absoluteExpiresAt,
      revokedAt: null,
    })
    this.audits.push({
      actorType: 'staff',
      actorId: this.staff.id,
      action: 'staff.login_succeeded',
      ...input.audit,
    })
    return this.staff
  }

  async authenticateStaffSession(tokenDigest, now, idleCutoff) {
    const session = this.staffSessions.get(tokenDigest)
    if (!session || session.revokedAt || session.absoluteExpiresAt <= now || session.lastSeenAt < idleCutoff || !session.staff.active) return null
    session.lastSeenAt = now
    return session.staff
  }

  async revokeStaffSession(tokenDigest, now) {
    const session = this.staffSessions.get(tokenDigest)
    if (session) session.revokedAt = now
  }

  async addAudit(event) {
    this.audits.push(event)
  }

  async getDashboard() {
    return {
      nextAppointment: null,
      treatmentPlan: null,
      recentRecord: null,
      services: this.services,
    }
  }

  async listServices() {
    return this.services
  }

  async listAppointmentRequests(patientId) {
    return this.appointmentRequests
      .filter((request) => request.patientId === patientId)
      .map(({ patientId: _patientId, ...request }) => request)
  }

  async getReceptionDashboard() {
    return {
      pendingRequests: this.appointmentRequests.filter(({ status }) => status === 'requested').length,
      todayAppointments: [],
      todayRequests: [],
    }
  }

  async listReceptionRequests() {
    return this.appointmentRequests.map(({ patientId: _patientId, ...request }) => ({
      ...request,
      patient: {
        id: this.patient.id,
        displayName: this.patient.displayName,
        patientNumber: this.patient.patientNumber,
        phone: '+639000000001',
      },
    }))
  }

  async listReceptionCalendar() {
    return { appointments: [], appointmentRequests: await this.listReceptionRequests() }
  }

  async listReceptionBilling() {
    return {
      awaitingCheckout: this.appointments
        .filter(({ status }) => ['scheduled', 'confirmed'].includes(status))
        .map((appointment) => ({
          ...appointment,
          patient: {
            id: appointment.patientId,
            displayName: this.patient.displayName,
            patientNumber: this.patient.patientNumber,
            phone: '+639000000001',
          },
        })),
      charges: this.charges,
      todayPayments: [],
    }
  }

  async createPatientCheckout(input) {
    const appointment = this.appointments.find(
      ({ id, status }) => id === input.appointmentId && ['scheduled', 'confirmed'].includes(status),
    )
    if (!appointment) return { outcome: 'not_found' }
    const totalCents = input.subtotalCents - input.discountCents
    if (totalCents <= 0 || input.paymentAmountCents > totalCents) return { outcome: 'invalid_amount' }
    appointment.status = 'completed'
    const charge = {
      id: 'a0000000-0000-4000-8000-000000000001',
      recordNumber: '1',
      appointmentId: appointment.id,
      description: input.description,
      subtotalCents: input.subtotalCents,
      discountCents: input.discountCents,
      totalCents,
      status: input.paymentAmountCents === totalCents ? 'paid' : input.paymentAmountCents ? 'partially_paid' : 'unpaid',
      invoiceReference: input.invoiceReference,
      patient: { id: this.patient.id, displayName: this.patient.displayName, patientNumber: this.patient.patientNumber },
      payments: input.paymentAmountCents ? [{
        id: 'b0000000-0000-4000-8000-000000000001',
        amountCents: input.paymentAmountCents,
        method: input.paymentMethod,
        reference: input.paymentReference,
        status: 'posted',
        receivedAt: input.now,
      }] : [],
      paidCents: input.paymentAmountCents,
      balanceCents: totalCents - input.paymentAmountCents,
      createdAt: input.now,
    }
    this.charges.unshift(charge)
    return { outcome: 'created', charge }
  }

  async addPatientPayment(input) {
    const charge = this.charges.find(({ id }) => id === input.chargeId)
    if (!charge) return { outcome: 'not_found' }
    if (input.amountCents > charge.balanceCents) return { outcome: 'amount_exceeds_balance' }
    const payment = {
      id: 'b0000000-0000-4000-8000-000000000002',
      amountCents: input.amountCents,
      method: input.method,
      reference: input.reference,
      status: 'posted',
      receivedAt: input.now,
    }
    charge.payments.push(payment)
    charge.paidCents += input.amountCents
    charge.balanceCents -= input.amountCents
    charge.status = charge.balanceCents ? 'partially_paid' : 'paid'
    return { outcome: 'created', paymentId: payment.id, charge }
  }

  async voidPatientPayment(input) {
    const charge = this.charges.find(({ payments }) => payments.some(({ id }) => id === input.paymentId))
    const payment = charge?.payments.find(({ id, status }) => id === input.paymentId && status === 'posted')
    if (!payment) return { outcome: 'not_found' }
    payment.status = 'voided'
    payment.voidReason = input.reason
    charge.paidCents -= payment.amountCents
    charge.balanceCents += payment.amountCents
    charge.status = charge.paidCents ? 'partially_paid' : 'unpaid'
    return { outcome: 'voided', charge }
  }

  async listPatientBilling(patientId) {
    return this.charges
      .filter(({ patient }) => patient.id === patientId)
      .map((charge) => ({
        ...charge,
        payments: charge.payments.filter(({ status }) => status === 'posted'),
      }))
  }

  async updateReceptionRequest({ id, action }) {
    const request = this.appointmentRequests.find((item) => item.id === id && item.status === 'requested')
    if (!request) return { outcome: 'not_found' }
    request.status = action === 'confirm' ? 'confirmed' : 'declined'
    if (action === 'confirm') {
      this.appointments.push({
        id: '31000000-0000-4000-8000-000000000001',
        patientId: request.patientId,
        typeName: request.serviceName,
        startsAt: request.requestedStartAt,
        endsAt: request.requestedEndAt,
        status: 'confirmed',
        dentistId: request.dentistId,
        dentistName: request.dentistName,
      })
    }
    return { outcome: 'updated' }
  }

  async searchReceptionPatients(query) {
    return `${this.patient.displayName} ${this.patient.patientNumber}`.toLowerCase().includes(query.toLowerCase())
      ? [{
          id: this.patient.id,
          displayName: this.patient.displayName,
          patientNumber: this.patient.patientNumber,
          phone: '+639000000001',
          age: 28,
          gender: 'female',
        }]
      : []
  }

  async createReceptionPatient(input) {
    if (input.normalizedName === normalizeName(this.patient.displayName)) return { outcome: 'already_exists' }
    const patient = {
      id: '10000000-0000-4000-8000-000000000003',
      displayName: input.displayName,
      patientNumber: '00001',
      phone: input.phoneE164,
      age: input.age,
      gender: input.gender,
      enabled: true,
    }
    this.createdPatient = patient
    return { outcome: 'created', patient }
  }

  async listAvailability(date, now) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (day === 0) return []
    return Array.from({ length: 8 }, (_, index) => {
      const startsAt = new Date(`${date}T${String(index + 1).padStart(2, '0')}:00:00.000Z`)
      const endsAt = new Date(startsAt.getTime() + 60 * 60_000)
      const busyAppointment = this.appointments.some((appointment) =>
        appointment.dentistId === this.dentist.id &&
        ['scheduled', 'confirmed'].includes(appointment.status) &&
        new Date(appointment.startsAt) < endsAt &&
        new Date(appointment.endsAt) > startsAt)
      const busyRequest = this.appointmentRequests.some((request) =>
        request.dentistId === this.dentist.id &&
        ['requested', 'confirmed'].includes(request.status) &&
        request.requestedStartAt === startsAt.toISOString())
      return {
        dentistId: this.dentist.id,
        dentistName: this.dentist.displayName,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        available: startsAt > now && !busyAppointment && !busyRequest,
      }
    })
  }

  async createAppointmentRequest(input) {
    const service = this.services.find((item) => item.id === input.appointmentTypeId)
    const slot = (await this.listAvailability(input.startsAt.slice(0, 10), input.now))
      .find((item) =>
        item.dentistId === input.dentistId &&
        item.startsAt === input.startsAt &&
        item.available)
    if (!service || !slot) return null
    const request = {
      patientId: input.patientId,
      id: '70000000-0000-4000-8000-000000000001',
      serviceId: service.id,
      serviceName: service.name,
      dentistId: slot.dentistId,
      dentistName: slot.dentistName,
      requestedStartAt: slot.startsAt,
      requestedEndAt: slot.endsAt,
      preferredDate: new Date(new Date(slot.startsAt).getTime() + 8 * 60 * 60_000).toISOString().slice(0, 10),
      timePreference: new Date(slot.startsAt).getUTCHours() < 4 ? 'morning' : 'afternoon',
      patientNote: input.patientNote,
      status: 'requested',
      clinicNote: null,
      createdAt: input.now,
    }
    this.appointmentRequests.unshift(request)
    const { patientId: _patientId, ...result } = request
    return result
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
let currentTime = new Date('2026-07-23T00:00:00.000Z')
const app = await buildApp({
  config,
  store,
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

const loginKnownPatient = () =>
  post('/api/auth/login', {
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
      }),
    /Invalid configuration/,
  )
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'prod',
        DATABASE_URL: 'postgres://db',
        PUBLIC_ORIGIN: 'http://dental.test',
        SESSION_PEPPER: 'session-pepper-for-tests-only-000000000',
      }),
    /NODE_ENV must be development, test, or production/,
  )
})

test('state-changing requests require the configured Origin', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { fullName: 'Patricia Portal Demo', patientNumber: 'PT-DEMO01' },
  })
  assert.equal(response.statusCode, 403)
  assert.equal(response.json().error.code, 'INVALID_ORIGIN')
})

test('request schemas reject missing and unexpected login fields', async () => {
  const missing = await post('/api/auth/login', {
    fullName: 'Patricia Portal Demo',
  })
  const unexpected = await post('/api/auth/login', {
    fullName: 'Patricia Portal Demo',
    patientNumber: 'PT-DEMO01',
    patientId: store.otherPatientId,
  })
  assert.equal(missing.statusCode, 400)
  assert.equal(unexpected.statusCode, 400)
})

test('direct login returns a generic failure and exposes no OTP endpoints', async () => {
  const auditCount = store.audits.length
  const unknown = await post('/api/auth/login', {
    fullName: 'Unknown Demo Person',
    patientNumber: 'PT-NOBODY',
  })
  assert.equal(unknown.statusCode, 401)
  assert.deepEqual(unknown.json(), {
    error: {
      code: 'INVALID_CREDENTIALS',
      message: 'The name or patient ID is not recognized.',
    },
  })
  assert.doesNotMatch(unknown.body, /Unknown Demo Person|PT-NOBODY/)
  assert.equal(unknown.headers['cache-control'], 'no-store')
  assert.deepEqual(
    store.audits.slice(auditCount).map(({ actorType, action }) => ({
      actorType,
      action,
    })),
    [{ actorType: 'anonymous', action: 'portal.login_failed' }],
  )

  for (const url of [
    '/api/auth/start',
    '/api/auth/verify',
    '/api/auth/resend',
  ]) {
    assert.equal((await post(url, {})).statusCode, 404)
  }
})

test('direct login creates a hashed opaque session and logout revokes it', async () => {
  const auditCount = store.audits.length
  const loggedIn = await loginKnownPatient()
  assert.equal(loggedIn.statusCode, 200)
  assert.deepEqual(loggedIn.json(), {
    patient: {
      displayName: 'Patricia Portal Demo',
      patientNumber: 'PT-DEMO01',
    },
  })
  const setCookie = loggedIn.headers['set-cookie']
  assert.match(setCookie, /__Host-portal_session=/)
  assert.match(setCookie, /Secure/i)
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Lax/i)
  assert.match(setCookie, /Path=\//i)
  const cookie = setCookie.split(';')[0]
  const rawToken = cookie.split('=')[1]
  assert.ok(store.sessions.has(sha256(rawToken)))
  assert.ok(!store.sessions.has(rawToken))
  assert.deepEqual(
    store.audits.slice(auditCount).map(({ actorType, action }) => ({
      actorType,
      action,
    })),
    [{ actorType: 'patient', action: 'portal.login_succeeded' }],
  )

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

test('disabled portal access cannot create a session', async () => {
  store.patient.enabled = false
  const disabled = await loginKnownPatient()
  store.patient.enabled = true
  assert.equal(disabled.statusCode, 401)
})

test('direct login counts only failed credentials toward the client IP limit', async () => {
  const limitedApp = await buildApp({
    config: { ...config, loginMaxAttempts: 2 },
    store: new MemoryStore(),
    staticDir: false,
    logger: false,
  })
  await limitedApp.ready()
  try {
    const validPayload = {
      fullName: 'Patricia Portal Demo',
      patientNumber: 'PT-DEMO01',
    }
    const payload = {
      fullName: 'Unknown Demo Person',
      patientNumber: 'PT-NOBODY',
    }
    const inject = (loginPayload) =>
      limitedApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: config.publicOrigin },
        payload: loginPayload,
      })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const loggedIn = await inject(validPayload)
      assert.equal(loggedIn.statusCode, 200)
      const cookie = loggedIn.headers['set-cookie'].split(';')[0]
      const loggedOut = await limitedApp.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { origin: config.publicOrigin, cookie },
      })
      assert.equal(loggedOut.statusCode, 204)
    }

    assert.equal((await inject(payload)).statusCode, 401)
    assert.equal((await inject(payload)).statusCode, 401)
    const limited = await inject(payload)
    assert.equal(limited.statusCode, 429, limited.body)
    assert.equal(limited.json().error.code, 'RATE_LIMITED')
  } finally {
    await limitedApp.close()
  }
})

test('reception staff use a separate protected session and can confirm booking requests', async () => {
  const staffStore = new MemoryStore()
  staffStore.appointmentRequests.push({
    patientId: staffStore.patient.id,
    id: '70000000-0000-4000-8000-000000000010',
    serviceId: staffStore.services[0].id,
    serviceName: staffStore.services[0].name,
    dentistId: staffStore.dentist.id,
    dentistName: staffStore.dentist.displayName,
    requestedStartAt: '2030-01-02T01:00:00.000Z',
    requestedEndAt: '2030-01-02T02:00:00.000Z',
    preferredDate: '2030-01-02',
    timePreference: 'morning',
    patientNote: 'Please confirm.',
    status: 'requested',
    clinicNote: null,
    createdAt: currentTime.toISOString(),
  })
  const staffApp = await buildApp({
    config,
    store: staffStore,
    staticDir: false,
    logger: false,
    verifyStaffCredentials: async ({ email, password }) =>
      email === staffStore.staff.email && password === 'correct-password'
        ? { authUserId: staffStore.staff.authUserId, email }
        : null,
  })
  await staffApp.ready()
  const staffPost = (url, payload) => staffApp.inject({
    method: 'POST',
    url,
    headers: { origin: config.publicOrigin },
    payload,
  })
  try {
    const invalid = await staffPost('/api/staff/auth/login', {
      email: staffStore.staff.email,
      password: 'wrong-password',
    })
    assert.equal(invalid.statusCode, 401)
    assert.equal(invalid.json().error.code, 'INVALID_CREDENTIALS')

    const loggedIn = await staffPost('/api/staff/auth/login', {
      email: staffStore.staff.email,
      password: 'correct-password',
    })
    assert.equal(loggedIn.statusCode, 200)
    assert.equal(loggedIn.json().staff.role, 'receptionist')
    const setCookie = loggedIn.headers['set-cookie']
    assert.match(setCookie, /__Host-staff_session=/)
    const cookie = setCookie.split(';')[0]
    assert.ok(staffStore.staffSessions.has(sha256(cookie.split('=')[1])))

    const me = await staffApp.inject({ url: '/api/staff/me', headers: { cookie } })
    assert.equal(me.statusCode, 200)
    assert.equal(me.json().staff.displayName, 'Rina Reception')
    assert.equal((await staffApp.inject({ url: '/api/staff/me' })).statusCode, 401)

    const patients = await staffApp.inject({
      url: '/api/staff/patients?q=Patricia',
      headers: { cookie },
    })
    assert.equal(patients.statusCode, 200)
    assert.equal(patients.json().patients[0].patientNumber, 'PT-DEMO01')

    const missingPatients = await staffApp.inject({
      url: '/api/staff/patients?q=New Patient',
      headers: { cookie },
    })
    assert.equal(missingPatients.statusCode, 200)
    assert.deepEqual(missingPatients.json().patients, [])

    const createdPatient = await staffApp.inject({
      method: 'POST',
      url: '/api/staff/patients',
      headers: { origin: config.publicOrigin, cookie },
      payload: {
        displayName: 'New Patient',
        phone: '+639123456789',
        age: 34,
        gender: 'prefer_not_to_say',
      },
    })
    assert.equal(createdPatient.statusCode, 201)
    assert.match(createdPatient.json().patient.patientNumber, /^\d{5}$/)
    assert.equal(createdPatient.json().patient.displayName, 'New Patient')
    assert.equal(createdPatient.json().patient.age, 34)

    const billing = await staffApp.inject({ url: '/api/staff/billing', headers: { cookie } })
    assert.equal(billing.statusCode, 200)
    assert.equal(billing.json().awaitingCheckout[0].id, '30000000-0000-4000-8000-000000000001')

    const checkout = await staffApp.inject({
      method: 'POST',
      url: '/api/staff/appointments/30000000-0000-4000-8000-000000000001/checkout',
      headers: { origin: config.publicOrigin, cookie },
      payload: {
        description: 'Brace adjustment',
        subtotalCents: 250000,
        discountCents: 50000,
        paymentAmountCents: 100000,
        paymentMethod: 'cash',
        invoiceReference: 'INV-1001',
      },
    })
    assert.equal(checkout.statusCode, 201)
    assert.equal(checkout.json().charge.status, 'partially_paid')
    assert.equal(checkout.json().charge.balanceCents, 100000)

    const finalPayment = await staffApp.inject({
      method: 'POST',
      url: `/api/staff/charges/${checkout.json().charge.id}/payments`,
      headers: { origin: config.publicOrigin, cookie },
      payload: { amountCents: 100000, method: 'gcash', reference: 'GC-1001' },
    })
    assert.equal(finalPayment.statusCode, 201)
    assert.equal(finalPayment.json().charge.status, 'paid')

    const voided = await staffApp.inject({
      method: 'POST',
      url: `/api/staff/payments/${finalPayment.json().charge.payments[1].id}/void`,
      headers: { origin: config.publicOrigin, cookie },
      payload: { reason: 'Incorrect transaction reference' },
    })
    assert.equal(voided.statusCode, 200)
    assert.equal(voided.json().charge.status, 'partially_paid')

    const patientLogin = await staffPost('/api/auth/login', {
      fullName: staffStore.patient.displayName,
      patientNumber: staffStore.patient.patientNumber,
    })
    const patientCookie = patientLogin.headers['set-cookie'].split(';')[0]
    const patientBilling = await staffApp.inject({ url: '/api/me/billing', headers: { cookie: patientCookie } })
    assert.equal(patientBilling.statusCode, 200)
    assert.equal(patientBilling.json().charges[0].payments.length, 1)
    assert.equal(patientBilling.json().charges[0].balanceCents, 100000)

    const confirmed = await staffApp.inject({
      method: 'PATCH',
      url: '/api/staff/appointment-requests/70000000-0000-4000-8000-000000000010',
      headers: { origin: config.publicOrigin, cookie },
      payload: { action: 'confirm' },
    })
    assert.equal(confirmed.statusCode, 204)
    assert.equal(staffStore.appointmentRequests[0].status, 'confirmed')
    assert.ok(staffStore.appointments.some(({ id }) => id === '31000000-0000-4000-8000-000000000001'))

    const logout = await staffApp.inject({
      method: 'POST',
      url: '/api/staff/auth/logout',
      headers: { origin: config.publicOrigin, cookie },
    })
    assert.equal(logout.statusCode, 204)
    assert.equal((await staffApp.inject({ url: '/api/staff/me', headers: { cookie } })).statusCode, 401)
  } finally {
    await staffApp.close()
  }
})

test('patient endpoints require authentication and enforce patient ownership and publication', async () => {
  const unauthenticated = await app.inject({ url: '/api/me/appointments' })
  assert.equal(unauthenticated.statusCode, 401)

  const loggedIn = await loginKnownPatient()
  const cookie = loggedIn.headers['set-cookie'].split(';')[0]

  const services = await app.inject({
    url: '/api/me/services',
    headers: { cookie },
  })
  assert.equal(services.statusCode, 200)
  assert.deepEqual(services.json().services.map(({ name }) => name), ['Cleaning', 'Brace Adjustment'])

  const availability = await app.inject({
    url: '/api/me/availability?date=2030-01-01',
    headers: { cookie },
  })
  assert.equal(availability.statusCode, 200)
  assert.equal(availability.json().slotMinutes, 60)
  assert.equal(availability.json().timezone, 'Asia/Manila')
  assert.equal(availability.json().slots.length, 8)
  assert.equal(
    availability.json().slots.find(({ startsAt }) => startsAt === '2030-01-01T02:00:00.000Z').available,
    false,
  )

  const createdRequest = await app.inject({
    method: 'POST',
    url: '/api/me/appointment-requests',
    headers: { origin: config.publicOrigin, cookie },
    payload: {
      appointmentTypeId: '60000000-0000-4000-8000-000000000001',
      dentistId: '20000000-0000-4000-8000-000000000001',
      startsAt: '2030-01-01T01:00:00.000Z',
      patientNote: 'Sensitive tooth on the left side.',
    },
  })
  assert.equal(createdRequest.statusCode, 201)
  assert.deepEqual(createdRequest.json().appointmentRequest, {
    id: '70000000-0000-4000-8000-000000000001',
    serviceId: '60000000-0000-4000-8000-000000000001',
    serviceName: 'Cleaning',
    dentistId: '20000000-0000-4000-8000-000000000001',
    dentistName: 'Dr. Andrea Sample',
    requestedStartAt: '2030-01-01T01:00:00.000Z',
    requestedEndAt: '2030-01-01T02:00:00.000Z',
    preferredDate: '2030-01-01',
    timePreference: 'morning',
    patientNote: 'Sensitive tooth on the left side.',
    status: 'requested',
    clinicNote: null,
    createdAt: currentTime.toISOString(),
  })

  const duplicateRequest = await app.inject({
    method: 'POST',
    url: '/api/me/appointment-requests',
    headers: { origin: config.publicOrigin, cookie },
    payload: {
      appointmentTypeId: '60000000-0000-4000-8000-000000000002',
      dentistId: '20000000-0000-4000-8000-000000000001',
      startsAt: '2030-01-01T01:00:00.000Z',
    },
  })
  assert.equal(duplicateRequest.statusCode, 409)
  assert.equal(duplicateRequest.json().error.code, 'SLOT_UNAVAILABLE')

  const requestList = await app.inject({
    url: '/api/me/appointment-requests',
    headers: { cookie },
  })
  assert.equal(requestList.statusCode, 200)
  assert.equal(requestList.json().appointmentRequests.length, 1)

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

  const billing = await app.inject({ url: '/api/me/billing', headers: { cookie } })
  assert.equal(billing.statusCode, 200)
  assert.deepEqual(billing.json().charges, [])

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
  const loggedIn = await loginKnownPatient()
  const cookie = loggedIn.headers['set-cookie'].split(';')[0]
  currentTime = new Date(currentTime.getTime() + 31 * 60_000)
  const expired = await app.inject({ url: '/api/me', headers: { cookie } })
  assert.equal(expired.statusCode, 401)

  const absoluteLogin = await loginKnownPatient()
  const absoluteCookie = absoluteLogin.headers['set-cookie'].split(';')[0]
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
    staticDir: fileURLToPath(new URL('./fixtures/static/', import.meta.url)),
    logger: false,
  })
  await staticApp.ready()
  try {
    const deepLink = await staticApp.inject({ url: '/portal/records' })
    assert.equal(deepLink.statusCode, 200)
    assert.match(deepLink.headers['content-type'], /text\/html/)
    assert.match(deepLink.body, /id="root"/)

    const receptionLink = await staticApp.inject({ url: '/reception/calendar' })
    assert.equal(receptionLink.statusCode, 200)
    assert.match(receptionLink.body, /id="root"/)

    const missingApi = await staticApp.inject({ url: '/api/does-not-exist' })
    assert.equal(missingApi.statusCode, 404)
    assert.equal(missingApi.json().error.code, 'NOT_FOUND')
  } finally {
    await staticApp.close()
  }
})
