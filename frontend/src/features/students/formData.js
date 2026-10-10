// Multipart body for the student forms (the photo is a file). Booleans travel as 1/0, empty values are left out; a PUT goes as
// POST + _method because PHP reads multipart bodies only on POST.
export function toFormData(values, method = 'post') {
  const fd = new FormData()
  Object.entries(values).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : v)
  })
  if (method !== 'post') fd.append('_method', method.toUpperCase())
  return fd
}

export const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }
