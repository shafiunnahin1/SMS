import { Printer } from 'lucide-react'
import { usePrint } from '../hooks/usePrint'
import Button from './Button'

export default function PrintButton({ url, params, filename, label, variant = 'secondary' }) {
  const { download, loading } = usePrint()
  return <Button variant={variant} loading={loading} onClick={() => download(url, filename, params)}><Printer aria-hidden="true" className="h-4 w-4" />{label}</Button>
}
