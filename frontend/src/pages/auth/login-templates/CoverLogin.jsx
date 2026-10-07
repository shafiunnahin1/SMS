import BrandLogo from '../../../layouts/parts/BrandLogo'
import LanguageSwitcher from '../../../layouts/parts/LanguageSwitcher'

// login_template = cover: a full-screen primary → secondary gradient with a floating form card (THEMING.md "Login Templates")
export default function CoverLogin({ institution, theme, title, children }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)]">
      <div className="w-full max-w-sm flex justify-end text-on-primary"><LanguageSwitcher /></div>
      <div className="w-full max-w-sm bg-surface text-content rounded-token shadow-card p-density flex flex-col gap-5">
        <BrandLogo institution={institution} theme={theme} />
        <h1 className="text-lg font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  )
}
