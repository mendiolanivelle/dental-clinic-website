const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SOCIAL_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(new Error('The selected image could not be read.'))
  reader.readAsDataURL(file)
})

export async function prepareSocialImage(file) {
  if (!file || !allowedTypes.has(file.type)) {
    throw new Error('Take or choose a clear JPEG, PNG, or WebP photo.')
  }
  if (file.size > MAX_SOCIAL_SOURCE_IMAGE_BYTES) {
    throw new Error('This photo is over 20 MB. Choose a smaller photo.')
  }
  return {
    imageBase64: await toBase64(file),
    imageMimeType: file.type,
    imageOriginalName: file.name || 'clinic-photo.jpg',
  }
}
