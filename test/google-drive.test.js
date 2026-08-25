import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import { createGoogleDriveStorage } from '../server/google-drive.js'

test('Google Drive prescription storage authenticates, uploads, reads, and removes private files', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const requests = []
  const image = Buffer.from('prescription-image')
  const fetchFn = async (url, options = {}) => {
    requests.push({ url, options })
    if (url === 'https://oauth2.test/token') {
      return Response.json({ access_token: 'test-token', expires_in: 3600 })
    }
    if (url.includes('/upload/')) return Response.json({ id: 'drive-file-1' })
    if (options.method === 'DELETE') return new Response(null, { status: 204 })
    return new Response(image, { status: 200 })
  }
  const storage = createGoogleDriveStorage({
    googleDrivePrescriptionsFolderId: 'private-folder',
    googleDriveCredentials: {
      client_email: 'test@example.iam.gserviceaccount.com',
      private_key_id: 'test-key',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      token_uri: 'https://oauth2.test/token',
    },
  }, { fetchFn, now: () => 1_800_000_000_000 })

  assert.equal(await storage.upload({ bytes: image, mimeType: 'image/jpeg' }), 'drive-file-1')
  assert.deepEqual(await storage.download('drive-file-1'), image)
  await storage.remove('drive-file-1')
  assert.equal(requests.filter(({ url }) => url === 'https://oauth2.test/token').length, 1)
  assert.match(String(requests[1].options.body), /private-folder/)
  assert.equal(requests[2].options.headers.authorization, 'Bearer test-token')
})
