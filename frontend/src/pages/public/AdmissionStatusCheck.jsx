import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Ltr from '../../components/bidi/Ltr'
import StatusBadge from '../../components/StatusBadge'
import { Input } from '../../components/FormField'
import { PHONE } from './PublicSite'
import { useInstitutionStore } from '../../store/institutionStore'

// D209 ACY.5: on the public admission page - the published cycles (each with its public record) and "check my result" by
// application number AND phone. Nothing shows when the institution does not use admission cycles.
export default function AdmissionStatusCheck() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const on = useInstitutionStore(s => s.modules.includes('admission_cycle'))   // no call (and no error toast) where cycles are not used
  const cycles = useQuery({ queryKey: ['public', 'admission-cycles'], queryFn: () => api.get('/public/admission/cycles').then(r => r.data.data), retry: false, enabled: on })
  const [f, setF] = useState({ application_no: '', phone: '' })
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!cycles.data?.length) return null

  const check = async (e) => {
    e.preventDefault()
    setErr(null); setRes(null)
    if (!f.application_no.trim() || !PHONE.test(f.phone.trim())) { setErr(t('admission.check_fill')); return }
    setBusy(true)
    try {
      setRes((await api.get('/public/admission/status', { params: { application_no: f.application_no.trim(), phone: f.phone.trim() } })).data.data)
    } catch (x) {
      setErr(x?.response?.status === 429 ? t('admission.check_wait') : t('admission.check_none'))
    } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-3" data-testid="admission-public">
      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('admission.public_cycles')}</h2>
        <ul className="flex flex-col divide-y divide-line">
          {cycles.data.map(c => (
            <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{c.name}{c.program ? ` · ${c.program}` : ''} · {fmtDate(c.apply_from, locale)} – {fmtDate(c.apply_until, locale)}</span>
              <span className="inline-flex items-center gap-2">
                <StatusBadge status={`cycle_${c.status}`} />
                <a className="underline" href={`/admission?transparency=${c.id}`}>{t('admission.public_record')}</a>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <form onSubmit={check} noValidate className="grid gap-3 sm:grid-cols-3 items-end" data-testid="status-check">
          <Input label={t('public_site.application_no')} ltr value={f.application_no} onChange={e => setF(v => ({ ...v, application_no: e.target.value }))} name="application_no" maxLength={20} />
          <Input label={t('public_site.f_phone')} ltr inputMode="tel" placeholder="01XXXXXXXXX" value={f.phone} onChange={e => setF(v => ({ ...v, phone: e.target.value }))} name="phone" />
          <Button type="submit" loading={busy} data-action="check">{t('admission.check')}</Button>
        </form>
        {err && <p className="mt-2 text-sm" role="alert">{err}</p>}
        {res && (
          <div className="mt-3 flex flex-col gap-1 text-sm" data-testid="status-result">
            <p><Ltr>{res.application_no}</Ltr> · {res.cycle.name} {res.list_status && <StatusBadge status={`list_${res.list_status}`} />}</p>
            {res.test_roll && <p>{t('admission.roll')}: <Ltr>{res.test_roll}</Ltr>{res.cycle.test_date ? ` · ${fmtDate(res.cycle.test_date, locale)}` : ''}</p>}
            <p className="font-medium">{t(`admission.next.${res.next_step}`, { date: res.confirm_by ? fmtDate(res.confirm_by, locale) : '' })}</p>
          </div>
        )}
      </Card>
    </div>
  )
}
