import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { useStaffDepartmentStore } from '../../store/staffDepartmentStore'
import { EmptyState } from '../../components/StateViews'
import Button from '../../components/Button'

const PICKER = '/staff/departments'

/** D169 STW.1: the selected department above every staff page, with a way to change it */
export function StaffDepartmentBar() {
  const { t } = useTranslation()
  const department = useStaffDepartmentStore(s => s.department)
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-token bg-surface-muted px-3 py-2 text-sm" data-testid="staff-department-bar">
      <span className="inline-flex items-center gap-2">
        <Building2 aria-hidden="true" className="h-4 w-4" />
        {department ? <>{t('staff_context.working_in')} <strong dir="auto">{department.name}</strong></> : t('staff_context.none')}
      </span>
      <Link to={PICKER} className="font-medium text-primary-fg hover:underline">{t(department ? 'staff_context.change' : 'staff_context.choose')}</Link>
    </div>
  )
}

/** D169 STW.1: a staff work page renders only with a selected department that holds `permission`; otherwise it says what is missing */
export function RequireDepartment({ permission, children }) {
  const { t } = useTranslation()
  const { department, permissions } = useStaffDepartmentStore()
  if (!department) {
    return <EmptyState title={t('staff_context.pick_first')} description={t('staff_context.pick_first_hint')}
      action={<Link to={PICKER}><Button variant="secondary">{t('staff_context.choose')}</Button></Link>} />
  }
  if (permission && !permissions.includes(permission)) {
    return <EmptyState title={t('staff_context.no_permission')} description={t('staff_context.no_permission_hint')} />
  }
  return children
}
