import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../api/axios'
import { useUiStore } from '../../../store/uiStore'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import Ltr from '../../../components/bidi/Ltr'
import { ErrorState } from '../../../components/StateViews'
import { Input } from '../../../components/FormField'

const CODES = [['ministry', 2], ['office', 2], ['geo', 4], ['sub_institution', 3], ['branch', 3]]

// D210 MEMO.1 /admin/settings/memo: the institution's own memo (smarak) codes - the 22-digit, 8-part form of the Secretariat
// Instructions 2024 (MM.DD.GGGG.SSS.BBB.TT.NNNN.YY + issue number). A code that does not apply stays zeros; the file serial, the year
// and the issue number are given by the system. The example shows how a number will look (printed in Bangla digits).
export default function MemoSettings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['memo', 'settings'], queryFn: () => api.get('/admin/settings/memo').then(r => r.data.data) })
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (q.data) setForm({ ...Object.fromEntries(CODES.map(([k]) => [k, q.data[k]])), subjects: { ...q.data.subjects } }) }, [q.data])
  if (q.isPending || !form) return q.isError ? <ErrorState onRetry={q.refetch} /> : <Loader type="page" />
  const save = async () => {
    setBusy(true); setErrors({})
    try {
      const r = await api.put('/admin/settings/memo', form)
      qc.setQueryData(['memo', 'settings'], r.data.data)
      useUiStore.getState().addToast(t('common.saved'))
    } catch (e) {
      const v = e.response?.data?.errors
      if (v) setErrors(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, [].concat(m)[0]])))
    } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4" data-testid="memo-settings">
      <PageHeader title={t('memo.settings_title')} />
      <Card className="flex flex-col gap-2 text-sm">
        <p>{t('memo.hint')}</p>
        <p>{t('memo.example')}: <span className="font-mono" data-testid="memo-example"><Ltr>{q.data.example_bn}</Ltr></span></p>
        <p className="text-content-muted">{q.data.date_line}</p>
      </Card>
      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CODES.map(([k, len]) => (
          <Input key={k} label={t(`memo.codes.${k}`, { n: len })} ltr inputMode="numeric" maxLength={len} name={k} value={form[k]} error={errors[k]}
            onChange={e => setForm(f => ({ ...f, [k]: e.target.value.replace(/\D/g, '') }))} />
        ))}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('memo.subjects_title')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.kinds.map(k => (
            <Input key={k} label={t(`memo.kinds.${k}`)} ltr inputMode="numeric" maxLength={2} name={`subject-${k}`} value={form.subjects[k]} error={errors[`subjects.${k}`]}
              onChange={e => setForm(f => ({ ...f, subjects: { ...f.subjects, [k]: e.target.value.replace(/\D/g, '') } }))} />
          ))}
        </div>
        <div><Button onClick={save} loading={busy} data-action="save">{t('common.save')}</Button></div>
      </Card>
    </div>
  )
}
