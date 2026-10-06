import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import i18n from '../../i18n'

export const STATUSES = ['present', 'absent', 'late', 'leave']

// docs/UI-PACKS.md "attendance.take": the logic, once for every pack. Views get { state, data, actions } and must render one
// element per action key (data-action) and one per student (data-row). Unmarked students are saved as present (the usual default).
export function useAttendanceSheet(batchId, date) {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['attendance', batchId, date], enabled: Boolean(batchId && date),
    queryFn: () => api.get('/attendance', { params: { batch_id: batchId, date } }).then(r => r.data.data) })
  const [marks, setMarks] = useState({})
  const [saving, setSaving] = useState(false)

  const initial = useMemo(() => Object.fromEntries((query.data?.rows ?? []).map(r => [r.student_id, r.status ?? 'present'])), [query.data])
  useEffect(() => { setMarks(initial) }, [initial])

  const dirty = Object.keys(marks).some(k => marks[k] !== initial[k]) || (query.data?.rows ?? []).some(r => r.status === null)
  const counts = STATUSES.reduce((c, s) => ({ ...c, [s]: Object.values(marks).filter(v => v === s).length }), {})

  const actions = {
    setStatus: (studentId, status) => setMarks(m => ({ ...m, [studentId]: status })),
    markAll: (status) => setMarks(m => Object.fromEntries(Object.keys(m).map(k => [k, status]))),
    save: async () => {
      setSaving(true)
      try {
        const records = Object.entries(marks).map(([student_id, status]) => ({ student_id: Number(student_id), status }))
        const { data } = await api.post('/attendance', { batch_id: Number(batchId), date, records })
        useUiStore.getState().addToast(i18n.t('attendance.saved', { count: data.data.saved }))
        qc.invalidateQueries({ queryKey: ['attendance', batchId, date] })
      } catch { /* interceptor toasts; marks stay for another try */ } finally { setSaving(false) }
    },
    reset: () => setMarks(initial),
  }

  return {
    query,
    state: { marks, saving, dirty, counts },
    data: { batch: query.data?.batch, date, holiday: query.data?.holiday, rows: query.data?.rows ?? [] },
    actions,
  }
}
