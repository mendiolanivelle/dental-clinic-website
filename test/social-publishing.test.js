import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { createStore } from '../server/store.js'
import {
  assertSocialPostPublishable,
  createSocialPublisher,
  decryptSocialToken,
  encryptSocialToken,
  normalizeSocialImage,
  SocialBlockedError,
} from '../server/social-publishing.js'

const settings = {
  clinicName: 'SmileCare Dental Clinic',
  primaryColor: '#176B68',
  secondaryColor: '#DFF3EF',
  fontFamily: 'Arial',
  brandVoice: 'Warm and professional',
  defaultLanguage: 'taglish',
  contactPhone: '09123456789',
  address: null,
  defaultCallToAction: 'Book an appointment',
  defaultHashtags: ['#SmileCare'],
  requiredDisclaimer: null,
  prohibitedPhrases: ['miracle cure'],
  patientPostsEnabled: false,
  minorPostsEnabled: false,
  automaticPublishingEnabled: true,
  dailyPostLimit: 3,
  weeklyPostLimit: 12,
  postingStartHour: 7,
  postingEndHour: 21,
  hasLogo: false,
  logoDriveFileId: null,
}

test('social publishing has no time or volume window', async () => {
  const store = createStore({
    async query(sql) {
      assert.doesNotMatch(sql, /posting_|current_hour|daily_post_limit|weekly_post_limit|daily_count|weekly_count|social_posts/u)
      return { rows: [{ automatic_publishing_enabled: true }] }
    },
  })
  assert.deepEqual(await store.canPublishSocialPost(new Date('2026-09-02T00:30:00+08:00')), { allowed: true })
})

test('social template storage stops at five photos', async () => {
  const store = createStore({
    async transaction(run) {
      return run({
        async query(sql) {
          if (sql.includes('count(*)')) return { rows: [{ count: 5 }] }
          return { rows: [{ id: 1 }] }
        },
      })
    },
  })
  assert.deepEqual(await store.addSocialTemplate({ driveFileId: 'sixth', mimeType: 'image/jpeg', now: new Date() }), { outcome: 'limit_reached' })
})

test('social event details type string parameters for PostgreSQL JSON', async () => {
  const queries = []
  const db = {
    async query(sql) { queries.push(sql) },
    async transaction(run) { return run({ query: async (sql) => { queries.push(sql) } }) },
  }
  const store = createStore(db)
  const now = new Date()
  await store.markSocialPostPublished({ id: 'post-1', externalPostId: 'page_post', externalPostUrl: 'https://facebook.com/page_post', now })
  await store.markSocialPostBlocked('post-2', 'Private data detected.', now)
  const eventQueries = queries.filter((sql) => sql.includes('jsonb_build_object'))
  assert.equal(eventQueries.length, 2)
  assert.ok(eventQueries.every((sql) => sql.includes('$2::text')))
})

test('social tokens are encrypted and patient posts fail closed without specific consent', () => {
  const key = Buffer.alloc(32, 4)
  const encrypted = encryptSocialToken('page-secret-token', key, () => Buffer.alloc(12, 7))
  assert.notEqual(encrypted, 'page-secret-token')
  assert.equal(decryptSocialToken(encrypted, key), 'page-secret-token')
  assert.throws(() => assertSocialPostPublishable(
    {
      contentType: 'patient_portrait', patientId: 'patient-1', patientName: 'Sample Patient',
      settings: { ...settings, patientPostsEnabled: true },
      connection: { status: 'connected', encryptedAccessToken: encrypted }, consent: null,
    },
    { patient_visible: true, unsupported_claims: [], safe_to_publish: true },
    'A friendly clinic visit.',
  ), SocialBlockedError)
})

test('speculative AI concerns do not block an otherwise safe photo', () => {
  assert.doesNotThrow(() => assertSocialPostPublishable(
    {
      contentType: 'facility_equipment', patientId: null, patientName: null,
      settings, connection: { status: 'connected', encryptedAccessToken: 'encrypted' }, consent: null,
    },
    {
      patient_visible: false, minor_possible: false, personal_data_visible: false,
      unsupported_claims: [], promotional_rate: false, safe_to_publish: false,
      reasons: ['A blurry background screen might contain information.'],
    },
    'A look at our clinic equipment.',
  ))
})

