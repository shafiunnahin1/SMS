import { transformImagePixels } from './formatting'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const IMAGE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'png' }

export async function transformImageFile(file, { rotation = 0, transparentBackground = false, threshold = 245 } = {}) {
  if (rotation === 0 && !transparentBackground) return file
  if (!IMAGE_EXTENSIONS[file.type]) throw new Error('qbed.picture_transform_failed')

  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = sourceUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context || !canvas.width || !canvas.height) throw new Error('qbed.picture_transform_failed')
    context.drawImage(image, 0, 0)
    const pixels = transformImagePixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height,
      { rotation, transparentBackground, threshold })

    canvas.width = pixels.width
    canvas.height = pixels.height
    const outputContext = canvas.getContext('2d')
    if (!outputContext) throw new Error('qbed.picture_transform_failed')
    const output = outputContext.createImageData(pixels.width, pixels.height)
    output.data.set(pixels.data)
    outputContext.putImageData(output, 0, 0)

    const outputType = transparentBackground || file.type === 'image/gif' ? 'image/png' : file.type
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('qbed.picture_transform_failed')), outputType, 0.92)
    })
    if (blob.size > MAX_IMAGE_BYTES) throw new Error('qbed.picture_transform_too_large')
    const extension = IMAGE_EXTENSIONS[blob.type] ?? 'png'
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'picture'
    return new File([blob], `${baseName}.${extension}`, { type: blob.type, lastModified: file.lastModified })
  } catch (error) {
    if (error.message?.startsWith('qbed.')) throw error
    throw new Error('qbed.picture_transform_failed')
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}