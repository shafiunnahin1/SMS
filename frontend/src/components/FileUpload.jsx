import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'

// docs/design/component-library.md "FileUpload": accept, maxSize (MB), multiple, onUpload, preview; drag-and-drop. The size and type are
// checked here for a quick message only - the server validates again (it is the authority).
export default function FileUpload({ accept, maxSize = 2, multiple = false, onUpload, preview = false, label }) {
  const { t } = useTranslation()
  const id = useId()
  const [error, setError] = useState(null)
  const [urls, setUrls] = useState([])
  const [over, setOver] = useState(false)
  const take = (list) => {
    const files = [...list]
    const tooBig = files.find(f => f.size > maxSize * 1024 * 1024)
    const types = accept ? accept.split(',').map(s => s.trim().toLowerCase()) : null
    const wrong = types && files.find(f => !types.some(x => (x.startsWith('.') ? f.name.toLowerCase().endsWith(x) : f.type === x)))
    if (tooBig) return setError(t('upload.too_big', { max: maxSize }))
    if (wrong) return setError(t('upload.wrong_type', { types: accept }))
    setError(null)
    if (preview) setUrls(files.filter(f => f.type.startsWith('image/')).map(f => URL.createObjectURL(f)))
    onUpload?.(multiple ? files : files.slice(0, 1))
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
        className={`flex flex-col items-center justify-center gap-2 rounded-token p-density text-center cursor-pointer [border:2px_dashed_var(--line)] ${over ? 'bg-primary-soft' : 'bg-surface'}`}>
        <Upload aria-hidden="true" className="h-6 w-6 text-content-muted" />
        <span className="text-sm">{label ?? t('upload.choose')}</span>
        <span className="text-xs text-content-muted">{t('upload.limits', { types: accept ?? '*', max: maxSize })}</span>
      </label>
      <input id={id} type="file" accept={accept} multiple={multiple} className="sr-only" onChange={e => take(e.target.files)} />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {urls.length > 0 && <div className="flex flex-wrap gap-2">{urls.map(u => <img key={u} src={u} alt="" className="h-16 w-16 object-cover rounded-token" />)}</div>}
    </div>
  )
}
