import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { Select } from '../../components/FormField'
import { ErrorState } from '../../components/StateViews'

// D165 (1) ST.1 /student/my-class: a self-registered student's own class (learners host only)
export default function LearnerProfile() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['learner-profile'], queryFn: () => api.get('/learner/profile').then(r => r.data.data) })
  const classes = useQuery({ queryKey: ['learner-class-levels'], queryFn: () => api.get('/public/learners/class-levels').then(r => r.data.data) })
  const save = async (value) => {
    try {
      await api.put('/learner/profile', { qb_class_level_id: value ? Number(value) : null })
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
          <Select label={t('learner.class')} placeholder={t('learner.class_pick')} name="qb_class_level_id" value={profile.data.qb_class_level_id ?? ''}
            onChange={e => save(e.target.value)} options={classes.data.map(c => ({ value: c.id, label: name(c) }))} />
        )}
      </Card>
    </div>
  )
}
