import { describe, expect, it } from 'vitest'
import { classifyBubbleScores, findRegistrationMarkers, homographyFromMarkers, projectPoint, readBubbleRows } from '../features/qb/omrReader'

const sheetImage = (missingCorner = null) => {
  const width = 400
  const height = 560
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) data.set([255, 255, 255, 255], index)

  for (const [corner, xRatio, yRatio] of [
    ['topLeft', 0.119, 0.05], ['topRight', 0.881, 0.05],
    ['bottomLeft', 0.119, 0.882], ['bottomRight', 0.881, 0.882],
  ]) {
    if (corner === missingCorner) continue
    const centerX = Math.round(width * xRatio)
    const centerY = Math.round(height * yRatio)
    for (let y = centerY - 8; y <= centerY + 8; y++) {
      for (let x = centerX - 8; x <= centerX + 8; x++) {
        const inner = Math.abs(x - centerX) <= 3 && Math.abs(y - centerY) <= 3
        if (inner) continue
        const offset = ((y * width) + x) * 4
        data.set([0, 0, 0, 255], offset)
      }
    }
  }
  return { width, height, data }
}

const bubbleImage = () => {
  const width = 400
  const height = 560
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) data.set([255, 255, 255, 255], index)
  const centerX = 200
  const centerY = 280
  for (let y = centerY - 8; y <= centerY + 8; y++) {
    for (let x = centerX - 8; x <= centerX + 8; x++) {
      if ((((x - centerX) / 8) ** 2) + (((y - centerY) / 8) ** 2) > 0.95 ** 2) continue
      const offset = ((y * width) + x) * 4
      data.set([0, 0, 0, 255], offset)
    }
  }
  return { width, height, data }
}

describe('OMR reader geometry', () => {
  it('finds all four printed registration markers and maps normalized page points', () => {
    const image = sheetImage()
    const markers = findRegistrationMarkers(image)
    expect(markers.valid).toBe(true)
    const homography = homographyFromMarkers(markers, image.width, image.height)
    const [x, y] = projectPoint(homography, 0.119, 0.05)
    expect(x).toBeCloseTo(image.width * markers.points.topLeft[0], 4)
    expect(y).toBeCloseTo(image.height * markers.points.topLeft[1], 4)
  })

  it('refuses a sheet when any registration marker is missing', () => {
    expect(findRegistrationMarkers(sheetImage('bottomRight')).valid).toBe(false)
  })

  it('separates blank, single-marked, and ambiguous rows with qbank thresholds', () => {
    expect(classifyBubbleScores([0.01, 0.03, 0.04, 0.02]).status).toBe('blank')
    expect(classifyBubbleScores([0.01, 0.84, 0.03, 0.04])).toMatchObject({ status: 'marked', selected: [1] })
    expect(classifyBubbleScores([0.01, 0.73, 0.69, 0.04])).toMatchObject({ status: 'ambiguous', selected: [1, 2] })
  })

  it('scores filled answer bubbles from pixels against the local paper baseline', () => {
    const bubble = { left: 0.475, top: 0.48, width: 0.05, height: 0.04 }
    const blank = { left: 0.525, top: 0.48, width: 0.05, height: 0.04 }
    const result = readBubbleRows(bubbleImage(), [400, 0, 0, 0, 560, 0, 0, 0, 1], [[bubble, blank]])[0]
    expect(result.status).toBe('marked')
    expect(result.selected).toEqual([0])
    expect(result.scores[0]).toBeGreaterThan(0.16)
    expect(result.scores[1]).toBeLessThan(0.16)
  })
})