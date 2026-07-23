import { isSupabaseDatabaseHost } from './db-options.js'

const positiveInteger = (value, fallback, name, errors) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${name} must be a positive integer`)
  }
  return parsed
}

const required = (value, name, errors) => {
  const result = value?.trim()
  if (!result) errors.push(`${name} is required`)
  return result
}

export function loadConfig(env = process.env) {
  const errors = []
  const nodeEnv = env.NODE_ENV || 'development'
  const port = positiveInteger(env.PORT, 3000, 'PORT', errors)
  const databaseUrl = required(env.DATABASE_URL, 'DATABASE_URL', errors)
  const sessionPepper = required(env.SESSION_PEPPER, 'SESSION_PEPPER', errors)
  const otpPepper = required(env.OTP_PEPPER, 'OTP_PEPPER', errors)
  const publicOriginValue = required(
    env.PUBLIC_ORIGIN || 'http://localhost:3000',
    'PUBLIC_ORIGIN',
    errors,
  )
  const smsProvider = env.SMS_PROVIDER || 'development'

  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    errors.push('NODE_ENV must be development, test, or production')
  }

  let publicOrigin
  try {
    const url = new URL(publicOriginValue)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== publicOriginValue.replace(/\/$/, '')) {
      throw new Error()
    }
    publicOrigin = url.origin
  } catch {
    errors.push('PUBLIC_ORIGIN must be an origin without a path, query, or fragment')
  }

  if (sessionPepper && Buffer.byteLength(sessionPepper) < 32) {
    errors.push('SESSION_PEPPER must contain at least 32 bytes')
  }
  if (otpPepper && Buffer.byteLength(otpPepper) < 32) {
    errors.push('OTP_PEPPER must contain at least 32 bytes')
  }

  const smsApiUrl = env.SMS_API_URL?.trim() || ''
  const smsApiToken = env.SMS_API_TOKEN?.trim() || ''
  const smsSender = env.SMS_SENDER?.trim() || ''
  const devOtpCode = env.DEV_OTP_CODE?.trim() || ''
  const sessionIdleMinutes = positiveInteger(
    env.SESSION_IDLE_MINUTES,
    30,
    'SESSION_IDLE_MINUTES',
    errors,
  )
  const sessionAbsoluteHours = positiveInteger(
    env.SESSION_ABSOLUTE_HOURS,
    8,
    'SESSION_ABSOLUTE_HOURS',
    errors,
  )
  const otpExpiryMinutes = positiveInteger(
    env.OTP_EXPIRY_MINUTES,
    5,
    'OTP_EXPIRY_MINUTES',
    errors,
  )
  const otpMaxAttempts = positiveInteger(
    env.OTP_MAX_ATTEMPTS,
    5,
    'OTP_MAX_ATTEMPTS',
    errors,
  )
  const loginStartMax = positiveInteger(
    env.LOGIN_START_MAX,
    5,
    'LOGIN_START_MAX',
    errors,
  )
  const loginWindowMinutes = positiveInteger(
    env.LOGIN_WINDOW_MINUTES,
    15,
    'LOGIN_WINDOW_MINUTES',
    errors,
  )

  if (!['development', 'http'].includes(smsProvider)) {
    errors.push('SMS_PROVIDER must be development or http')
  }
  if (devOtpCode && !/^\d{6}$/.test(devOtpCode)) {
    errors.push('DEV_OTP_CODE must contain exactly six digits')
  }
  if (smsProvider === 'http') {
    if (!smsApiUrl) errors.push('SMS_API_URL is required for the http SMS provider')
    if (!smsApiToken) errors.push('SMS_API_TOKEN is required for the http SMS provider')
    if (!smsSender) errors.push('SMS_SENDER is required for the http SMS provider')
    try {
      const url = new URL(smsApiUrl)
      if (nodeEnv === 'production' && url.protocol !== 'https:') {
        errors.push('SMS_API_URL must use HTTPS in production')
      }
    } catch {
      errors.push('SMS_API_URL must be a valid URL')
    }
  }

  if (nodeEnv === 'production') {
    if (databaseUrl) {
      let database
      try {
        database = new URL(databaseUrl)
        if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error()
      } catch {
        errors.push('DATABASE_URL must be a valid PostgreSQL URL')
      }
      if (database) {
        if (!isSupabaseDatabaseHost(database.hostname.toLowerCase())) {
          errors.push('DATABASE_URL must use a Supabase database host in production')
        }
        if (!/^dental_portal_app(?:\.[a-z]{20})?$/.test(database.username)) {
          errors.push(
            'DATABASE_URL must use the least-privilege dental_portal_app role in production',
          )
        }
        if (database.port !== '5432') {
          errors.push(
            'DATABASE_URL must use Supabase direct or session-pooler port 5432 in production',
          )
        }
      }
    }
    if (publicOrigin && !publicOrigin.startsWith('https://')) {
      errors.push('PUBLIC_ORIGIN must use HTTPS in production')
    }
    if (smsProvider === 'development') {
      errors.push('SMS_PROVIDER=development is forbidden in production')
    }
    if (devOtpCode) {
      errors.push('DEV_OTP_CODE is forbidden in production')
    }
    for (const [name, value] of [
      ['SESSION_PEPPER', sessionPepper],
      ['OTP_PEPPER', otpPepper],
    ]) {
      if (/replace|change|development|example/i.test(value || '')) {
        errors.push(`${name} must not use a development placeholder in production`)
      }
    }
  }

  if (errors.length) {
    throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`)
  }

  return Object.freeze({
    nodeEnv,
    port,
    databaseUrl,
    publicOrigin,
    sessionPepper,
    otpPepper,
    smsProvider,
    smsApiUrl,
    smsApiToken,
    smsSender,
    devOtpCode,
    sessionIdleMinutes,
    sessionAbsoluteHours,
    otpExpiryMinutes,
    otpMaxAttempts,
    loginStartMax,
    loginWindowMinutes,
  })
}
