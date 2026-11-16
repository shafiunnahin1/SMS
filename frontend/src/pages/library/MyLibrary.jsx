import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'

// D227 LIB.2 /student/library and /parent/library: the student's own borrowed books, due dates and fines, read-only
export default function MyLibrary() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const parent = useAuthStore((s) => s.user?.role) === 'parent'
  const children = useQuery({ queryKey: ['parent', 'children'], enabled: parent, queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const q = useQuery({ queryKey: ['library', 'family', parent ? child : 'me'], enabled: !parent || !!child,
    queryFn: () => api.get(parent ? `/parent/children/${child}/library` : '/student/library').then(r => r.data.data) })
  if (parent && children.isPending) return <Loader type="page" />
  if (parent && children.isError) return <ErrorState onRetry={children.refetch} />
  return (
    <div className="flex flex-col gap-4" data-testid="my-library">
      <PageHeader title={t('lib.title')} />
      {parent && (children.data ?? []).length > 1 && <Select name="child" label={t('hw.child')} value={String(child)} onChange={(e) => setChosen(Number(e.target.value))} className="sm:w-64"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
      {q.isPending ? <Loader type="skeleton" rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('lib.none_mine')} /> : (
        <Card><ul className="flex flex-col divide-y divide-line">
          {q.data.map(i => (
            <li key={i.id} className="py-2 flex flex-wrap items-center gap-2" data-testid="my-book" data-status={i.status}>
              <span className="font-medium" dir="auto">{i.book.title}</span>
              <span className="text-xs text-content-muted">{t('lib.due')} <Ltr>{i.due_date}</Ltr></span>
              <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`lib.statuses.${i.status}`)}</span>
              {Number(i.fine_amount) > 0 && <span className="ms-auto text-sm">{t('lib.fine')}: <Ltr>{fmtMoney(i.fine_amount, locale)}</Ltr> · {t(i.fine_paid ? 'lib.paid' : 'lib.unpaid')}</span>}
            </li>
          ))}
        </ul></Card>
      )}
    </div>
  )
}
