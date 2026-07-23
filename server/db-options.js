import { readFileSync } from 'node:fs'

const supabaseCa = readFileSync(
  new URL('../certs/supabase-ca.crt', import.meta.url),
  'utf8',
)
const sslQueryParameters = [
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'sslpassword',
  'sslnegotiation',
  'uselibpqcompat',
]

export const isSupabaseDatabaseHost = (hostname) =>
  hostname.endsWith('.supabase.co') ||
  hostname.endsWith('.supabase.com')

export function databaseClientOptions(databaseUrl) {
  let url
  try {
    url = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol')
  }

  const supabase = isSupabaseDatabaseHost(url.hostname.toLowerCase())
  if (supabase) {
    for (const parameter of sslQueryParameters) {
      url.searchParams.delete(parameter)
    }
  }

  return {
    connectionString: url.toString(),
    options: '-c search_path=dental_portal,public',
    ...(supabase && {
      ssl: {
        ca: supabaseCa,
        rejectUnauthorized: true,
      },
    }),
  }
}
