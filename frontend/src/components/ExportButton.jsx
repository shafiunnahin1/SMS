import { FileSpreadsheet } from 'lucide-react'
import { usePrint } from '../hooks/usePrint'
import Button from './Button'

// docs/design/component-library.md "ExportButton": format excel | csv; the server builds the file
export default function ExportButton({ url, format = 'excel', params, label, filename }) {
  const { download, loading } = usePrint()
  const ext = format === 'csv' ? 'csv' : 'xlsx'
  return (
    <Button variant="secondary" loading={loading} onClick={() => download(url, filename ?? `export.${ext}`, { ...params, format })}>
      <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />{label}
    </Button>
  )
}
