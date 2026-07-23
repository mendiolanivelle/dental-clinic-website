import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto'

export const SESSION_COOKIE = '__Host-portal_session'

export const normalizeName = (value) =>
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en')

export const normalizePatientNumber = (value) => value.normalize('NFKC').trim().toUpperCase()

export const hmacDigest = (pepper, value) =>
  createHmac('sha256', pepper).update(value).digest('hex')

export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export const createOtp = (randomIntFn = randomInt) =>
  String(randomIntFn(0, 1_000_000)).padStart(6, '0')

export const createSessionToken = (randomBytesFn = randomBytes) =>
  randomBytesFn(32).toString('base64url')

export const challengeDigest = (pepper, challengeId, code) =>
  hmacDigest(pepper, `${challengeId}:${code}`)

export const lookupDigest = (pepper, normalizedName, patientNumber) =>
  hmacDigest(pepper, `${normalizedName}\u0000${patientNumber}`)

export const ipDigest = (pepper, ip) => hmacDigest(pepper, ip || 'unknown')

export const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60_000)
export const addHours = (date, hours) => new Date(date.getTime() + hours * 3_600_000)

export const sessionCookieOptions = Object.freeze({
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
})

export const genericVerificationError = Object.freeze({
  error: {
    code: 'INVALID_VERIFICATION_CODE',
    message: 'The verification code is invalid or expired.',
  },
})

export const authRequiredError = Object.freeze({
  error: {
    code: 'AUTH_REQUIRED',
    message: 'Please log in to continue.',
  },
})
