// Layout Contract: the institution's logo + name; without a logo, its initial on bg-primary
export default function BrandLogo({ institution, theme, compact = false }) {
  const name = institution?.name ?? ''
  return (
    <div className="flex items-center gap-2 min-w-0">
      {theme?.logo_url
        ? <img src={theme.logo_url} alt="" className="h-9 w-9 rounded-token object-contain" />
        : <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-token bg-primary text-on-primary inline-flex items-center justify-center font-semibold">{name.slice(0, 1)}</span>}
      {!compact && <span dir="auto" className="font-semibold truncate">{name}</span>}
    </div>
  )
}
