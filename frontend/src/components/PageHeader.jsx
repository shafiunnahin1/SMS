// docs/design/component-library.md "PageHeader": title + actions at the top of every page (the layout never draws page titles)
export default function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h1 className="text-xl font-semibold text-content">{title}</h1>
        {subtitle && <p className="text-sm text-content-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
