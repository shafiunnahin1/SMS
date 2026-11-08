import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import { useTerms } from '../../hooks/useTerms'
import { usePrint } from '../../hooks/usePrint'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import { useCrud } from '../../features/academic/useCrud'

// D193 ADM.1 /admin/students/id-cards: ID cards of a whole class/course or one batch, 6 per A4 page.
export default function IdCards() {
  const { t } = useTranslation()
  const term = useTerms()
  const programs = useCrud('programs').list
  const batches = useCrud('batches').list
  const { preview, loading } = usePrint()
  const [programId, setProgramId] = useState('')
  const [batchId, setBatchId] = useState('')
  return (
    <div>
      <PageHeader title={t('cards.id_title')} />
      {programs.isPending && <Loader />}
      {programs.isError && <ErrorState onRetry={() => programs.refetch()} />}
      {programs.data?.length === 0 && <EmptyState title={t('cards.no_programs', { unit: term('program') })} />}
      {programs.data?.length > 0 && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={term('program')} placeholder={t('cards.choose')} value={programId} onChange={e => { setProgramId(e.target.value); setBatchId('') }}
              options={programs.data.map(p => ({ value: String(p.id), label: p.name }))} />
            <Select label={term('batch')} placeholder={t('cards.all_batches')} value={batchId} disabled={!programId} onChange={e => setBatchId(e.target.value)}
              options={(batches.data ?? []).filter(b => String(b.program_id ?? b.program?.id) === programId).map(b => ({ value: String(b.id), label: b.name }))} />
          </div>
          <p className="mt-3 text-sm text-content-muted">{t('cards.id_hint')}</p>
          <div className="mt-3 flex justify-end">
            <Button disabled={!programId} loading={loading} onClick={() => preview('/students/id-cards/bulk', { program_id: programId, ...(batchId ? { batch_id: batchId } : {}) })}>
              <Printer aria-hidden="true" className="h-4 w-4" />{t('cards.print_id')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
