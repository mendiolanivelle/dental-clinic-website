import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import sharp from 'sharp'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const patientContent = new Set(['patient_portrait', 'before_after', 'intraoral_clinical'])
const clinicalContent = new Set(['before_after', 'intraoral_clinical'])
const promotionalPattern = /(?:₱|\bphp\b|\bpromo\b|\bdiscount\b|\bfree\b|\d+\s*%\s*off\b)/iu
const guaranteePattern = /\b(?:guaranteed?|perfect results?|permanent results?|best dentist|pain[- ]?free|100% effective)\b/iu

export class SocialBlockedError extends Error {}
export class SocialPermanentError extends Error {}

const xml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

const responseText = (payload) => payload?.output
  ?.flatMap((item) => item.content || [])
  .find((item) => item.type === 'output_text')?.text

const openAiError = async (label, response) => {
  const payload = await response.json().catch(() => null)
  const message = payload?.error?.message || `HTTP ${response.status}`
  const ErrorType = response.status === 429 || response.status >= 500 ? Error : SocialPermanentError
  return new ErrorType(`${label} failed: ${message}`)
}

const parseJsonOutput = (text) => {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')
  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error('OpenAI returned an invalid content validation result.')
  }
}

export const encryptSocialToken = (token, key, randomBytesFn = randomBytes) => {
  if (!key || key.length !== 32) throw new SocialPermanentError('Social token encryption is not configured.')
  const iv = randomBytesFn(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((value) => value.toString('base64url')).join('.')
}

export const decryptSocialToken = (value, key) => {
  if (!key || key.length !== 32) throw new SocialPermanentError('Social token encryption is not configured.')
  try {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  } catch {
    throw new SocialPermanentError('The saved Facebook connection could not be decrypted.')
  }
}

export async function normalizeSocialImage(bytes) {
  for (const quality of [84, 76, 68, 58]) {
    const output = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, progressive: true })
      .toBuffer()
    if (output.length <= MAX_IMAGE_BYTES) return output
  }
  throw new SocialBlockedError('The selected photo could not be compressed below 2 MB.')
}

export const assertSocialPostPublishable = (job, analysis, caption) => {
  const { settings, consent } = job
  if (!settings.automaticPublishingEnabled) throw new SocialBlockedError('Automatic publishing is disabled by the super admin.')
  if (!job.connection || job.connection.status !== 'connected' || !job.connection.encryptedAccessToken) {
    throw new SocialPermanentError('The clinic Facebook Page is not connected.')
  }
  if (patientContent.has(job.contentType)) {
    if (!settings.patientPostsEnabled) throw new SocialBlockedError('Patient-related Facebook posts are disabled.')
    if (!job.patientId || !consent?.coversPublicSocialMedia || !consent?.coversAiProcessing) {
      throw new SocialBlockedError('Specific patient consent for public Facebook posting and AI processing is required.')
    }
  }
  if (analysis.patient_visible && (!consent?.coversPublicSocialMedia || !consent?.coversAiProcessing)) {
    throw new SocialBlockedError('A possible patient is visible but valid social-media and AI consent was not recorded.')
  }
  if ((analysis.minor_possible || consent?.subjectIsMinor) && (!settings.minorPostsEnabled || !consent?.guardianName)) {
    throw new SocialBlockedError('A possible minor is visible and the approved guardian-consent workflow is not complete.')
  }
  if (analysis.personal_data_visible) throw new SocialBlockedError('Possible patient records or personal identifiers are visible in the photo.')
  if (analysis.unsupported_claims?.length) throw new SocialBlockedError('The generated post contains an unsupported treatment or business claim.')
  if (analysis.promotional_rate || promotionalPattern.test(caption)) throw new SocialBlockedError('Promotional prices, discounts, or rates are not allowed by the clinic publishing policy.')
  if (guaranteePattern.test(caption)) throw new SocialBlockedError('The generated caption contains a guarantee or misleading outcome claim.')
  const prohibited = settings.prohibitedPhrases.find((phrase) => phrase && caption.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()))
  if (prohibited) throw new SocialBlockedError(`The generated caption contains the prohibited phrase “${prohibited}”.`)
  if (job.patientName && caption.toLocaleLowerCase().includes(job.patientName.toLocaleLowerCase())) {
    throw new SocialBlockedError('The generated caption contains the patient’s name.')
  }
  if (analysis.safe_to_publish === false) throw new SocialBlockedError(analysis.reasons?.[0] || 'Automatic validation did not approve this post.')
}

