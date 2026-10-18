import { useState } from 'react'
import api from '../api/axios'

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
    } catch { /* the interceptor shows the toast */ } finally { setLoading(false) }
  }
  const preview = async (url, params) => {
    setLoading(true)
    const tab = window.open('', '_blank')
    try {
      const href = URL.createObjectURL(await fetchBlob(url, params))
      if (tab) tab.location.href = href; else window.location.assign(href)
    } catch { tab?.close() } finally { setLoading(false) }
  }
  return { download, preview, loading }
}
