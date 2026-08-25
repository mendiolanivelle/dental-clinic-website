export const MAX_PRESCRIPTION_IMAGE_BYTES = 2 * 1024 * 1024

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(new Error('The selected image could not be read.'))
  reader.readAsDataURL(blob)
})

const canvasBlob = (canvas, quality) => new Promise((resolve) => {
  canvas.toBlob(resolve, 'image/jpeg', quality)
})

export async function preparePrescriptionImage(file) {
  if (!file || !allowedTypes.has(file.type)) {
    throw new Error('Take or choose a clear JPEG, PNG, or WebP photo.')
  }
  if (file.size <= MAX_PRESCRIPTION_IMAGE_BYTES) {
    return {
      imageBase64: await toBase64(file),
      imageMimeType: file.type,
      imageOriginalName: file.name,
    }
  }

  const source = new Image()
  const url = URL.createObjectURL(file)
  try {
    source.src = url
    await source.decode()
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot compress the selected image.')

    let scale = Math.min(1, 2400 / Math.max(source.naturalWidth, source.naturalHeight))
    for (let resize = 0; resize < 8; resize += 1) {
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale))
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46]) {
        const blob = await canvasBlob(canvas, quality)
        if (blob?.size && blob.size <= MAX_PRESCRIPTION_IMAGE_BYTES) {
          return {
            imageBase64: await toBase64(blob),
            imageMimeType: 'image/jpeg',
            imageOriginalName: `${file.name.replace(/\.[^.]+$/u, '') || 'prescription'}.jpg`,
          }
        }
      }
      scale *= 0.8
    }
  } finally {
    URL.revokeObjectURL(url)
  }
  throw new Error('The prescription photo could not be compressed below 2 MB. Try a clearer, smaller photo.')
}