async function analyzeAndWrite({ config, fetchFn, job, imageBytes }) {
  if (!config.openAiApiKey) throw new SocialPermanentError('OpenAI is not configured for automatic social publishing.')
  const imageUrl = `data:${job.originalImage.mimeType};base64,${imageBytes.toString('base64')}`
  const prompt = `You are the automatic publishing safety editor for a Philippine dental clinic.
Return only valid JSON with these exact keys:
{"caption":"string","patient_visible":false,"minor_possible":false,"personal_data_visible":false,"clinical_image":false,"unsupported_claims":[],"promotional_rate":false,"safe_to_publish":true,"reasons":[]}

Write a concise Facebook caption in ${job.settings.defaultLanguage}. Brand voice: ${job.settings.brandVoice}.
Clinic: ${job.settings.clinicName}. Dentist instruction: ${job.description}.
Allowed call to action: ${job.settings.defaultCallToAction || 'none'}.
Allowed contact: ${job.settings.contactPhone || 'none'}. Address: ${job.settings.address || 'none'}.
Allowed hashtags: ${job.settings.defaultHashtags.join(' ') || 'none'}.
Required disclaimer: ${job.settings.requiredDisclaimer || 'none'}.
Never use a patient name or identifier. Never invent treatment, diagnosis, price, duration, testimony, credentials, awards, guarantees, or results. Do not include promotional rates. Inspect the image for people, possible minors, patient records, identifiers, and clinical content. Treat uncertain privacy findings as true.`
  const response = await fetchFn('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openAiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openAiTextModel,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: prompt },
        { type: 'input_image', image_url: imageUrl },
      ] }],
    }),
  })
  if (!response.ok) throw await openAiError('OpenAI caption generation', response)
  const analysis = parseJsonOutput(responseText(await response.json()))
  if (typeof analysis.caption !== 'string' || !analysis.caption.trim()) {
    throw new Error('OpenAI returned no usable Facebook caption.')
  }
  analysis.caption = analysis.caption.trim()
  if (analysis.caption.length > 5000) throw new SocialBlockedError('The generated caption is too long for this workflow.')
  return analysis
}

async function moderate({ config, fetchFn, caption, mimeType, imageBytes }) {
  const response = await fetchFn('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openAiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: [
        { type: 'text', text: caption },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBytes.toString('base64')}` } },
      ],
    }),
  })
  if (!response.ok) throw await openAiError('OpenAI moderation', response)
  if ((await response.json()).results?.some(({ flagged }) => flagged)) {
    throw new SocialBlockedError('OpenAI safety moderation blocked this image or caption.')
  }
}

async function enhanceImage({ config, fetchFn, job, analysis, imageBytes }) {
  const mayUseGenerativeEdit = !analysis.patient_visible
    && !analysis.clinical_image
    && !clinicalContent.has(job.contentType)
    && job.contentType !== 'clinic_team'
  if (!mayUseGenerativeEdit) return imageBytes
  const form = new FormData()
  form.append('model', config.openAiImageModel)
  form.append('image[]', new Blob([imageBytes], { type: job.originalImage.mimeType }), 'clinic-photo.jpg')
  form.append('prompt', 'Improve lighting, white balance, framing, and background cleanliness for a professional dental clinic Facebook post. Preserve every real object and all people exactly. Do not add text, logos, teeth, people, treatment results, equipment, awards, or claims. Do not alter anatomy or create a different event.')
  form.append('size', '1024x1024')
  form.append('quality', 'medium')
  form.append('output_format', 'jpeg')
  form.append('output_compression', '82')
  const response = await fetchFn('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openAiApiKey}` },
    body: form,
  })
  if (!response.ok) throw await openAiError('OpenAI image enhancement', response)
  const encoded = (await response.json()).data?.[0]?.b64_json
  if (!encoded) throw new Error('OpenAI returned no enhanced image.')
  const edited = Buffer.from(encoded, 'base64')
  if (!edited.length || edited.length > 12 * 1024 * 1024) throw new Error('OpenAI returned an invalid enhanced image.')
  return edited
}

