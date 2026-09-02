import { preparePrescriptionImage } from './prescriptionImage'

const heicTypes = new Set(['image/heic', 'image/heif'])
const MAX_SOCIAL_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(new Error('The selected image could not be read.'))
  reader.readAsDataURL(file)
})

export async function prepareSocialImage(file) {
  const heicType = heicTypes.has(file?.type?.toLowerCase())
    ? file.type.toLowerCase()
    : /\.heif$/iu.test(file?.name || '') ? 'image/heif' : /\.heic$/iu.test(file?.name || '') ? 'image/heic' : null
  if (heicType) {
    if (file.size > MAX_SOCIAL_SOURCE_IMAGE_BYTES) {
      throw new Error('This phone photo is over 20 MB. Choose a smaller photo.')
    }
    try {
      return await preparePrescriptionImage(file)
    } catch {
      // Some non-Safari browsers cannot decode HEIC; let the server try instead.
    }
    return {
      imageBase64: await toBase64(file),
      imageMimeType: heicType,
      imageOriginalName: file.name || 'clinic-photo.heic',
    }
  }
  return preparePrescriptionImage(file)
}
