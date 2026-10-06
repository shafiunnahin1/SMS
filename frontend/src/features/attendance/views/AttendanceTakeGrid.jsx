import { useTranslation } from 'react-i18next'
import Button from '../../../components/Button'
import Card from '../../../components/Card'
import { EmptyState } from '../../../components/StateViews'
import Ltr from '../../../components/bidi/Ltr'
import { STATUSES } from '../useAttendanceSheet'

// Default view of attendance.take (classic pack): a row grid, one radio group per student
export default function AttendanceTakeGrid({ state, data, actions }) {
  const { t } = useTranslation()
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold" dir="auto">{data.batch?.program} · {data.batch?.name} · <Ltr>{data.date}</Ltr></p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" data-action="markAll" onClick={() => actions.markAll('present')}>{t('attendance.all_present')}</Button>
          <Button variant="ghost" data-action="reset" onClick={actions.reset} disabled={!state.dirty}>{t('attendance.reset')}</Button>
        </div>
      </div>
      {!data.rows.length ? <EmptyState /> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-content-muted"><th className="text-start py-2 w-16">{t('students.roll')}</th><th className="text-start">{t('students.name')}</th>
            {STATUSES.map(s => <th key={s} className="text-center w-20">{t(`attendance.status.${s}`)}</th>)}</tr></thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.student_id} data-row={r.student_id} className="border-b h-row">
                <td><Ltr>{r.roll_no}</Ltr></td><td><bdi>{r.name}</bdi></td>
                {STATUSES.map(s => (
                  <td key={s} className="text-center">
                    <input type="radio" name={`st-${r.student_id}`} data-action={s === 'present' ? 'setStatus' : undefined}
                      aria-label={`${r.name} ${t(`attendance.status.${s}`)}`} checked={state.marks[r.student_id] === s}
                      onChange={() => actions.setStatus(r.student_id, s)} className="h-4 w-4 accent-[var(--color-primary)]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-content-muted">{STATUSES.map(s => `${t(`attendance.status.${s}`)}: ${state.counts[s]}`).join(' · ')}</p>
        <Button data-action="save" onClick={actions.save} loading={state.saving}>{t('common.save')}</Button>
      </div>
    </Card>
  )
}
