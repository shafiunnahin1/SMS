import { useInstitutionStore } from '../../store/institutionStore'
import CenteredLogin from './login-templates/CenteredLogin'
import SplitLogin from './login-templates/SplitLogin'
import CoverLogin from './login-templates/CoverLogin'

// The institution's login template (tokens.login_template) around any auth page: login, forgot / reset / change password
const TEMPLATES = { centered: CenteredLogin, split: SplitLogin, cover: CoverLogin }
export default function AuthFrame({ title, children }) {
  const { institution, theme } = useInstitutionStore()
  const Template = TEMPLATES[theme?.tokens?.login_template] ?? CenteredLogin
  return <Template institution={institution} theme={theme} title={title}>{children}</Template>
}
