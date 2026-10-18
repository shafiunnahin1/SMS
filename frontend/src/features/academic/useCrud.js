import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'

// One list + save + delete for the Step 4.1 admin pages (programs, batches, subjects, teachers). The server is the only judge:
// field errors go back into the form, a refused delete (422 `in_use`) shows its own message.
export function useCrud(resource, { params, enabled = true } = {}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useUiStore.getState().addToast
  const list = useQuery({ queryKey: [resource, params ?? {}], queryFn: () => api.get(`/${resource}`, { params }).then(r => r.data.data), enabled })

  const save = async (values, id, setError) => {
    try {
      const { data } = id ? await api.put(`/${resource}/${id}`, values) : await api.post(`/${resource}`, values)
      toast(t('common.saved'))
      qc.invalidateQueries({ queryKey: [resource] })
      return data.data
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError?.(f, { message: m[0] }))
      return null
    }
  }

  const remove = (row, onDone) => useUiStore.getState().openConfirm({
    title: t('common.delete_confirm', { name: row.name }), description: t('common.delete_hint'), type: 'danger', confirmLabel: t('common.delete'),
    onConfirm: async () => {
      try {
        await api.delete(`/${resource}/${row.id}`)
        toast(t('common.deleted'))
        qc.invalidateQueries({ queryKey: [resource] })
        onDone?.()
      } catch (e) {
        if (e.response?.status === 422) toast(e.response.data.message, 'error')
      }
    },
  })

  return { list, save, remove }
}

/** Empty strings become "not sent" and checkboxes stay booleans - the form's values as the API expects them */
export const clean = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === '' ? null : v]))
