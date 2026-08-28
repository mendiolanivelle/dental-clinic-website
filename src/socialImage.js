import { MAX_PRESCRIPTION_IMAGE_BYTES, preparePrescriptionImage } from './prescriptionImage'

const heicTypes = new Set(['image/heic', 'image/heif'])

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(new Error('The selected image could not be read.'))
  reader.readAsDataURL(file)
})

export async function prepareSocialImage(file) {
  if (heicTypes.has(file?.type)) {
    if (file.size > MAX_PRESCRIPTION_IMAGE_BYTES) {
      throw new Error('This HEIC photo is over 2 MB. Choose a smaller photo or save it as JPEG first.')
    }
    return {
      imageBase64: await toBase64(file),
      imageMimeType: file.type,
      imageOriginalName: file.name || 'clinic-photo.heic',
    }
  }
  return preparePrescriptionImage(file)
}
