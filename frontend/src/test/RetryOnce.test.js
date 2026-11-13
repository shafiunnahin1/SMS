import { describe, it, expect } from 'vitest'
import { retryOnce, makeQueryClient } from '../lib/queryClient'

// D207 NET.1: refusals (4xx) are not repeated; network failures and server errors (5xx) are tried once more
describe('retry rule (D207 NET.1)', () => {
  it('never repeats a refusal', () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) expect(retryOnce(0, { response: { status } })).toBe(false)
  })
  it('tries a network failure or a server error once more, then stops', () => {
    expect(retryOnce(0, { message: 'Network Error' })).toBe(true)
    expect(retryOnce(0, { response: { status: 500 } })).toBe(true)
    expect(retryOnce(0, { response: { status: 503 } })).toBe(true)
    expect(retryOnce(1, { response: { status: 500 } })).toBe(false)
  })
  it('is the default for every query', () => {
    expect(makeQueryClient().getDefaultOptions().queries.retry).toBe(retryOnce)
  })
})