async function applyBranding({ storage, settings, imageBytes }) {
  const base = sharp(imageBytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(1080, 1080, { fit: 'cover', position: 'attention' })
  const textX = settings.hasLogo ? 190 : 48
  const details = [settings.contactPhone, settings.defaultCallToAction].filter(Boolean).join(' · ')
  const overlay = Buffer.from(`<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="850" width="1080" height="230" fill="${xml(settings.primaryColor)}" fill-opacity="0.94"/>
    <text x="${textX}" y="930" fill="#fff" font-family="${xml(settings.fontFamily)}, sans-serif" font-size="45" font-weight="700">${xml(settings.clinicName.slice(0, 42))}</text>
    <text x="${textX}" y="985" fill="#fff" fill-opacity="0.88" font-family="${xml(settings.fontFamily)}, sans-serif" font-size="27">${xml(details.slice(0, 70))}</text>
  </svg>`)
  const composites = [{ input: overlay, left: 0, top: 0 }]
  if (settings.logoDriveFileId) {
    const logo = await storage.download(settings.logoDriveFileId, MAX_IMAGE_BYTES)
    composites.push({
      input: await sharp(logo).rotate().resize(120, 120, { fit: 'contain' }).png().toBuffer(),
      left: 45,
      top: 900,
    })
  }
  const branded = await base.composite(composites).jpeg({ quality: 82, progressive: true }).toBuffer()
  if (branded.length > MAX_IMAGE_BYTES) {
    return sharp(branded).jpeg({ quality: 68, progressive: true }).toBuffer()
  }
  return branded
}

const graphError = async (label, response) => {
  const payload = await response.json().catch(() => null)
  const message = payload?.error?.message || `HTTP ${response.status}`
  const ErrorType = response.status === 429 || response.status >= 500 ? Error : SocialPermanentError
  return new ErrorType(`${label} failed: ${message}`)
}

export function createSocialPublisher({ config, store, storage, fetchFn = globalThis.fetch, now = () => new Date() }) {
  let timer
  let running = false

  const pageToken = (encrypted) => decryptSocialToken(encrypted, config.socialTokenEncryptionKey)
  const graphBase = `https://graph.facebook.com/${config.metaGraphVersion}`

  const verifyPage = async ({ pageId, accessToken }) => {
    if (!config.socialTokenEncryptionKey) throw new SocialPermanentError('Configure SOCIAL_TOKEN_ENCRYPTION_KEY before connecting Facebook.')
    const response = await fetchFn(`${graphBase}/${encodeURIComponent(pageId)}?fields=id,name`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) throw await graphError('Facebook Page verification', response)
    const page = await response.json()
    if (String(page.id) !== String(pageId) || !page.name) throw new SocialPermanentError('Facebook did not return the requested Page.')
    return { pageId: String(page.id), pageName: page.name, encryptedAccessToken: encryptSocialToken(accessToken, config.socialTokenEncryptionKey) }
  }

  const publish = async ({ job, imageBytes, caption }) => {
    const form = new FormData()
    form.append('source', new Blob([imageBytes], { type: 'image/jpeg' }), 'clinic-post.jpg')
    form.append('caption', caption)
    form.append('published', 'true')
    const response = await fetchFn(`${graphBase}/${encodeURIComponent(job.connection.pageId)}/photos`, {
      method: 'POST',
      headers: { authorization: `Bearer ${pageToken(job.connection.encryptedAccessToken)}` },
      body: form,
    })
    if (!response.ok) throw await graphError('Facebook publishing', response)
    const result = await response.json()
    const id = String(result.post_id || result.id || '')
    if (!id) throw new Error('Facebook returned no post ID.')
    return { id, url: `https://www.facebook.com/${encodeURIComponent(id)}` }
  }

  const processPost = async (id) => {
    const job = await store.getSocialPostForProcessing(id)
    if (!job) return
    let finalDriveFileId
    try {
      const original = await storage.download(job.originalImage.driveFileId, MAX_IMAGE_BYTES)
      const analysis = await analyzeAndWrite({ config, fetchFn, job, imageBytes: original })
      assertSocialPostPublishable(job, analysis, analysis.caption)
      await moderate({ config, fetchFn, caption: analysis.caption, mimeType: job.originalImage.mimeType, imageBytes: original })
      const enhanced = await enhanceImage({ config, fetchFn, job, analysis, imageBytes: original })
      const branded = await applyBranding({ storage, settings: job.settings, imageBytes: enhanced })
      if (!branded.length || branded.length > MAX_IMAGE_BYTES) throw new SocialBlockedError('The final branded image could not be compressed below 2 MB.')
      finalDriveFileId = await storage.upload({ bytes: branded, mimeType: 'image/jpeg', prefix: 'social-final' })
      await store.saveSocialPostGenerated({
        id, caption: analysis.caption,
        finalImage: { driveFileId: finalDriveFileId, mimeType: 'image/jpeg' },
        now: now(),
      })
      const limit = await store.canPublishSocialPost(now())
      if (!limit.allowed && limit.retryAt) {
        await store.deferSocialPost(id, limit.reason, limit.retryAt, now())
        return
      }
      if (!limit.allowed) throw new SocialBlockedError(limit.reason)
      await store.markSocialPostPublishing(id, now())
      const published = await publish({ job, imageBytes: branded, caption: analysis.caption })
      await store.markSocialPostPublished({ id, externalPostId: published.id, externalPostUrl: published.url, now: now() })
    } catch (error) {
      const reason = String(error?.message || 'The automatic publishing job failed.').slice(0, 1000)
      if (error instanceof SocialBlockedError) {
        await store.markSocialPostBlocked(id, reason, now())
      } else {
        const retryAt = error instanceof SocialPermanentError ? null : new Date(now().getTime() + 5 * 60_000)
        await store.markSocialPostFailed(id, reason, retryAt, now())
      }
    }
  }

  const run = async () => {
    if (running || !storage) return
    running = true
    try {
      for (let count = 0; count < 5; count += 1) {
        const id = await store.claimNextSocialPost(now())
        if (!id) break
        await processPost(id)
      }
    } finally {
      running = false
    }
  }

  return {
    configured: Boolean(storage && config.openAiApiKey && config.socialTokenEncryptionKey),
    verifyPage,
    wake: () => setImmediate(run),
    start() {
      if (timer || !storage) return
      timer = setInterval(run, 30_000)
      timer.unref?.()
      setImmediate(run)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
    async removePost(id) {
      const post = await store.getPublishedSocialPost(id)
      if (!post) return false
      const response = await fetchFn(`${graphBase}/${encodeURIComponent(post.externalPostId)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${pageToken(post.encryptedAccessToken)}` },
      })
      if (!response.ok) throw await graphError('Facebook post removal', response)
      return store.markSocialPostRemoved(id, now())
    },
  }
}