test('social photos are normalized below 2 MB and the worker publishes only once', async () => {
  const original = await sharp({
    create: { width: 2200, height: 1600, channels: 3, background: '#cfe9e4' },
  }).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer()
  const normalized = await normalizeSocialImage(original)
  const metadata = await sharp(normalized).metadata()
  assert.equal(metadata.format, 'jpeg')
  assert.ok(normalized.length <= 2 * 1024 * 1024)
  assert.equal(metadata.orientation, undefined)

  const key = Buffer.alloc(32, 9)
  const files = new Map([['original', normalized], ['template', normalized]])
  let claimed = false
  let metaCalls = 0
  let resolvePublished
  const published = new Promise((resolve) => { resolvePublished = resolve })
  const store = {
    async claimNextSocialPost() { if (claimed) return null; claimed = true; return 'post-1' },
    async getSocialPostForProcessing() {
      return {
        id: 'post-1', contentType: 'educational', description: 'Welcome our clinic team.',
        patientId: null, patientName: null,
        settings: { ...settings, templates: [{ id: 'template-1', driveFileId: 'template', mimeType: 'image/jpeg' }] },
        originalImage: { driveFileId: 'original', mimeType: 'image/jpeg' },
        connection: {
          pageId: '12345', pageName: 'SmileCare', status: 'connected',
          encryptedAccessToken: encryptSocialToken('page-token', key, () => Buffer.alloc(12, 2)),
        },
        consent: null,
      }
    },
    async saveSocialPostGenerated({ finalImage }) { assert.ok(files.has(finalImage.driveFileId)) },
    async canPublishSocialPost() { return { allowed: true } },
    async markSocialPostPublishing() {},
    async markSocialPostPublished(result) { resolvePublished(result) },
    async markSocialPostBlocked(id, reason) { assert.fail(`${id} blocked: ${reason}`) },
    async markSocialPostFailed(id, reason) { assert.fail(`${id} failed: ${reason}`) },
  }
  const storage = {
    async download(id) { return files.get(id) },
    async upload({ bytes }) { files.set('final', bytes); return 'final' },
  }
  const fetchFn = async (url, options) => {
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      const request = JSON.parse(options?.body || '{}')
      assert.deepEqual(request.provider.only, ['google-vertex'])
      assert.equal(request.provider.zdr, true)
      const prompt = request.messages?.[0]?.content?.[0]?.text || ''
      const result = prompt.startsWith('Review this proposed') ? { flagged: false, reason: '' } : {
        caption: 'Meet the SmileCare team. Book an appointment. #SmileCare',
        patient_visible: false, minor_possible: false, personal_data_visible: false,
        clinical_image: false, unsupported_claims: [], promotional_rate: false,
        safe_to_publish: true, reasons: [],
      }
      return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] })
    }
    if (url === 'https://openrouter.ai/api/v1/images') {
      const request = JSON.parse(options?.body || '{}')
      assert.deepEqual(request.provider.only, ['google-vertex/global'])
      assert.equal(request.provider.zdr, true)
      assert.equal(request.input_references.length, 2)
      return Response.json({ data: [{ b64_json: normalized.toString('base64') }] })
    }
    if (url.endsWith('/12345/photos')) { metaCalls += 1; return Response.json({ post_id: '12345_67890' }) }
    throw new Error(`Unexpected request: ${url}`)
  }
  const publisher = createSocialPublisher({
    config: {
      openRouterApiKey: 'test-openrouter-key', openRouterTextModel: 'test-text-model',
      openRouterImageModel: 'test-image-model', publicOrigin: 'https://example.com', socialTokenEncryptionKey: key,
      metaGraphVersion: 'v25.0',
    },
    store, storage, fetchFn, now: () => new Date('2026-08-28T03:00:00.000Z'),
  })
  publisher.wake()
  const result = await Promise.race([
    published,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Publishing timed out')), 2000)),
  ])
  assert.equal(result.externalPostId, '12345_67890')
  assert.equal(metaCalls, 1)
  assert.ok(files.get('final').length <= 2 * 1024 * 1024)
  publisher.wake()
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(metaCalls, 1)
})
