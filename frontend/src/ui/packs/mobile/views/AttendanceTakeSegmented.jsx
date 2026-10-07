import { useTranslation } from 'react-i18next'
import Button from '../../../../components/Button'
import { EmptyState } from '../../../../components/StateViews'
import Ltr from '../../../../components/bidi/Ltr'
import { STATUSES } from '../../../../features/attendance/useAttendanceSheet'
import SaveStatus from '../../../../features/attendance/views/SaveStatus'

// mobile pack, attendance.take: one card per student with a thumb-sized segmented control (the order mirrors in RTL by itself:
// it is a flex row of logical items). Same hook, same actions as the grid - PackContractTest checks the data-action set.
const SHORT = { present: 'P', absent: 'A', late: 'L', leave: 'Lv' }

export default function AttendanceTakeSegmented({ state, data, actions }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3 pb-20">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm" dir="auto">{data.batch?.name} · <Ltr>{data.date}</Ltr></p>
        <Button variant="ghost" data-action="reset" onClick={actions.reset} disabled={!state.dirty}>{t('attendance.reset')}</Button>
      </div>
      <SaveStatus saved={data.saved} dirty={state.dirty} total={data.rows.length} />
      <Button variant="secondary" data-action="markAll" onClick={() => actions.markAll('present')} className="w-full">{t('attendance.all_present')}</Button>
      {!data.rows.length ? <EmptyState /> : (
        <ul className="flex flex-col gap-2">
          {data.rows.map(r => (
            <li key={r.student_id} data-row={r.student_id} className="bg-surface rounded-token shadow-card p-density [border:var(--card-border)] flex flex-col gap-2">
              <p className="flex justify-between gap-2"><span dir="auto" className="font-medium">{r.name}</span><span className="text-content-muted text-sm"><Ltr>{r.roll_no}</Ltr></span></p>
              <div role="radiogroup" aria-label={r.name} className="grid grid-cols-4 gap-1">
                {STATUSES.map((s, i) => {
                  const on = state.marks[r.student_id] === s
                  return (
                    <button key={s} type="button" role="radio" aria-checked={on} aria-label={t(`attendance.status.${s}`)}
                      data-action={i === 0 ? 'setStatus' : undefined} onClick={() => actions.setStatus(r.student_id, s)}
                      className={`h-11 rounded-token text-sm font-semibold ${on ? (s === 'absent' ? 'bg-red-600 text-white' : 'bg-primary text-on-primary') : 'bg-surface-muted text-content'}`}>
                      {SHORT[s]}
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="fixed bottom-16 inset-x-0 z-20 px-4">
        <div className="max-w-md mx-auto flex items-center gap-2 bg-surface rounded-token shadow-card p-2 [border:var(--card-border)]">
          <span className="flex-1 text-xs text-content-muted">{t('attendance.status.absent')}: {state.counts.absent}</span>
          <Button data-action="save" onClick={actions.save} loading={state.saving}>{data.saved?.count ? t('attendance.state.update') : t('common.save')}</Button>
        </div>
      </div>
    </div>
  )
}
