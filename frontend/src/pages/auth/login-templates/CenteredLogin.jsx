import BrandLogo from '../../../layouts/parts/BrandLogo'
import LanguageSwitcher from '../../../layouts/parts/LanguageSwitcher'

// login_template = centered: a card in the middle on bg-surface-muted
export default function CenteredLogin({ institution, theme, title, children }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-surface-muted text-content">
      <div className="w-full max-w-sm flex justify-end"><LanguageSwitcher /></div>
      <div className="w-full max-w-sm bg-surface rounded-token shadow-card p-density [border:var(--card-border)] flex flex-col gap-5">
        <BrandLogo institution={institution} theme={theme} />
        <h1 className="text-lg font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  )
}
