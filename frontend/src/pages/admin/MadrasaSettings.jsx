import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import { Input } from '../../components/FormField'

// D214 MAD.1 /admin/settings/madrasa: the hifz switch and its settings (pages a para, days before "behind", parents' view)
export default function MadrasaSettings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings', 'hifz'], queryFn: () => api.get('/admin/settings/hifz').then(r => r.data.data) })
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (q.data) setF({ enabled: q.data.enabled, pages_per_para: String(q.data.pages_per_para), stale_days: String(q.data.stale_days), show_parents: q.data.show_parents }) }, [q.data])
  if (q.isPending || (!f && !q.isError)) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.put('/admin/settings/hifz', { enabled: f.enabled, pages_per_para: Number(f.pages_per_para), stale_days: Number(f.stale_days), show_parents: f.show_parents })
      useUiStore.getState().addToast(t('hifz.settings_saved'))
    } catch { /* the interceptor shows the error */ } finally { setBusy(false); qc.invalidateQueries({ queryKey: ['settings', 'hifz'] }) }
  }
  return (
    <div className="flex flex-col gap-4" data-testid="madrasa-settings">
      <PageHeader title={t('hifz.settings_title')} />
      <Card>
        <form className="flex flex-col gap-3 sm:max-w-md" onSubmit={save} data-testid="hifz-settings">
          <h2 className="font-semibold">{t('hifz.title')}</h2>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />{t('hifz.enable')}</label>
          <Input name="pages_per_para" type="number" min="1" max="100" step="0.5" label={t('hifz.pages_per_para')} hint={t('hifz.pages_per_para_hint')} value={f.pages_per_para} onChange={(e) => setF({ ...f, pages_per_para: e.target.value })} required ltr />
          <Input name="stale_days" type="number" min="1" max="365" label={t('hifz.stale_days')} value={f.stale_days} onChange={(e) => setF({ ...f, stale_days: e.target.value })} required ltr />
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="show_parents" checked={f.show_parents} onChange={(e) => setF({ ...f, show_parents: e.target.checked })} />{t('hifz.show_parents')}</label>
          <p className="text-sm text-content-muted">{t('hifz.reload_hint')}</p>
          <div><Button type="submit" disabled={busy} data-action="save">{t('hifz.save')}</Button></div>
        </form>
      </Card>
    </div>
  )
}
