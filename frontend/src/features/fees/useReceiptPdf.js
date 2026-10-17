import { usePrint } from '../../hooks/usePrint'

// The receipt PDF needs the Bearer header, so it goes through usePrint (blob → object URL; no token in a URL)
export function useReceiptPdf() {
  const { preview, loading } = usePrint()
  return { open: (id) => preview(`/fees/receipt/${id}`), loading }
}
