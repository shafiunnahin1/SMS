import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useInstitutionStore } from '../../store/institutionStore'

// R2.1.1 / D111 (3): Google's own sign-in button, as on qbank's login page. Shown only when the server has a client ID; the server
// verifies the credential and signs in only an existing account with the same verified email (POST /auth/google).
const SRC = 'https://accounts.google.com/gsi/client'
let loading = null
const loadGsi = () => (loading ??= new Promise((resolve, reject) => {
  if (window.google?.accounts?.id) return resolve()
  const s = Object.assign(document.createElement('script'), { src: SRC, async: true, defer: true, onload: resolve, onerror: reject })
  document.head.appendChild(s)
}))

export default function GoogleButton({ onCredential }) {
  const { i18n } = useTranslation()
  const clientId = useInstitutionStore(s => s.googleClientId)
  const box = useRef(null)
  const cb = useRef(onCredential)
  useEffect(() => { cb.current = onCredential }, [onCredential])   // the latest handler without re-drawing Google's button
  useEffect(() => {
    if (!clientId) return undefined
    let alive = true
    loadGsi().then(() => {
      if (!alive || !box.current) return
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => r?.credential && cb.current(r.credential) })
      window.google.accounts.id.renderButton(box.current, { type: 'standard', theme: 'outline', size: 'large', width: box.current.offsetWidth || 320, locale: i18n.language })
    }).catch(() => { /* Google unreachable: the password form still works */ })
    return () => { alive = false }
  }, [clientId, i18n.language])
  if (!clientId) return null
  return <div ref={box} data-testid="google-signin" className="flex justify-center" />
}
