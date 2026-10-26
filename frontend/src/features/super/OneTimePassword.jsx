import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { Copy, KeyRound } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Ltr from '../../components/bidi/Ltr'

// D170: the first admin's one-time temporary password lives only in memory, for the institution it belongs to - never in browser
// storage, router state or the query cache; a reload or "done" loses it for good (the API never shows it again)
export const useOneTimePassword = create((set) => ({
  institutionId: null,
  password: null,
  keep: (institutionId, password) => set({ institutionId: String(institutionId), password }),
  forget: () => set({ institutionId: null, password: null }),
}))

/** strip the password from an API payload before it goes anywhere else, keeping it in the one-shot store */
export function takeCredentials(data) {
  const { credentials, ...rest } = data ?? {}
  if (credentials?.temporary_password) useOneTimePassword.getState().keep(rest.id, credentials.temporary_password)
  return rest
}

export function OneTimePasswordCard({ institutionId }) {
  const { t } = useTranslation()
  const { institutionId: owner, password, forget } = useOneTimePassword()
  const [copied, setCopied] = useState(false)
  if (!password || owner !== String(institutionId)) return null
  const copy = async () => { try { await navigator.clipboard.writeText(password); setCopied(true) } catch { setCopied(false) } }
  return (
    <Card className="flex flex-col gap-3" data-testid="one-time-password" role="alert">
      <h2 className="inline-flex items-center gap-2 font-semibold"><KeyRound aria-hidden="true" className="h-5 w-5" />{t('super.otp_title')}</h2>
      <p className="text-sm">{t('super.otp_hint')}</p>
      <Ltr className="select-all rounded-token bg-surface-muted px-3 py-2 font-mono text-lg">{password}</Ltr>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={copy}><Copy aria-hidden="true" className="h-4 w-4" />{t(copied ? 'super.otp_copied' : 'super.otp_copy')}</Button>
        <Button onClick={forget} data-action="otp-done">{t('super.otp_done')}</Button>
      </div>
    </Card>
  )
}
