import { useTranslation } from 'react-i18next'
import Ltr from '../../components/bidi/Ltr'

const TONE = { live: 'bg-primary-soft text-primary-fg', cancelled: 'bg-surface-muted text-content-muted line-through', ended: 'bg-surface-muted text-content-muted', completed: 'bg-surface-muted text-content-muted' }

// D231 OCL.2: one online class as the student and the parent see it - Join while live or upcoming, the recording once completed
export default function ClassCard({ c }) {
  const { t } = useTranslation()
  const joinable = ['scheduled', 'live'].includes(c.status) && c.meeting_link
  return (
    <li className="py-3 flex flex-col gap-1" data-testid="online-class" data-status={c.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium" dir="auto">{c.title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[c.status] ?? 'bg-surface-muted'}`}>{t(`ocl.statuses.${c.status}`)}</span>
      </div>
      <p className="text-sm text-content-muted">
        {[c.subject?.name, c.teacher?.name].filter(Boolean).join(' · ')}{(c.subject || c.teacher?.name) ? ' · ' : ''}
        <Ltr>{c.scheduled_at}</Ltr> · {t('ocl.minutes', { n: c.duration_minutes })}
      </p>
      {joinable && (c.meeting_id || c.passcode) && <p className="text-sm">{c.meeting_id && <>{t('ocl.meeting_id')}: <Ltr>{c.meeting_id}</Ltr> </>}{c.passcode && <>{t('ocl.passcode')}: <Ltr>{c.passcode}</Ltr></>}</p>}
      <div className="flex flex-wrap gap-3">
        {joinable && <a className="inline-flex items-center rounded-token px-3 h-9 text-sm font-medium bg-primary text-on-primary" href={c.meeting_link} target="_blank" rel="noopener noreferrer" data-action="join">{t('ocl.join')}</a>}
        {c.recording_url && <a className="text-sm font-medium text-primary-fg underline" href={c.recording_url} target="_blank" rel="noopener noreferrer" data-action="recording">{t('ocl.recording')}</a>}
      </div>
    </li>
  )
}
