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

/** `at` is the form's own marker centres ({left, right, top, bottom} of the page) - each page layout has its own (owner 2026-10-24) */
export function markerTargets(at) {
  if (!at || ![at.left, at.right, at.top, at.bottom].every(Number.isFinite)) return MARKER_TARGETS
  return { topLeft: [at.left, at.top], topRight: [at.right, at.top], bottomLeft: [at.left, at.bottom], bottomRight: [at.right, at.bottom] }
}

export function homographyFromMarkers(markers, imageWidth, imageHeight, targets = MARKER_TARGETS) {
  if (!markers?.valid || !imageWidth || !imageHeight) throw new Error('Four registration markers are required.')
  const matrix = []
  const values = []

  for (const [corner, [u, v]] of Object.entries(targets)) {
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

const percentile = (values, fraction) => {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right)
  return ordered.length ? ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] : 245
}

const samplePageLuminance = (imageData, homography, normalizedX, normalizedY) => {
  const [sourceX, sourceY] = projectPoint(homography, normalizedX, normalizedY)
  const pixelX = clamp(Math.round(sourceX), 0, imageData.width - 1)
  const pixelY = clamp(Math.round(sourceY), 0, imageData.height - 1)
  return luminance(imageData, pixelX, pixelY)
}

export function scoreBubble(imageData, homography, bubble) {
  const centerX = bubble.left + (bubble.width / 2)
  const centerY = bubble.top + (bubble.height / 2)
  const radiusX = Math.max(1e-5, bubble.width / 2)
  const radiusY = Math.max(1e-5, bubble.height / 2)
  const backgroundSamples = []
  const sectors = Array.from({ length: 12 }, () => [])

  for (let gridY = -9; gridY <= 9; gridY++) {
    for (let gridX = -9; gridX <= 9; gridX++) {
      const normalizedX = gridX * 0.15
      const normalizedY = gridY * 0.15
      const radius = Math.sqrt((normalizedX * normalizedX) + (normalizedY * normalizedY))
      if (radius < 0.42 || radius > 1.3) continue
      const value = samplePageLuminance(imageData, homography, centerX + (normalizedX * radiusX), centerY + (normalizedY * radiusY))
      if (radius >= 1.08) backgroundSamples.push(value)
      else if (radius <= 0.78) {
        const angle = (Math.atan2(normalizedY, normalizedX) + (Math.PI * 2)) % (Math.PI * 2)
        sectors[Math.floor((angle / (Math.PI * 2)) * sectors.length)].push(value)
      }
    }
  }

  const samples = sectors.flat()
  if (samples.length < 4) return 0
  const paperBrightness = percentile(backgroundSamples, 0.75)
  const paperFloor = clamp(paperBrightness - 35, 120, 225)
  const darkness = value => clamp((paperBrightness - value) / Math.max(25, paperBrightness - paperFloor), 0, 1)
  const sectorRatios = sectors.map(values => values.length
    ? values.filter(value => darkness(value) >= 0.28).length / values.length
    : 0)
  const darkValues = samples.map(darkness)
  const darkRatio = darkValues.filter(value => value >= 0.28).length / darkValues.length
  const meanDarkness = darkValues.reduce((sum, value) => sum + value, 0) / darkValues.length
  const coveredSectorRatio = sectorRatios.filter(ratio => ratio >= 0.20).length / sectors.length
  const coverageSupport = darkRatio >= 0.20 ? coveredSectorRatio * 0.10 : 0
  return clamp((darkRatio * 0.68) + (meanDarkness * 0.22) + coverageSupport, 0, 1)
}

export function readBubbleRows(imageData, homography, rows) {
  return rows.map(row => {
    const scores = row.map(cell => scoreBubble(imageData, homography, cell.bubble ?? cell))
    return { ...classifyBubbleScores(scores), scores }
  })
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