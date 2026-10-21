import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import CurriculumNodeHelp, { CurriculumNodeHelpButton } from './CurriculumNodeHelp'
import { WriterFieldHelpButton } from './WriterFieldHelp'
import Button from '../../components/Button'
import { Plus } from 'lucide-react'

/**
 * D139: the writer's searchable syllabus path - type part of any name on the path, move with ↑ ↓, Enter picks, Esc closes; the picked
 * paths show as full breadcrumbs that can be removed. A question may have none, one or several (0..N links).
 * rows come from flattenCurriculum(); value is a list of node ids (strings).
 */
export default function CurriculumPicker({ label, note, rows, value, onChange, onHelp, onAdd, disabled = false, name = 'curriculum' }) {
  const { t } = useTranslation()
  const listId = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [helpKind, setHelpKind] = useState(null)
  const [cursor, setCursor] = useState(0)
  const chosen = rows.filter(r => value.includes(String(r.id)))
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return rows.filter(r => words.every(w => r.label.toLowerCase().includes(w))).slice(0, 50)
  }, [rows, q])
  const toggle = (row) => onChange(value.includes(String(row.id)) ? value.filter(v => v !== String(row.id)) : [...value, String(row.id)])
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => Math.min(shown.length - 1, c + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)) }
    else if (e.key === 'Enter' && open && shown[cursor]) { e.preventDefault(); toggle(shown[cursor]) }
    else if (e.key === 'Escape') setOpen(false)
  }
  const versions = new Set(rows.map(r => r.version))
  return (
    <div className="flex flex-col gap-2 sm:col-span-2" data-testid="curriculum-picker" data-name={name}>
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{label}</span><span className="flex items-center gap-1">{onAdd && <Button variant="secondary" className="h-8 px-2" onClick={onAdd}><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add')}</Button>}{onHelp && <WriterFieldHelpButton onClick={onHelp} />}</span></div>
      {chosen.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="curriculum-breadcrumb">
          {chosen.map(r => (
            <li key={r.id} className="flex items-start gap-2 rounded-token bg-primary-soft px-2 py-1 text-sm" dir="auto">
              <span className="flex-1 break-words">{versions.size > 1 && <span className="text-xs text-content-muted">{r.version} · </span>}{r.label}</span>
              {!disabled && <button type="button" onClick={() => toggle(r)} aria-label={t('qbaq.remove', { x: r.label })}><X aria-hidden="true" className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="relative flex flex-col">
          <input type="search" className="rounded-token border px-3 py-2 text-sm" placeholder={t('qbed.curriculum_search')} value={q} role="combobox"
            aria-expanded={open} aria-controls={listId} aria-label={label} aria-autocomplete="list"
            aria-activedescendant={open && shown[cursor] ? `${listId}-${shown[cursor].id}` : undefined}
            onChange={e => { setQ(e.target.value); setOpen(true); setCursor(0) }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKey} />
          {open && (
            <ul id={listId} role="listbox" aria-multiselectable="true" className="mt-1 flex max-h-64 flex-col overflow-auto rounded-token border bg-surface">
              {shown.length === 0 ? <li className="px-3 py-2 text-sm text-content-muted">{t('qbed.curriculum_none')}</li> : shown.map((r, i) => (
                <li key={r.id} role="none" className="flex items-start gap-1 px-2 py-1" dir="auto">
                  <div id={`${listId}-${r.id}`} role="option" aria-selected={value.includes(String(r.id))}
                    className={`flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-token px-1 py-1 text-sm ${i === cursor ? 'bg-surface-muted' : ''}`}
                    onMouseDown={e => { e.preventDefault(); toggle(r) }} onMouseEnter={() => setCursor(i)}>
                    <input type="checkbox" readOnly tabIndex={-1} checked={value.includes(String(r.id))} className="mt-1" aria-hidden="true" />
                    <span className="flex-1 break-words">{r.label}{r.kind && <span className="text-xs text-content-muted"> · {t(`qbed.node_kinds.${r.kind}`, r.kind)}</span>}</span>
                  </div>
                  {r.kind && <CurriculumNodeHelpButton onClick={() => setHelpKind(r.kind)} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {chosen.length === 0 && <p className="text-xs text-content-muted">{t('qbed.curriculum_optional')}</p>}
      {note && <p className="text-xs text-content-muted">{note}</p>}
      {helpKind && <CurriculumNodeHelp kind={helpKind === 'all' ? null : helpKind} onClose={() => setHelpKind(null)} />}
    </div>
  )
}
