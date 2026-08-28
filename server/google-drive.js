import { createSign, randomUUID } from 'node:crypto'

const scope = 'https://www.googleapis.com/auth/drive'
const tokenGrant = 'urn:ietf:params:oauth:grant-type:jwt-bearer'

const base64url = (value) => Buffer.from(value).toString('base64url')

const googleError = async (label, response) => {
  const payload = await response.json().catch(() => null)
  const detail = payload?.error?.message
  return new Error(`${label} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
}

export function createGoogleDriveStorage(config, { fetchFn = globalThis.fetch, now = Date.now } = {}) {
  const credentials = config.googleDriveCredentials
  const folderId = config.googleDrivePrescriptionsFolderId
  if (!credentials || !folderId) return null

  let token = null
  let tokenExpiresAt = 0

  const accessToken = async () => {
    if (token && tokenExpiresAt > now() + 60_000) return token
    const issuedAt = Math.floor(now() / 1000)
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: credentials.private_key_id }))
    const claims = base64url(JSON.stringify({
      iss: credentials.client_email,
      scope,
      aud: credentials.token_uri,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }))
    const unsigned = `${header}.${claims}`
    const signature = createSign('RSA-SHA256').update(unsigned).sign(credentials.private_key).toString('base64url')
    const response = await fetchFn(credentials.token_uri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: tokenGrant, assertion: `${unsigned}.${signature}` }),
    })
    if (!response.ok) throw new Error(`Google authentication failed with HTTP ${response.status}`)
    const payload = await response.json()
    token = payload.access_token
    tokenExpiresAt = now() + Number(payload.expires_in || 3600) * 1000
    if (!token) throw new Error('Google authentication returned no access token')
    return token
  }

  const authorizedFetch = async (url, options = {}) => fetchFn(url, {
    ...options,
    headers: { ...options.headers, authorization: `Bearer ${await accessToken()}` },
  })

  return {
    async upload({ bytes, mimeType, prefix = 'prescription' }) {
      const boundary = `smilecare-${randomUUID()}`
      const safePrefix = String(prefix).replace(/[^a-z0-9-]/giu, '-').slice(0, 40) || 'private-file'
      const metadata = JSON.stringify({
        name: `${safePrefix}-${randomUUID()}.${mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'}`,
        parents: [folderId],
      })
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
        bytes,
        Buffer.from(`\r\n--${boundary}--`),
      ])
      const response = await authorizedFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
        method: 'POST',
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body,
      })
      if (!response.ok) throw await googleError('Google Drive upload', response)
      const file = await response.json()
      if (!file.id) throw new Error('Google Drive returned no file ID')
      return file.id
    },

    async download(fileId, maxBytes = 2 * 1024 * 1024) {
      const response = await authorizedFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)
      if (!response.ok) throw await googleError('Google Drive download', response)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (!bytes.length || bytes.length > maxBytes) throw new Error('Google Drive returned an invalid private image')
      return bytes
    },

    async remove(fileId) {
      const response = await authorizedFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { method: 'DELETE' })
      if (!response.ok && response.status !== 404) throw await googleError('Google Drive cleanup', response)
    },
  }
}
