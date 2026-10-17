import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Wallet } from 'lucide-react'
import { useInstitutionStore } from '../../store/institutionStore'
import { PRESETS } from '../../theme/devPresets'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import DataTable from '../../components/DataTable'
import StatCard from '../../ui/variants/StatCard'
import StatusBadge from '../../components/StatusBadge'
import FileUpload from '../../components/FileUpload'
import DateRangePicker from '../../components/DateRangePicker'
import PrintButton from '../../components/PrintButton'
import ExportButton from '../../components/ExportButton'
import Can from '../../components/Can'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import BarChart from '../../components/charts/BarChart'
import LineChart from '../../components/charts/LineChart'
import DonutChart from '../../components/charts/DonutChart'

// Step 3.4 Done When: /dev/components (dev builds only) renders every shared component; switching the theme below re-themes each one.
// The theme switch here only changes this browser's copy of the theme - nothing is saved.

export default function DevComponents() {
  const { t } = useTranslation()
  const theme = useInstitutionStore(s => s.theme)
  const [range, setRange] = useState({})
  const rows = [{ id: 1, name: 'রাহিম', status: 'active' }, { id: 2, name: 'করিম', status: 'inactive' }]
  const apply = (key) => useInstitutionStore.setState({ theme: { ...theme, ...PRESETS[key], tokens: { ...theme?.tokens, ...PRESETS[key].tokens } } })
  return (
    <div className="flex flex-col gap-4" data-testid="dev-components">
      <PageHeader title="/dev/components" actions={Object.keys(PRESETS).map(k => <Button key={k} variant="secondary" onClick={() => apply(k)}>{k}</Button>)} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="StatCard" value="1,240" delta={12} icon={Users} hint="vs last month" />
        <StatCard label="StatCard" value="৳ 85,000" delta={-4} icon={Wallet} />
        <Card className="flex flex-wrap gap-2 items-center">{['active', 'inactive', 'paid', 'due', 'pending', 'published'].map(s => <StatusBadge key={s} status={s} />)}</Card>
      </div>
      <Card className="flex flex-wrap gap-2">
        <Button>Button</Button><Button variant="secondary">secondary</Button><Button variant="ghost">ghost</Button><Button variant="danger">danger</Button><Button loading>loading</Button>
        <Button variant="danger" onClick={() => useUiStore.getState().openConfirm({ title: 'ConfirmModal', description: '…', type: 'danger', onConfirm: () => {} })}>ConfirmModal</Button>
        <Button variant="secondary" onClick={() => useUiStore.getState().addToast('Toast', 'success')}>Toast</Button>
        <PrintButton url="/health" filename="x.json" label="PrintButton" /><ExportButton url="/health" label="ExportButton" />
        <Can role="admin" fallback={<span className="text-sm">Can: not admin</span>}><span className="text-sm">Can: admin only</span></Can>
      </Card>
      <Card className="grid gap-3 sm:grid-cols-2">
        <Input label="Input" placeholder="…" /><Select label="Select" options={[{ value: 1, label: 'One' }]} />
        <DateRangePicker value={range} onChange={setRange} presets /><FileUpload accept=".jpg,.png" maxSize={2} preview />
      </Card>
      <Card><DataTable columns={[{ key: 'name', label: 'DataTable' }, { key: 'status', label: '', render: r => <StatusBadge status={r.status} /> }]} data={rows} /></Card>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><Loader type="skeleton" rows={3} /></Card><Card><EmptyState /></Card><Card><ErrorState onRetry={() => {}} /></Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><BarChart title="BarChart" data={[{ m: 'Jan', v: 40 }, { m: 'Feb', v: 55 }, { m: 'Mar', v: 48 }]} xKey="m" yKey="v" /></Card>
        <Card><LineChart title="LineChart" data={[{ d: '1', p: 90 }, { d: '2', p: 86 }, { d: '3', p: 93 }]} xKey="d" yKey="p" /></Card>
        <Card><DonutChart title="DonutChart" data={[{ name: t('attendance.status.present'), value: 85, tone: 'success' }, { name: t('attendance.status.absent'), value: 15, tone: 'danger' }]} /></Card>
      </div>
      <Loader type="page" count={3} rows={2} />
    </div>
  )
}
