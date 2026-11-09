import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import api from '../../api/axios'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useUiStore } from '../../store/uiStore'
import Ltr from '../../components/bidi/Ltr'
import { DAYS } from '../../pages/routine/WeekView'
import { useTerms } from '../../hooks/useTerms'

const KINDS = ['break', 'assembly', 'prayer', 'other']
const blank = { kind: 'break', label: '', start_time: '', end_time: '', day_of_week: '', only_this: false }

// D197 AAD.5: the fixed blocks (break, assembly, prayer) - for every program or only this one, every day or one day. Saving lists
// the classes already inside the block (they are not moved); new classes cannot be routined into it.
export default function RoutineBlocks({ programId }) {
  const { t } = useTranslation()
  const term = useTerms()
  const qc = useQueryClient()
  const [f, setF] = useState(blank)
  const [inside, setInside] = useState([])
  const q = useQuery({ queryKey: ['routine-blocks', programId], queryFn: () => api.get('/routine-blocks', { params: programId ? { program_id: programId } : {} }).then(r => r.data.data) })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['routine-blocks'] }); qc.invalidateQueries({ queryKey: ['routines'] }) }
  const add = async () => {
    try {
      const { data } = await api.post('/routine-blocks', { kind: f.kind, label: f.label || null, start_time: f.start_time, end_time: f.end_time,
        day_of_week: f.day_of_week || null, program_id: f.only_this && programId ? Number(programId) : null })
      setInside(data.data.overlapping_routines ?? [])
      useUiStore.getState().addToast(t('common.saved'))
      setF(blank); refresh()
    } catch { /* the interceptor shows it */ }
  }
  const remove = async (id) => { try { await api.delete(`/routine-blocks/${id}`); refresh() } catch { /* shown */ } }
  return (
    <Card className="flex flex-col gap-3" data-testid="routine-blocks">
      <h2 className="font-semibold">{t('routine_blocks.title')}</h2>
      {q.isPending ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : (
        <ul className="flex flex-col divide-y divide-line">
          {q.data.map(b => (
            <li key={b.id} className="flex items-center justify-between h-row gap-2" data-testid="routine-block">
              <span><strong dir="auto">{b.label || t(`routine_blocks.kinds.${b.kind}`)}</strong> · <Ltr>{b.start_time}–{b.end_time}</Ltr> · {b.day_of_week ? t(`routine.days.${b.day_of_week}`) : t('routine_blocks.every_day')}{!b.program_id && <> · {t('routine_blocks.all_programs')}</>}</span>
              <Button variant="ghost" aria-label={t('common.delete')} onClick={() => remove(b.id)}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <Select label={t('routine_blocks.kind')} value={f.kind} onChange={e => setF(x => ({ ...x, kind: e.target.value }))} options={KINDS.map(k => ({ value: k, label: t(`routine_blocks.kinds.${k}`) }))} />
        <Input label={t('routine_blocks.label')} value={f.label} onChange={e => setF(x => ({ ...x, label: e.target.value }))} />
        <Select label={t('routine_blocks.day')} value={f.day_of_week} onChange={e => setF(x => ({ ...x, day_of_week: e.target.value }))}
          options={[{ value: '', label: t('routine_blocks.every_day') }, ...DAYS.map(d => ({ value: d, label: t(`routine.days.${d}`) }))]} />
        <Input type="time" ltr label={t('routine_blocks.start')} value={f.start_time} onChange={e => setF(x => ({ ...x, start_time: e.target.value }))} />
        <Input type="time" ltr label={t('routine_blocks.end')} value={f.end_time} onChange={e => setF(x => ({ ...x, end_time: e.target.value }))} />
        {programId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={f.only_this} onChange={e => setF(x => ({ ...x, only_this: e.target.checked }))} />{t('routine_blocks.only_this', { program: term('program') })}</label>}
      </div>
      <div className="flex justify-end"><Button onClick={add} disabled={!f.start_time || !f.end_time}>{t('routine_blocks.add')}</Button></div>
      {inside.length > 0 && <p className="text-sm" data-testid="block-inside">{t('routine_blocks.inside', { n: inside.length })} {inside.map(r => <span key={r.routine_id} dir="auto">{t(`routine.days.${r.day_of_week}`)} <Ltr>{r.start_time}</Ltr> {r.subject}; </span>)}</p>}
    </Card>
  )
}
