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
  const publicOriginValue = required(
    env.PUBLIC_ORIGIN || 'http://localhost:3000',
    'PUBLIC_ORIGIN',
    errors,
  )
  // ponytail: production defaults keep Coolify setup from disabling staff login;
  // override them with environment variables when deploying another project.
  const supabaseUrlValue = env.SUPABASE_URL?.trim() || (
    nodeEnv === 'production' ? 'https://csfhvyayuuvgtrbpnldq.supabase.co' : undefined
  )
  const supabasePublishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim() || (
    nodeEnv === 'production' ? 'sb_publishable_k8HnlMHTyeyY07HhOSPyPQ_aGHIvuG4' : undefined
  )

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

  let supabaseUrl
  if (supabaseUrlValue) {
    try {
      const url = new URL(supabaseUrlValue)
      if (url.protocol !== 'https:' || url.origin !== supabaseUrlValue.replace(/\/$/, '')) {
        throw new Error()
      }
      supabaseUrl = url.origin
    } catch {
      errors.push('SUPABASE_URL must be an HTTPS origin without a path')
    }
  }
  if (Boolean(supabaseUrlValue) !== Boolean(supabasePublishableKey)) {
    errors.push('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together')
  }

  if (sessionPepper && Buffer.byteLength(sessionPepper) < 32) {
    errors.push('SESSION_PEPPER must contain at least 32 bytes')
  }

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
  const loginMaxAttempts = positiveInteger(
    env.LOGIN_MAX_ATTEMPTS,
    5,
    'LOGIN_MAX_ATTEMPTS',
    errors,
  )
  const loginWindowMinutes = positiveInteger(
    env.LOGIN_WINDOW_MINUTES,
    15,
    'LOGIN_WINDOW_MINUTES',
    errors,
  )

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
    if (/replace|change|development|example/i.test(sessionPepper || '')) {
      errors.push(
        'SESSION_PEPPER must not use a development placeholder in production',
      )
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
    sessionIdleMinutes,
    sessionAbsoluteHours,
    loginMaxAttempts,
    loginWindowMinutes,
    supabaseUrl,
    supabasePublishableKey,
  })
}
