import { useState } from 'react'
import api from '../../api/axios'

// The receipt PDF needs the Bearer header, so it is fetched as a blob and opened from an object URL (no token in the URL)
export function useReceiptPdf() {
  const [loading, setLoading] = useState(false)
  const open = async (id) => {
    setLoading(true)
    const tab = window.open('', '_blank')
    try {
      const { data } = await api.get(`/fees/receipt/${id}`, { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      if (tab) tab.location.href = url; else window.location.assign(url)
    } catch {
      tab?.close()
    } finally { setLoading(false) }
  }
  return { open, loading }
}
