import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

export class StaffAuthError extends Error {
  constructor(code, statusCode) {
    super(code)
    this.code = code
    this.statusCode = statusCode
  }
}

export async function hashStaffPassword(password, randomBytesFn = randomBytes) {
  const salt = randomBytesFn(16).toString('base64')
  const hash = await scryptAsync(password, salt, 64)
  return { passwordSalt: salt, passwordHash: hash.toString('base64') }
}

export async function verifyStaffPassword(password, passwordSalt, passwordHash) {
  const expected = Buffer.from(passwordHash, 'base64')
  if (!passwordSalt || expected.length !== 64) return false
  const actual = await scryptAsync(password, passwordSalt, 64)
  return timingSafeEqual(actual, expected)
}

export function createStaffCredentialVerifier(config, fetchFn = globalThis.fetch) {
  return async ({ email, password }) => {
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      throw new StaffAuthError('STAFF_AUTH_UNAVAILABLE', 503)
    }

    let response
    try {
      response = await fetchFn(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: config.supabasePublishableKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })
    } catch {
      throw new StaffAuthError('STAFF_AUTH_UNAVAILABLE', 503)
    }

    if ([400, 401].includes(response.status)) return null
    if (response.status === 429) throw new StaffAuthError('RATE_LIMITED', 429)
    if (!response.ok) throw new StaffAuthError('STAFF_AUTH_UNAVAILABLE', 503)

    const payload = await response.json()
    if (!payload.user?.id) return null
    return { authUserId: payload.user.id, email: payload.user.email || email }
  }
}
