import { createHash, createHmac, randomBytes } from 'node:crypto'

export const SESSION_COOKIE = '__Host-portal_session'
export const STAFF_SESSION_COOKIE = '__Host-staff_session'

export const normalizeName = (value) =>
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en')

export const normalizePatientNumber = (value) => value.normalize('NFKC').trim().toUpperCase()

export const normalizeMobileNumber = (value) => {
  const digits = value.normalize('NFKC').replace(/[^0-9]/gu, '')
  const local = digits.startsWith('63') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits
  return /^9[0-9]{9}$/.test(local) ? `63${local}` : ''
}

export const hmacDigest = (pepper, value) =>
  createHmac('sha256', pepper).update(value).digest('hex')

export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export const createSessionToken = (randomBytesFn = randomBytes) =>
  randomBytesFn(32).toString('base64url')


export const ipDigest = (pepper, ip) => hmacDigest(pepper, ip || 'unknown')

export const addHours = (date, hours) => new Date(date.getTime() + hours * 3_600_000)

export const sessionCookieOptions = Object.freeze({
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
})

export const genericLoginError = Object.freeze({
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'The submitted patient details are not recognized.',
  },
})

export const authRequiredError = Object.freeze({
  error: {
    code: 'AUTH_REQUIRED',
    message: 'Please log in to continue.',
  },
})
