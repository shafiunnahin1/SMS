import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { FileDown } from 'lucide-react'
import api from '../../api/axios'
import { usePrint } from '../../hooks/usePrint'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import Ltr from '../../components/bidi/Ltr'

// Step 4.5 /parent/results: the chosen child's PUBLISHED exams (GET /parent/children/{id}/results) and the marksheet PDF
export default function ParentResults() {
  const { t } = useTranslation()
  const { preview, loading } = usePrint()
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const results = useQuery({ queryKey: ['parent', 'results', child], enabled: Boolean(child),
    queryFn: () => api.get(`/parent/children/${child}/results`).then(r => r.data.data) })

  if (children.isPending) return <><PageHeader title={t('exams.results')} /><Loader type="page" count={2} rows={3} /></>
  if (children.isError) return <ErrorState onRetry={children.refetch} />
  if (!children.data.length) return <EmptyState />
  const num = (v) => (v == null ? '—' : Number(v))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('exams.results')} />
      {children.data.length > 1 && (
        <div role="tablist" aria-label={t('fees.pick_child')} className="flex flex-wrap gap-2">
          {children.data.map(c => (
            <button key={c.id} role="tab" aria-selected={c.id === child} type="button" onClick={() => setChosen(c.id)}
              className={`h-9 px-3 rounded-token text-sm ${c.id === child ? 'bg-primary text-on-primary' : 'bg-surface [border:1px_solid_var(--line)]'}`}>
              <span dir="auto">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      {results.isPending ? <Loader type="cards" count={2} /> : results.isError ? <ErrorState onRetry={results.refetch} />
        : !results.data.exams.length ? <EmptyState title={t('exams.none_published')} /> : results.data.exams.map(sheet => (
          <Card key={sheet.exam.id} className="flex flex-col gap-3" data-testid="parent-exam">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold"><span dir="auto">{sheet.exam.name}</span> <Ltr>({sheet.exam.academic_year})</Ltr></h2>
              <Button variant="secondary" loading={loading} onClick={() => preview(`/results/marksheet/${child}`, { exam_id: sheet.exam.id })}>
                <FileDown aria-hidden="true" className="h-4 w-4" />{t('exams.marksheet')}
              </Button>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {sheet.subjects.map(s => (
                <li key={s.subject_id} className="flex items-center justify-between h-row gap-2">
                  <span dir="auto">{s.subject}</span>
                  <span className="text-sm"><Ltr>{s.is_absent ? t('status.absent') : `${num(s.marks_obtained)}/${num(s.full_marks)}`}</Ltr>{s.grade && <strong className="ms-2">{s.grade}</strong>}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm">
              {t('exams.percentage')}: <strong><Ltr>{num(sheet.total.percentage)}%</Ltr></strong>
              {sheet.use_gpa && <> · GPA: <strong><Ltr>{sheet.total.gpa == null ? '—' : Number(sheet.total.gpa).toFixed(2)}</Ltr></strong></>}
              {sheet.total.is_pass != null && <> · {t(sheet.total.is_pass ? 'exams.passed' : 'exams.failed')}</>}
            </p>
          </Card>
        ))}
    </div>
  )
}
