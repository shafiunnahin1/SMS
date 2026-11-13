import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import Tabs from '../../ui/variants/Tabs'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import MonthCalendar from './MonthCalendar'
import EventsAdmin from './EventsAdmin'

// D213 CAL.1 /admin/academic/calendar: (1) the holidays of a year - add one day or a range, edit, delete; (2) academic years -
// create and set the current one; D213 CAL.2 adds (3) events and (4) the month view.
export default function CalendarAdmin() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('holidays')
  return (
    <div className="flex flex-col gap-4" data-testid="calendar-admin">
      <PageHeader title={t('cal.title')} />
      <Tabs items={[{ key: 'holidays', label: t('cal.holidays') }, { key: 'events', label: t('cal.events') }, { key: 'month', label: t('cal.month_view') }, { key: 'years', label: t('cal.years') }]} value={tab} onChange={setTab} label={t('cal.title')} />
      {tab === 'holidays' ? <Holidays /> : tab === 'events' ? <EventsAdmin /> : tab === 'month' ? <Card><MonthCalendar /></Card> : <Years />}
    </div>
  )
}

const blank = { title: '', date: '', end_date: '', type: 'public', description: '' }

function Holidays() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [f, setF] = useState(blank)
  const [editId, setEditId] = useState(null)
  const [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['holidays', year], queryFn: () => api.get('/holidays', { params: { year } }).then(r => r.data.data) })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const types = ['public', 'institution', 'optional'].map(v => ({ value: v, label: t(`cal.type.${v}`) }))
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    const body = { title: f.title, date: f.date, type: f.type, description: f.description || null }
    try {
      if (editId) await api.put(`/holidays/${editId}`, body)
      else await api.post('/holidays', { ...body, end_date: f.end_date || null })
      useUiStore.getState().addToast(t('cal.saved'))
      setF(blank); setEditId(null)
    } catch { /* the interceptor shows the error */ } finally { setBusy(false); qc.invalidateQueries({ queryKey: ['holidays'] }) }
  }
  const remove = (h) => useUiStore.getState().openConfirm({ title: t('cal.delete'), description: t('cal.delete_confirm', { title: h.title }),
    onConfirm: async () => { try { await api.delete(`/holidays/${h.id}`) } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['holidays'] }) } } })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <form className="flex flex-col gap-3" onSubmit={save} data-testid="holiday-form">
          <h2 className="font-semibold">{editId ? t('cal.edit_holiday') : t('cal.add_holiday')}</h2>
          <Input name="title" label={t('cal.holiday_title')} value={f.title} onChange={set('title')} required maxLength={150} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="date" type="date" label={editId ? t('cal.date') : t('cal.from')} value={f.date} onChange={set('date')} required />
            {!editId && <Input name="end_date" type="date" label={t('cal.to')} hint={t('cal.to_hint')} value={f.end_date} onChange={set('end_date')} />}
          </div>
          <Select name="type" label={t('cal.type_label')} options={types} value={f.type} onChange={set('type')} />
          <Input name="description" label={t('cal.note')} value={f.description} onChange={set('description')} maxLength={255} />
          {!editId && <p className="text-sm text-muted">{t('cal.notify_hint')}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} data-action="save">{t('cal.save')}</Button>
            {editId && <Button variant="ghost" onClick={() => { setEditId(null); setF(blank) }}>{t('cal.cancel')}</Button>}
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <h2 className="font-semibold">{t('cal.holiday_list')}</h2>
          <Input name="year" type="number" label={t('cal.year')} value={year} onChange={(e) => setYear(e.target.value)} className="w-28" ltr />
        </div>
        {q.isLoading ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('cal.no_holidays')} /> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="holiday-list">
            {q.data.map(h => (
              <li key={h.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{fmtDate(h.date, locale)} · {h.title} <span className="text-muted">({t(`cal.type.${h.type}`)})</span></span>
                <span className="inline-flex gap-2">
                  <Button variant="ghost" onClick={() => { setEditId(h.id); setF({ ...blank, title: h.title, date: h.date, type: h.type, description: h.description || '' }) }} data-action="edit">{t('cal.edit')}</Button>
                  <Button variant="ghost" onClick={() => remove(h)} data-action="delete">{t('cal.delete')}</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Years() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [f, setF] = useState({ name: '', start_date: '', end_date: '' })
  const [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['academic-years'], queryFn: () => api.get('/academic-years').then(r => r.data.data) })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post('/academic-years', f); setF({ name: '', start_date: '', end_date: '' }) } catch { /* the interceptor shows the error */ } finally { setBusy(false); qc.invalidateQueries({ queryKey: ['academic-years'] }) }
  }
  const makeCurrent = (y) => useUiStore.getState().openConfirm({ title: t('cal.set_current'), description: t('cal.set_current_confirm', { name: y.name }),
    onConfirm: async () => { try { await api.patch(`/academic-years/${y.id}/set-current`) } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['academic-years'] }) } } })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <form className="flex flex-col gap-3" onSubmit={save} data-testid="year-form">
          <h2 className="font-semibold">{t('cal.add_year')}</h2>
          <Input name="name" label={t('cal.year_name')} hint={t('cal.year_name_hint')} value={f.name} onChange={set('name')} required maxLength={20} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="start_date" type="date" label={t('cal.start')} value={f.start_date} onChange={set('start_date')} required />
            <Input name="end_date" type="date" label={t('cal.end')} value={f.end_date} onChange={set('end_date')} required />
          </div>
          <div><Button type="submit" disabled={busy} data-action="save-year">{t('cal.save')}</Button></div>
        </form>
      </Card>
      <Card>
        {q.isLoading ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('cal.no_years')} /> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="year-list">
            {q.data.map(y => (
              <li key={y.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{y.name} · {fmtDate(y.start_date, locale)} – {fmtDate(y.end_date, locale)}</span>
                {y.is_current ? <StatusBadge status="active" /> : <Button variant="ghost" onClick={() => makeCurrent(y)} data-action="current">{t('cal.set_current')}</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
