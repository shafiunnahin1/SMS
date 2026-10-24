import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import api from '../api/axios'
import { useLocale } from '../ui/I18nProvider'
import { fmtDate } from '../i18n/format'
import Loader from './Loader'
import { useInstitutionStore } from '../store/institutionStore'

// Layout Contract: the notification bell (GET /notifications, PATCH /notifications/read-all - Step 2.6). The unread count refreshes
// every minute; the list loads when it is opened. Not on the central host: /notifications is a tenant route, the Super Admin has none.
export default function NotificationBell() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const central = useInstitutionStore(s => s.isCentral)
  const q = useQuery({ queryKey: ['notifications'], enabled: !central, queryFn: () => api.get('/notifications', { params: { per_page: 8 } }).then(r => r.data), refetchInterval: 60000, staleTime: 30000 })
  const unread = q.data?.meta?.unread ?? 0
  const readAll = async () => { await api.patch('/notifications/read-all').catch(() => {}); qc.invalidateQueries({ queryKey: ['notifications'] }) }
  if (central) return null
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={t('notifications.title', { count: unread })}
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-token hover:bg-primary-soft" data-testid="bell">
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unread > 0 && <span className="absolute -top-0.5 -end-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[1.1rem] text-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div data-testid="bell-panel" className="fixed end-2 top-14 z-50 w-72 max-w-[calc(100vw-1rem)] sm:absolute sm:end-0 sm:top-11 bg-surface text-content rounded-token shadow-card [border:var(--card-border)] p-2">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-sm font-semibold">{t('notifications.heading')}</span>
            {unread > 0 && <button type="button" onClick={readAll} className="text-xs text-primary-fg">{t('notifications.read_all')}</button>}
          </div>
          {q.isPending ? <Loader type="skeleton" rows={3} /> : !(q.data?.data ?? []).length ? <p className="text-sm text-content-muted px-2 py-4 text-center">{t('notifications.empty')}</p> : (
            <ul className="flex flex-col divide-y divide-line max-h-80 overflow-y-auto">
              {q.data.data.map(n => (
                <li key={n.id} className={`px-2 py-2 text-sm ${n.read_at ? '' : 'bg-primary-soft'}`}>
                  <p className="font-medium" dir="auto">{n.data?.title}</p>
                  <p className="text-content-muted" dir="auto">{n.data?.body}</p>
                  <p className="text-xs text-content-muted">{n.created_at && fmtDate(n.created_at, locale)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
