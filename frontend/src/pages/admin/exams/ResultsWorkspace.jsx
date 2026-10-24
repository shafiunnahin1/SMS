import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUp, FileText, Folder } from 'lucide-react'
import { useCrud } from '../../../features/academic/useCrud'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import StatusBadge from '../../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../../components/StateViews'
import Ltr from '../../../components/bidi/Ltr'
import DirIcon from '../../../components/DirIcon'

// R2.1.7 / D158 (2): the results workspace as files and folders - year, then class/batch, then each exam as a file. Opening an
// exam leads to its result entry, publishing, merit list and question-paper link. The place is kept in the address (?year=&group=).
const groupKey = (e) => `${e.program_id ?? e.program?.id ?? 0}-${e.batch_id ?? e.batch?.id ?? 0}`
const groupName = (e) => `${e.program?.name ?? ''}${e.batch ? ` — ${e.batch.name}` : ''}`

export default function ResultsWorkspace() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { list } = useCrud('exams')
  const year = params.get('year')
  const group = params.get('group')
  const exams = list.data ?? []
  const go = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v != null)))

  const view = useMemo(() => {
    if (!year) {
      const years = [...new Set(exams.map(e => String(e.academic_year)))].sort((a, b) => b.localeCompare(a))
      return { folders: years.map(y => ({ key: y, name: <Ltr>{y}</Ltr>, count: exams.filter(e => String(e.academic_year) === y).length, open: () => go({ year: y }) })), files: [] }
    }
    const inYear = exams.filter(e => String(e.academic_year) === year)
    if (!group) {
      const groups = new Map()
      inYear.forEach(e => { const k = groupKey(e); if (!groups.has(k)) groups.set(k, { key: k, name: <span dir="auto">{groupName(e)}</span>, count: 0, open: () => go({ year, group: k }) }); groups.get(k).count += 1 })
      return { folders: [...groups.values()], files: [] }
    }
    return { folders: [], files: inYear.filter(e => groupKey(e) === group) }
  }, [exams, year, group]) // eslint-disable-line react-hooks/exhaustive-deps

  const groupLabel = group ? groupName(exams.find(e => groupKey(e) === group) ?? {}) : ''
  const up = () => go(group ? { year } : {})

  return (
    <div className="flex flex-col gap-4" data-testid="results-workspace">
      <PageHeader title={t('results_ws.title')} />
      <Card className="flex flex-wrap items-center gap-2" aria-label={t('results_ws.breadcrumb')} data-testid="results-breadcrumb">
        <button type="button" className="rounded-token px-2 py-1 text-primary-fg hover:bg-primary-soft" onClick={() => go({})}>{t('results_ws.title')}</button>
        {year && <span className="inline-flex items-center gap-2"><DirIcon icon="next" className="h-4 w-4 text-content-muted" />
          <button type="button" className="rounded-token px-2 py-1 text-primary-fg hover:bg-primary-soft" onClick={() => go({ year })}><Ltr>{year}</Ltr></button></span>}
        {group && <span className="inline-flex items-center gap-2"><DirIcon icon="next" className="h-4 w-4 text-content-muted" />
          <span className="px-2 py-1" dir="auto">{groupLabel}</span></span>}
        {year && <Button variant="secondary" onClick={up} data-action="back"><ArrowUp aria-hidden="true" className="h-4 w-4" />{t('qbpf.back')}</Button>}
      </Card>

      {list.isError ? <ErrorState onRetry={list.refetch} /> : list.isPending ? <Card aria-busy="true"><div className="h-24 animate-pulse rounded-token bg-surface-muted" /></Card>
        : view.folders.length === 0 && view.files.length === 0 ? <Card><EmptyState title={t('results_ws.empty')} /></Card> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="results-grid">
          {view.folders.map(f => (
            <Card key={f.key} className="p-0" data-testid="results-folder">
              <button type="button" className="flex w-full flex-col items-center gap-2 p-5 text-center hover:bg-primary-soft" onClick={f.open} data-action="open-folder">
                <Folder aria-hidden="true" className="h-9 w-9 text-primary-fg" />
                <span className="break-words font-semibold">{f.name}</span>
                <span className="text-sm text-content-muted">{t('results_ws.exam_count', { n: f.count })}</span>
              </button>
            </Card>
          ))}
          {view.files.map(e => (
            <Card key={e.id} className="p-0" data-testid="results-file">
              <button type="button" className="flex w-full flex-col items-center gap-2 p-5 text-center hover:bg-primary-soft" onClick={() => navigate(`/admin/exams/${e.id}`)} data-action="open-exam">
                <FileText aria-hidden="true" className="h-9 w-9 text-primary-fg" />
                <span className="break-words font-semibold" dir="auto">{e.name}</span>
                <span className="text-sm text-content-muted">{t(`exams.types.${e.exam_type}`)}</span>
                <StatusBadge status={e.status} />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
