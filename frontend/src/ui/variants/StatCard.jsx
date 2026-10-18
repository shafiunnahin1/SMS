import BarStatCard from '../../components/StatCard'
import { usePick } from './pick'

// docs/UI-PACKS.md section 4/6: the ONLY StatCard pages import. Props: label, value, delta?, icon?, tone?
// eslint-disable-next-line react-refresh/only-export-components
export const STAT_CARDS = { bar: BarStatCard }

export default function StatCard(props) {
  const V = usePick('stat_card', STAT_CARDS, 'bar')
  return <V {...props} />
}
