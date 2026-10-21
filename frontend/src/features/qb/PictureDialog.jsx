import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import Check from '../academic/Check'
import Modal from '../../ui/variants/Modal'

const DEFAULTS = { width: 100, align: 'center', position: 'cursor', paragraph: 1, rotation: 0, transparentBackground: false }

export default function PictureDialog({ open, initial, onClose, onSave, saving = false }) {
  const { t } = useTranslation()
  const [file, setFile] = useState(null)
  const [settings, setSettings] = useState(DEFAULTS)
  const [fileUrl, setFileUrl] = useState('')

  useEffect(() => {
    if (!open) return
    setFile(initial?.file ?? null)
    setSettings({ ...DEFAULTS, ...(initial?.settings ?? {}) })
  }, [open, initial])

  useEffect(() => {
    if (!file) { setFileUrl(''); return undefined }
    const url = URL.createObjectURL(file)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const previewUrl = fileUrl || initial?.sourceUrl
  const set = (key, value) => setSettings(current => ({ ...current, [key]: value }))
  const edit = initial?.mode === 'edit'
  const hasTarget = edit || initial?.mode === 'attach'

  return (
    <Modal open={open} onClose={onClose} title={t('qbed.image')} actions={(
      <>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={() => onSave({ file, settings })} disabled={saving || (!hasTarget && !file)} loading={saving} data-action="picture-save">
          {edit ? t('common.save') : t('qb.insert')}
        </Button>
      </>
    )}>
      <div className="grid gap-4 sm:grid-cols-2" data-testid="qb-picture-dialog">
        <section className="flex min-w-0 flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            <span>{edit ? t('qbed.picture_replace') : t('qbed.picture_choose')}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" name="picture_file" onChange={event => setFile(event.target.files?.[0] ?? null)} className="w-full text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            <span>{t('qbed.picture_width')}</span>
            <span className="flex items-center gap-2"><input type="range" min="10" max="100" step="5" value={settings.width} onChange={event => set('width', Number(event.target.value))} aria-label={t('qbed.picture_width')} className="min-w-0 flex-1" /><bdi className="min-w-10 text-end">{settings.width}%</bdi></span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            <span>{t('qbed.picture_align')}</span>
            <select value={settings.align} onChange={event => set('align', event.target.value)} aria-label={t('qbed.picture_align')} className="h-9 rounded-token bg-surface px-2 text-sm [border:1px_solid_var(--line)]">
              {['left', 'center', 'right'].map(value => <option key={value} value={value}>{t(`qbed.align_${value}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            <span>{t('qbed.picture_position')}</span>
            <select value={settings.position} onChange={event => set('position', event.target.value)} aria-label={t('qbed.picture_position')} className="h-9 rounded-token bg-surface px-2 text-sm [border:1px_solid_var(--line)]">
              {['cursor', 'start', 'end', 'after'].map(value => <option key={value} value={value}>{t(`qbed.picture_positions.${value}`)}</option>)}
            </select>
          </label>
          {settings.position === 'after' && <label className="flex flex-col gap-1 text-sm font-medium"><span>{t('qbed.picture_paragraph')}</span><input type="number" min="1" max="100" value={settings.paragraph} onChange={event => set('paragraph', Number(event.target.value))} className="h-9 rounded-token bg-surface px-2 text-sm [border:1px_solid_var(--line)]" /></label>}
          <label className="flex flex-col gap-1 text-sm font-medium">
            <span>{t('qbed.picture_rotation')}</span>
            <select value={settings.rotation} onChange={event => set('rotation', Number(event.target.value))} aria-label={t('qbed.picture_rotation')} className="h-9 rounded-token bg-surface px-2 text-sm [border:1px_solid_var(--line)]">
              {[0, 90, 180, 270].map(value => <option key={value} value={value}>{value}°</option>)}
            </select>
          </label>
          <Check label={t('qbed.picture_transparent_background')} checked={settings.transparentBackground} onChange={event => set('transparentBackground', event.target.checked)} />
        </section>
        <section className="flex min-h-52 items-center justify-center overflow-hidden rounded-token bg-surface-muted/40 p-3" aria-label={t('qbed.picture_preview')} data-testid="qb-picture-preview">
          {previewUrl ? <img src={previewUrl} alt={t('qbed.picture_preview')} className="max-h-64 max-w-full object-contain" style={{ width: `${settings.width}%`, transform: `rotate(${settings.rotation}deg)`, objectPosition: settings.align }} /> : <p className="text-sm text-content-muted">{t('qbed.picture_pick_first')}</p>}
        </section>
      </div>
    </Modal>
  )
}
