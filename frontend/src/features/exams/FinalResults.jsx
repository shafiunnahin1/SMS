import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import Card from '../../components/Card'
import Ltr from '../../components/bidi/Ltr'

// D197 AAD.2: the published final result sheets of one student (student portal: /student/final-results; parent: per child).
// Shows nothing while loading, when there are none, or when the dues hold results back (the exam card already says why).
export default function FinalResults({ url }) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['final-results', url], queryFn: () => api.get(url).then(r => r.data.data) })
  if (!q.data || q.data.blocked || !q.data.results.length) return null
  return q.data.results.map(r => (
    <Card key={r.sheet.id} className="flex flex-col gap-2" data-testid="final-result">
      <h2 className="font-semibold">{t('result_sheets.final_results')}: <span dir="auto">{r.sheet.name}</span></h2>
      <ul className="flex flex-col divide-y divide-line">
        {(r.details ?? []).map(d => (
          <li key={d.subject_id} className="flex items-center justify-between h-row gap-2">
            <span dir="auto">{d.subject}</span>
            <span className="text-sm"><Ltr>{d.weighted}%</Ltr> <strong>{d.grade}</strong></span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <Ltr>{r.total_percentage ?? '—'}%</Ltr>
        {r.gpa != null && <> · GPA: <strong><Ltr>{Number(r.gpa).toFixed(2)}</Ltr></strong></>}
        {' · '}{t(r.is_pass ? 'result_sheets.passed' : 'result_sheets.failed')}
        {r.position_program != null && <> · {t('result_sheets.position')}: <Ltr>{r.position_program}</Ltr></>}
      </p>
    </Card>
  ))
}
