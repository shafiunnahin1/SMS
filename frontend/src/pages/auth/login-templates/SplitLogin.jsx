import BrandLogo from '../../../layouts/parts/BrandLogo'
import LanguageSwitcher from '../../../layouts/parts/LanguageSwitcher'

// login_template = split: a bg-primary panel with the logo and name at the inline-start, the form at the inline-end
export default function SplitLogin({ institution, theme, title, children }) {
  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-surface text-content">
      <div className="hidden md:flex flex-col justify-center gap-4 p-10 bg-primary text-on-primary">
        <BrandLogo institution={institution} theme={theme} />
      </div>
      <div className="flex flex-col justify-center gap-5 p-6 max-w-sm w-full mx-auto">
        <div className="flex justify-between items-center"><span className="md:hidden"><BrandLogo institution={institution} theme={theme} compact /></span><LanguageSwitcher className="ms-auto" /></div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  )
}
