import ResourcePage from '../../features/r3/ResourcePage'

// R3.11 / D107 pages (docs/modules/donations.md §4). The restricted-fund guard and receipt numbers are the server's.
const METHODS = ['cash', 'bank', 'bkash', 'nagad', 'cheque']

export function Donors() {
  return <ResourcePage title="r3.don.donors" endpoint="donors"
    columns={[{ key: 'name', label: 'r3.name' }, { key: 'phone', label: 'r3.phone' }, { key: 'type', label: 'r3.type', kind: 'enum' }, { key: 'is_active', label: 'r3.active', kind: 'bool' }]}
    create={{ label: 'r3.don.new_donor', defaults: { type: 'individual' }, fields: [{ name: 'name', label: 'r3.name', required: true }, { name: 'phone', label: 'r3.phone' },
      { name: 'type', label: 'r3.type', kind: 'select', options: ['individual', 'organization'] }, { name: 'address', label: 'r3.address', wide: true }, { name: 'note', label: 'r3.note', wide: true }] }}
    edit={{ fields: [{ name: 'name', label: 'r3.name', required: true }, { name: 'phone', label: 'r3.phone' }, { name: 'address', label: 'r3.address', wide: true }, { name: 'is_active', label: 'r3.active', kind: 'checkbox' }] }}
    pdfs={[{ key: 'statement', label: 'r3.don.statement', path: r => `/donors/${r.id}/statement.pdf` }]} />
}

export function Funds() {
  return <ResourcePage title="r3.don.funds" endpoint="donation-funds" intro="r3.don.funds_hint"
    columns={[{ key: 'name', label: 'r3.name' }, { key: 'kind', label: 'r3.type', kind: 'enum' }, { key: 'restricted', label: 'r3.don.restricted', kind: 'bool' },
      { key: 'balance', label: 'r3.balance', kind: 'money' }, { key: 'description', label: 'r3.don.purpose' }]}
    create={{ label: 'r3.don.new_fund', defaults: { kind: 'general' }, fields: [{ name: 'name', label: 'r3.name', required: true },
      { name: 'kind', label: 'r3.type', kind: 'select', options: ['general', 'zakat', 'sadaqah', 'waqf', 'project', 'other'] },
      { name: 'restricted', label: 'r3.don.restricted', kind: 'checkbox' }, { name: 'description', label: 'r3.don.purpose', wide: true }] }}
    edit={{ fields: [{ name: 'name', label: 'r3.name', required: true }, { name: 'description', label: 'r3.don.purpose', wide: true }, { name: 'is_active', label: 'r3.active', kind: 'checkbox' }] }} />
}

export function Campaigns() {
  return <ResourcePage title="r3.don.campaigns" endpoint="donation-campaigns"
    columns={[{ key: 'title', label: 'r3.title' }, { key: 'goal_amount', label: 'r3.don.goal', kind: 'money' }, { key: 'starts_on', label: 'r3.from', kind: 'date' },
      { key: 'ends_on', label: 'r3.to', kind: 'date' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.don.new_campaign', defaults: { status: 'active' }, fields: [{ name: 'fund_id', label: 'r3.don.fund', kind: 'select', optionsFrom: 'donation-funds', required: true },
      { name: 'title', label: 'r3.title', required: true }, { name: 'goal_amount', label: 'r3.don.goal', kind: 'money' }, { name: 'starts_on', label: 'r3.from', kind: 'date' },
      { name: 'ends_on', label: 'r3.to', kind: 'date' }, { name: 'status', label: 'r3.status', kind: 'select', options: ['draft', 'active', 'closed'] }] }}
    edit={{ fields: [{ name: 'title', label: 'r3.title', required: true }, { name: 'goal_amount', label: 'r3.don.goal', kind: 'money' }, { name: 'status', label: 'r3.status', kind: 'select', options: ['draft', 'active', 'closed'] }] }} />
}

export function DonationList() {
  return <ResourcePage title="r3.don.donations" endpoint="donations"
    columns={[{ key: 'receipt_no', label: 'r3.receipt_no' }, { key: 'received_on', label: 'r3.date', kind: 'date' }, { key: 'amount', label: 'r3.amount', kind: 'money' },
      { key: 'method', label: 'r3.method', kind: 'enum' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.don.record', defaults: { method: 'cash' }, fields: [{ name: 'fund_id', label: 'r3.don.fund', kind: 'select', optionsFrom: 'donation-funds', required: true },
      { name: 'donor_id', label: 'r3.don.donor_optional', kind: 'select', optionsFrom: 'donors' }, { name: 'amount', label: 'r3.amount', kind: 'money', required: true },
      { name: 'method', label: 'r3.method', kind: 'select', options: METHODS }, { name: 'received_on', label: 'r3.date', kind: 'date' },
      { name: 'campaign_id', label: 'r3.don.campaign', kind: 'select', optionsFrom: 'donation-campaigns', optionLabel: 'title' }, { name: 'purpose_note', label: 'r3.note', wide: true }] }}
    actions={[{ key: 'reverse', label: 'r3.reverse', danger: true, when: r => r.status === 'received', path: r => `/donations/${r.id}/reverse`, fields: [{ name: 'reason', label: 'r3.reason', required: true, wide: true }] }]}
    pdfs={[{ key: 'receipt', label: 'r3.receipt', path: r => `/donations/${r.id}/receipt.pdf` }]} />
}
