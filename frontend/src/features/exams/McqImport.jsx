import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, ScanLine, FileJson } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Ltr from '../../components/bidi/Ltr'
import Tabs from '../../ui/variants/Tabs'
import { aiPrompt, parseJsonRows } from './mcqImport'

// D158 (5)(6): fill the MCQ part from JSON (with the AI prompt) or from the linked paper's graded OMR sheets: preview, then save
export default function McqImport({ examId, subjectId, exam, subject, rows, full, onSaved }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('json')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const prompt = useMemo(() => aiPrompt({ exam, subject, rows, full }), [exam, subject, rows, full])
  const toast = (m, k) => useUiStore.getState().addToast(m, k)

  const send = async (save) => {
    let body = { source: tab, save }
    if (tab === 'json') {
      try { body.rows = parseJsonRows(text) } catch { toast(t('mcq_import.bad_json'), 'error'); return }
    }
    setBusy(true)
    try {
      const { data } = await api.post(`/exams/${examId}/subjects/${subjectId}/mcq-import`, body)
      setPreview(data.data)
      if (save) { toast(t('mcq_import.saved', { n: data.data.saved })); onSaved() }
    } catch (e) { toast(e.response?.data?.message ?? t('common.error'), 'error') } finally { setBusy(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(prompt); toast(t('mcq_import.copied')) } catch { toast(t('common.error'), 'error') } }
  const okCount = preview?.rows.filter(r => r.status === 'ok').length ?? 0

  return (
    <Card className="flex flex-col gap-3" data-testid="mcq-import">
      <h2 className="font-semibold">{t('mcq_import.title')}</h2>
      <Tabs items={[{ key: 'json', label: t('mcq_import.json') }, { key: 'omr', label: t('mcq_import.omr') }]} value={tab} onChange={(k) => { setTab(k); setPreview(null) }} label={t('mcq_import.title')} />
      {tab === 'json' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm"><span className="flex items-center justify-between gap-2 font-semibold">{t('mcq_import.prompt')}
            <Button variant="secondary" onClick={copy} data-action="copy-prompt"><Copy aria-hidden="true" className="h-4 w-4" />{t('mcq_import.copy')}</Button></span>
            <textarea readOnly rows={9} dir="ltr" value={prompt} className="rounded-token border p-2 font-mono text-xs" data-testid="mcq-prompt" /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">{t('mcq_import.paste')}</span>
            <textarea rows={9} dir="ltr" value={text} onChange={e => { setText(e.target.value); setPreview(null) }} className="rounded-token border p-2 font-mono text-xs" name="mcq_json" placeholder='{"results":[{"roll":"1","mcq":18}]}' /></label>
        </div>
      ) : <p className="text-sm text-content-muted">{t('mcq_import.omr_hint')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => send(false)} loading={busy} disabled={tab === 'json' && !text.trim()} data-action="check">
          {tab === 'json' ? <FileJson aria-hidden="true" className="h-4 w-4" /> : <ScanLine aria-hidden="true" className="h-4 w-4" />}{t('mcq_import.check')}</Button>
        {preview && okCount > 0 && <Button onClick={() => send(true)} loading={busy} data-action="save-import">{t('mcq_import.save', { n: okCount })}</Button>}
      </div>
      {preview && (
        <div className="overflow-x-auto">
          {preview.sheets !== undefined && <p className="mb-2 text-sm">{t('mcq_import.sheets', { n: preview.sheets })}</p>}
          <table className="w-full text-sm" data-testid="mcq-preview">
            <thead><tr className="text-start text-content-muted"><th className="p-1 text-start">#</th><th className="p-1 text-start">{t('mcq_import.roll')}</th><th className="p-1 text-start">{t('students.name')}</th><th className="p-1 text-end">MCQ</th><th className="p-1 text-start">{t('mcq_import.status')}</th></tr></thead>
            <tbody>{preview.rows.map(r => (
              <tr key={r.line} className="border-t border-line" data-status={r.status}>
                <td className="p-1"><Ltr>{r.line}</Ltr></td><td className="p-1"><Ltr>{r.roll}</Ltr>{r.batch ? ` · ${r.batch}` : ''}</td>
                <td className="p-1"><bdi>{r.name ?? '—'}</bdi></td><td className="p-1 text-end"><Ltr>{String(r.mcq ?? '')}</Ltr></td>
                <td className={`p-1 ${r.status === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{t(`mcq_import.st.${r.status}`)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
