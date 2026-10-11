import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import Button from '../../components/Button'

// QB.7 (D66): buy an answer / concept / resource for the whole institution. The price is asked from the server (quote) and shown
// with the wallet balance in a confirmation; the purchase sends only the item - never an amount. 402 / 422 come back as messages.
export default function BuyButton({ type, id, label }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const toast = (m, kind) => useUiStore.getState().addToast(m, kind)
  const start = async () => {
    setBusy(true)
    try {
      const { data } = await api.get('/question-bank/quote', { params: { item_type: type, item_id: id } })
      const q = data.data
      if (q.price === null) { toast(t('qbb.not_for_sale'), 'error'); return }
      useUiStore.getState().openConfirm({
        title: t('qbb.confirm_title', { price: q.price }), description: t('qbb.confirm_hint', { balance: q.balance }), type: 'info', confirmLabel: t('qbb.buy'),
        onConfirm: async () => {
          try {
            const r = await api.post('/question-bank/buy', { item_type: type, item_id: id })
            toast(r.data.data.already_owned ? t('qbb.already') : t('qbb.bought', { price: r.data.data.charged }))
            qc.invalidateQueries({ queryKey: ['qb-library'] })
          } catch (e) {
            toast(e.response?.data?.message ?? t('qbb.failed'), 'error')
          }
        },
      })
    } catch (e) {
      toast(e.response?.data?.message ?? t('qbb.failed'), 'error')
    } finally { setBusy(false) }
  }
  return <Button onClick={start} loading={busy} data-action="buy">{label ?? t('qbb.buy')}</Button>
}
