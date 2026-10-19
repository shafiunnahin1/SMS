const MARKER_TARGETS = {
  topLeft: [0.119, 0.05],
  topRight: [0.881, 0.05],
  bottomLeft: [0.119, 0.882],
  bottomRight: [0.881, 0.882],
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

const luminance = (imageData, x, y) => {
  const index = (y * imageData.width + x) * 4
  return (imageData.data[index] * 0.2126) + (imageData.data[index + 1] * 0.7152) + (imageData.data[index + 2] * 0.0722)
}

const markerScore = (imageData, centerX, centerY, size) => {
  const left = clamp(Math.round(centerX - size / 2), 0, imageData.width - 1)
  const top = clamp(Math.round(centerY - size / 2), 0, imageData.height - 1)
  const right = clamp(Math.round(centerX + size / 2), 0, imageData.width - 1)
  const bottom = clamp(Math.round(centerY + size / 2), 0, imageData.height - 1)
  const outer = []
  const center = []

  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 7; column++) {
      const xRatio = (column + 0.5) / 7
      const yRatio = (row + 0.5) / 7
      const x = Math.round(left + ((right - left) * xRatio))
      const y = Math.round(top + ((bottom - top) * yRatio))
      ;(xRatio > 0.35 && xRatio < 0.65 && yRatio > 0.35 && yRatio < 0.65 ? center : outer).push(luminance(imageData, x, y))
    }
  }

  const average = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  const outerBrightness = average(outer)
  const centerBrightness = average(center)
  const outerDarkness = clamp((145 - outerBrightness) / 145, 0, 1)
  const centerContrast = clamp((centerBrightness - outerBrightness) / 150, 0, 1)
  return (outerDarkness * 0.6) + (centerContrast * 0.4)
}

export function findRegistrationMarkers(imageData) {
  if (!imageData?.width || !imageData?.height || !imageData.data) return { valid: false, points: {}, scores: {} }

  const shortSide = Math.min(imageData.width, imageData.height)
  const sizeRatios = [0.025, 0.035, 0.045, 0.055, 0.07, 0.09]
  const points = {}
  const scores = {}

  for (const [corner, [horizontal, vertical]] of Object.entries({
    topLeft: ['left', 'top'],
    topRight: ['right', 'top'],
    bottomLeft: ['left', 'bottom'],
    bottomRight: ['right', 'bottom'],
  })) {
    const xStart = horizontal === 'left' ? 0.04 : 0.68
    const yStart = vertical === 'top' ? 0.04 : 0.68
    let best = { score: 0, x: 0, y: 0 }

    for (let xIndex = 0; xIndex <= 28; xIndex++) {
      const xRatio = xStart + (xIndex * 0.01)
      for (let yIndex = 0; yIndex <= 28; yIndex++) {
        const yRatio = yStart + (yIndex * 0.01)
        for (const sizeRatio of sizeRatios) {
          const size = Math.max(7, Math.round(shortSide * sizeRatio))
          const score = markerScore(imageData, imageData.width * xRatio, imageData.height * yRatio, size)
          if (score > best.score) best = { score, x: xRatio, y: yRatio }
        }
      }
    }

    scores[corner] = best.score
    if (best.score >= 0.38) points[corner] = [best.x, best.y]
  }

  return { valid: Object.keys(points).length === 4, points, scores }
}

const solve = (matrix, values) => {
  const rows = matrix.map((row, index) => [...row, values[index]])
  const size = values.length

  for (let column = 0; column < size; column++) {
    let pivot = column
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row
    }
    if (Math.abs(rows[pivot][column]) < 1e-10) throw new Error('OMR marker geometry is degenerate.')
    ;[rows[column], rows[pivot]] = [rows[pivot], rows[column]]
    const divisor = rows[column][column]
    for (let cell = column; cell <= size; cell++) rows[column][cell] /= divisor
    for (let row = 0; row < size; row++) {
      if (row === column) continue
      const factor = rows[row][column]
      for (let cell = column; cell <= size; cell++) rows[row][cell] -= factor * rows[column][cell]
    }
  }

  return rows.map(row => row[size])
}

export function homographyFromMarkers(markers, imageWidth, imageHeight) {
  if (!markers?.valid || !imageWidth || !imageHeight) throw new Error('Four registration markers are required.')
  const matrix = []
  const values = []

  for (const [corner, [u, v]] of Object.entries(MARKER_TARGETS)) {
    const [xRatio, yRatio] = markers.points[corner]
    const x = xRatio * imageWidth
    const y = yRatio * imageHeight
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x])
    values.push(x)
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y])
    values.push(y)
  }

  return [...solve(matrix, values), 1]
}

export function projectPoint(homography, u, v) {
  const denominator = (homography[6] * u) + (homography[7] * v) + homography[8]
  if (Math.abs(denominator) < 1e-10) throw new Error('OMR point is outside the readable page.')
  return [((homography[0] * u) + (homography[1] * v) + homography[2]) / denominator,
    ((homography[3] * u) + (homography[4] * v) + homography[5]) / denominator]
}

export function classifyBubbleScores(scores) {
  const finite = scores.map(Number).map(score => Number.isFinite(score) ? score : 0)
  const ordered = [...finite].sort((left, right) => left - right)
  const baselineCount = Math.max(1, Math.ceil(ordered.length / 2))
  const baseline = ordered.length ? ordered.slice(0, baselineCount).reduce((sum, score) => sum + score, 0) / baselineCount : 0
  const threshold = Math.max(0.16, baseline + 0.10)
  const selected = finite.map((score, index) => ({ score, index }))
    .filter(({ score }) => score >= threshold && score >= baseline + 0.10)
    .map(({ index }) => index)

  return { status: selected.length === 0 ? 'blank' : selected.length === 1 ? 'marked' : 'ambiguous', selected, baseline, threshold }
}