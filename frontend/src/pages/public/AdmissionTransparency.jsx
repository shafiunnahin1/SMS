import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import StatusBadge from '../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../components/StateViews'

// the 5-line check anyone can run (docs/modules/admission-cycle.md section 3): the commitment, the applicants' hash and the order
const SCRIPT = `import hashlib, hmac, json, sys
d = json.load(open(sys.argv[1]))["data"]; seed = bytes.fromhex(d["draw"]["seed"]); nos = d["applicants"]
assert hashlib.sha256(seed).hexdigest() == d["draw"]["seed_commitment"]
assert hashlib.sha256("\\n".join(sorted(nos)).encode()).hexdigest() == d["draw"]["applicants_hash"]
print(sorted(nos, key=lambda n: (hmac.new(seed, n.encode(), hashlib.sha256).hexdigest(), n)) == d["draw"]["order"])`

// D209 ACY.3: the public record of one admission cycle - before the draw the commitment and (after the freeze) the applicants'
// numbers and hash; after it the seed, the order and the list. Numbers only unless the institution publishes names.
export default function AdmissionTransparency({ id }) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['public', 'transparency', id], queryFn: () => api.get(`/public/admission/cycle/${id}/transparency`).then(r => r.data.data) })
  if (q.isPending) return <Loader type="cards" count={2} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const { cycle, draw, applicants, list } = q.data
  return (
    <div className="flex flex-col gap-3" data-testid="transparency">
      <h1 className="text-2xl font-semibold">{cycle.name}</h1>
      {draw && (
        <Card className="flex flex-col gap-1 text-sm">
          {draw.guarantee === 'weaker' && <p className="font-medium" data-testid="weaker">{t('admission.weaker_note')}</p>}
          <p>{t('admission.commitment')}: <span className="font-mono break-all"><Ltr>{draw.seed_commitment}</Ltr></span></p>
          {draw.applicants_hash && <p>{t('admission.applicants_hash', { count: draw.applicants_count })}: <span className="font-mono break-all"><Ltr>{draw.applicants_hash}</Ltr></span></p>}
          {draw.seed ? <p>{t('admission.seed')}: <span className="font-mono break-all" data-testid="public-seed"><Ltr>{draw.seed}</Ltr></span></p> : <p className="text-content-muted">{t('admission.seed_not_yet')}</p>}
        </Card>
      )}
      {list.length > 0 ? (
        <Card>
          <ul className="flex flex-col divide-y divide-line" data-testid="public-list">
            {list.map(r => (
              <li key={r.application_no} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{r.rank}. <Ltr>{r.application_no}</Ltr>{r.name ? ` · ${r.name}` : ''}{r.marks ? ` · ${r.marks}` : ''}</span>
                <StatusBadge status={`list_${r.list_status}`} />
              </li>
            ))}
          </ul>
        </Card>
      ) : !draw && <EmptyState title={t('admission.no_list_yet')} />}
      {draw && applicants.length > 0 && (
        <Card className="flex flex-col gap-2 text-sm">
          <h2 className="font-semibold">{t('admission.verify_title')}</h2>
          <p className="font-mono break-all"><Ltr>{applicants.join(', ')}</Ltr></p>
          {draw.seed && <><p>{t('admission.verify_hint')}</p><pre className="font-mono text-xs overflow-x-auto" dir="ltr">{SCRIPT}</pre></>}
        </Card>
      )}
    </div>
  )
}
