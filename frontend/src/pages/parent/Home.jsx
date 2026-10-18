import ConsentScreen from '../../features/consent/ConsentScreen'
import Dashboard from '../common/Dashboard'

// The parent's home: the privacy and consent screen first (privacy-and-consent.md section 3), then the dashboard (Step 4.7)
export default function ParentHome() {
  return <ConsentScreen><Dashboard /></ConsentScreen>
}
