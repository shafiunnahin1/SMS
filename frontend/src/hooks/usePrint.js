import { useState } from 'react'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'

// A refused PDF (422 / 404) arrives as a JSON blob: show its message (the interceptor shows only 401/403/429/5xx)
const showRefusal = async (e) => {
  const data = e?.response?.data
  if (!(data instanceof Blob) || ![404, 422].includes(e.response.status)) return
  try { const msg = JSON.parse(await data.text())?.message; if (msg) useUiStore.getState().addToast(msg, 'error') } catch { /* not JSON */ }
}

// docs/design/component-library.md "usePrint": axios blob → URL.createObjectURL → download (or open in a new tab to print)
export function usePrint() {
  const [loading, setLoading] = useState(false)
  const fetchBlob = async (url, params) => (await api.get(url, { params, responseType: 'blob' })).data
  const download = async (url, filename, params) => {
    setLoading(true)
    try {
      const href = URL.createObjectURL(await fetchBlob(url, params))
      const a = Object.assign(document.createElement('a'), { href, download: filename })
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(href), 10000)
    } catch (e) { await showRefusal(e) } finally { setLoading(false) }
  }
  const preview = async (url, params) => {
    setLoading(true)
    const tab = window.open('', '_blank')
    try {
      const href = URL.createObjectURL(await fetchBlob(url, params))
      if (tab) tab.location.href = href; else window.location.assign(href)
    } catch (e) { tab?.close(); await showRefusal(e) } finally { setLoading(false) }
  }
  return { download, preview, loading }
}
