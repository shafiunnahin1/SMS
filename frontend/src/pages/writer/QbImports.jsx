import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select, Textarea } from '../../components/FormField'
import { fmtNumber as formatNumber } from '../../i18n/format'
import { multipart } from '../../features/students/formData'

// R2.1.3 /writer/imports (D123, D110): qbank's JSON import page, with TOON - one or several .json/.toon/.txt files or pasted
// text, then the staging review; below it the recent imports with their exact counts. The schema and examples download here.
export default function QbImports() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const n = (v) => formatNumber(v, i18n.language)
  const [files, setFiles] = useState([])
  const [text, setText] = useState('')
  const [format, setFormat] = useState('json')
  const list = useQuery({ queryKey: ['writer', 'imports'], queryFn: () => api.get('/writer/imports').then(r => r.data.data) })
  const send = useMutation({
    mutationFn: () => {
      if (files.length) {
        const fd = new FormData()
        files.forEach(f => fd.append('files[]', f))
        return api.post('/writer/imports', fd, multipart).then(r => r.data.data)
      }
      return api.post('/writer/imports', { text, format }).then(r => r.data.data)
    },
    onSuccess: (b) => nav(`/writer/imports/${b.id}`),
  })
  const download = async (path, name) => {
    const blob = (await api.get(path, { responseType: 'blob' })).data
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-imports">
      <PageHeader title={t('qbi.title')} subtitle={t('qbi.subtitle')} />
      <Card>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); send.mutate() }}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('qbi.files')}</span>
            <input type="file" name="files" multiple accept=".json,.toon,.txt,application/json,text/plain" onChange={e => setFiles([...e.target.files])} />
            <span className="text-xs text-content-muted">{t('qbi.files_hint')}</span>
          </label>
          {files.length === 0 && (
            <>
              <Textarea label={t('qbi.paste')} name="text" rows={6} dir="ltr" value={text} onChange={e => setText(e.target.value)} />
              <div className="max-w-xs">
                <Select label={t('qbi.format')} name="format" value={format} onChange={e => setFormat(e.target.value)}
                  options={[{ value: 'json', label: 'JSON' }, { value: 'toon', label: 'TOON' }]} />
              </div>
            </>
          )}
          {send.isError && <p className="text-sm text-red-600" role="alert">{send.error?.response?.data?.message ?? t('qbi.failed')}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={send.isPending} disabled={!files.length && !text.trim()} data-testid="qbi-upload">{t('qbi.check')}</Button>
            <Button variant="ghost" onClick={() => download('/writer/imports/schema.json', 'question-import-schema.json')}>{t('qbi.schema')}</Button>
            <Button variant="ghost" onClick={() => download('/writer/imports/example.json', 'question-import-example.json')}>{t('qbi.example_json')}</Button>
            <Button variant="ghost" onClick={() => download('/writer/imports/example.toon', 'question-import-example.toon')}>{t('qbi.example_toon')}</Button>
          </div>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">{t('qbi.recent')}</h2>
        {list.isPending ? <Loader type="list" /> : list.isError ? <ErrorState onRetry={list.refetch} /> : list.data.length === 0 ? <EmptyState title={t('qbi.none')} /> : (
          <ul className="flex flex-col gap-2">
            {list.data.map(b => (
              <li key={b.id}>
                <Link to={`/writer/imports/${b.id}`} data-batch={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-token [border:1px_solid_var(--line)] p-3 hover:bg-surface-muted">
                  <span className="font-medium" dir="auto">{b.files.map(f => f.name).join(', ')} <span className="text-xs uppercase text-content-muted">{b.format}</span></span>
                  <span className="text-sm">{t(`qbi.status.${b.status}`)} · {t('qbi.counts', { total: n(b.counts.total), valid: n(b.counts.valid), invalid: n(b.counts.invalid), imported: n(b.counts.imported) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
