import { describe, expect, it } from 'vitest'
import api from '../api/axios'

// A file upload (FormData body) must not go under the instance's default JSON type - the server then sees no file (found in the
// browser check of the wallet receipt, D218); every other body keeps JSON
describe('upload requests go as multipart', () => {
  const run = (data) => api.interceptors.request.handlers.find(h => h).fulfilled({ headers: {}, data }).headers['Content-Type']
  it('marks a FormData body as multipart and leaves JSON alone', () => {
    const fd = new FormData(); fd.append('receipt', new Blob(['x'], { type: 'image/png' }), 'r.png')
    expect(run(fd)).toBe('multipart/form-data')
    expect(run({ amount: '5' })).toBeUndefined()
  })
})
