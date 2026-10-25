import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { Select } from '../../components/FormField'
import { ErrorState } from '../../components/StateViews'

// D165 ST.1/ST.2 /student/my-class: a self-registered student's own class and SSC/HSC exam batch (learners host only)
export default function LearnerProfile() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['learner-profile'], queryFn: () => api.get('/learner/profile').then(r => r.data.data) })
  const classes = useQuery({ queryKey: ['learner-class-levels'], queryFn: () => api.get('/public/learners/class-levels').then(r => r.data.data) })
  const save = async (patch) => {
    const next = { qb_class_level_id: profile.data.qb_class_level_id, qb_exam_batch_id: profile.data.qb_exam_batch_id, ...patch }
    try {
      await api.put('/learner/profile', { qb_class_level_id: next.qb_class_level_id ? Number(next.qb_class_level_id) : null, qb_exam_batch_id: next.qb_exam_batch_id ? Number(next.qb_exam_batch_id) : null })
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['learner-profile'] })
    } catch (e) { useUiStore.getState().addToast(e.response?.data?.message ?? t('common.error'), 'error') }
  }
  const name = (c) => (i18n.language === 'en' ? c.name_en : c.name_bn)
  return (
    <div className="flex flex-col gap-4" data-testid="learner-profile">
      <PageHeader title={t('learner.my_class')} />
      <Card className="max-w-md">
        {profile.isPending || classes.isPending ? <Loader type="skeleton" rows={2} /> : profile.isError || classes.isError ? <ErrorState onRetry={() => { profile.refetch(); classes.refetch() }} /> : (
          <div className="flex flex-col gap-3">
            <Select label={t('learner.class')} placeholder={t('learner.class_pick')} name="qb_class_level_id" value={profile.data.qb_class_level_id ?? ''}
              onChange={e => save({ qb_class_level_id: e.target.value, qb_exam_batch_id: null })} options={classes.data.map(c => ({ value: c.id, label: name(c) }))} />
            {(profile.data.batches ?? []).length > 0 && (   // D165 ST.2: SSC / HSC - purchases last until this exam ends
              <Select label={t('learner.batch')} placeholder={t('learner.batch_none')} name="qb_exam_batch_id" value={profile.data.qb_exam_batch_id ?? ''}
                onChange={e => save({ qb_exam_batch_id: e.target.value || null })} options={profile.data.batches.map(b => ({ value: b.id, label: b.name }))} />)}
            <p className="text-xs text-content-muted">{t('learner.validity_hint')}</p>
          </div>
        )}
      </Card>
    </div>
  )
}
