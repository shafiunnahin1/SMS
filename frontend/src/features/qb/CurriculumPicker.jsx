import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { WriterFieldHelpButton } from './WriterFieldHelp'
import Button from '../../components/Button'
import { Select } from '../../components/FormField'

const NODE_KINDS = ['Part', 'Unit', 'Lesson', 'Text', 'Topic', 'Other']

/**
 * D139: the writer's searchable syllabus path - type part of any name on the path, move with ↑ ↓, Enter picks, Esc closes; the picked
 * paths show as full breadcrumbs that can be removed. A question may have none, one or several (0..N links).
 * rows come from flattenCurriculum(); value is a list of node ids (strings).
 */
export default function CurriculumPicker({ label, note, rows, value, onChange, onHelp, onAdd, onAddVersion, versions: suppliedVersions = [], disabled = false, name = 'curriculum' }) {
  const { t } = useTranslation()
  const listId = useId()
  const derivedVersions = [...new Map(rows.map(row => [String(row.version_id), { id: row.version_id, label: row.version }])).values()]
  const versions = suppliedVersions.length ? suppliedVersions : derivedVersions
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const versionSignature = versions.map(version => String(version.id)).join('|')
  const rowsSignature = rows.map(row => `${row.id}:${row.version_id}:${row.parent_id ?? ''}`).join('|')
  const valueSignature = value.map(String).join('|')
  const [versionId, setVersionId] = useState(String(versions[0]?.id ?? ''))
  const [path, setPath] = useState([])
  const [activeSelection, setActiveSelection] = useState(null)
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return rows.filter(row => words.every(word => row.label.toLowerCase().includes(word))).slice(0, 50)
  }, [rows, query])
  useEffect(() => {
    const selectedId = valueSignature.split('|').filter(Boolean).at(-1)
    const byId = new Map(rows.map(row => [String(row.id), row]))
    let selected = byId.get(selectedId)
    if (selected) {
      const selectedVersion = String(selected.version_id)
      const selectedPath = []
      while (selected) {
        selectedPath.unshift(String(selected.id))
        selected = byId.get(String(selected.parent_id ?? ''))
      }
      setVersionId(selectedVersion)
      setPath(selectedPath)
      setActiveSelection(selectedId)
    } else {
      setVersionId(current => versions.some(version => String(version.id) === current) ? current : String(versions[0]?.id ?? ''))
      setPath([])
      setActiveSelection(null)
    }
  }, [versionSignature, rowsSignature, valueSignature])
  const chosen = rows.filter(r => value.includes(String(r.id)))
  const toggleSearchRow = (row) => onChange(value.includes(String(row.id))
    ? value.filter(id => String(id) !== String(row.id))
    : [...value, String(row.id)])
  const onSearchKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setCursor(index => Math.min(shown.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor(index => Math.max(0, index - 1))
    } else if (event.key === 'Enter' && open && shown[cursor]) {
      event.preventDefault()
      toggleSearchRow(shown[cursor])
    } else if (event.key === 'Escape') setOpen(false)
  }
  const candidates = (parentId) => rows.filter(row => String(row.version_id) === versionId
    && String(row.parent_id ?? '') === String(parentId ?? ''))
  const levels = []
  let parentId = null
  for (let depth = 0; depth <= path.length; depth += 1) {
    levels.push({ depth, parentId, options: candidates(parentId) })
    if (!path[depth]) break
    parentId = path[depth]
  }
  const changeLevel = (depth, selectedId) => {
    const nextPath = path.slice(0, depth)
    if (selectedId) nextPath.push(String(selectedId))
    const terminal = nextPath.at(-1) ?? null
    const nextValue = value.map(String).filter(id => id !== String(activeSelection ?? ''))
    if (terminal && !nextValue.includes(terminal)) nextValue.push(terminal)
    onChange(nextValue)
    setPath(nextPath)
    setActiveSelection(terminal)
  }
  const beginAnotherPath = () => {
    setPath([])
    setActiveSelection(null)
  }
  const remove = (id) => {
    onChange(value.filter(item => String(item) !== String(id)))
    if (String(activeSelection) === String(id)) {
      setPath([])
      setActiveSelection(null)
    }
  }
  const add = ({ depth, parentId: nodeParentId }) => onAdd?.({
    versionId,
    parentId: nodeParentId,
    depth,
    kind: NODE_KINDS[Math.min(depth, NODE_KINDS.length - 1)],
  })
  return (
    <div className="flex flex-col gap-2 sm:col-span-2" data-testid="curriculum-picker" data-name={name}>
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{label}</span>{onHelp && <WriterFieldHelpButton onClick={onHelp} />}</div>
      {chosen.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="curriculum-breadcrumb">
          {chosen.map(r => (
            <li key={r.id} className="flex items-start gap-2 rounded-token bg-primary-soft px-2 py-1 text-sm" dir="auto">
              <span className="flex-1 break-words">{versions.length > 1 && <span className="text-xs text-content-muted">{r.version} · </span>}{r.label}</span>
              {!disabled && <button type="button" onClick={() => remove(r.id)} aria-label={t('qbaq.remove', { x: r.label })}><X aria-hidden="true" className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      {versions.length === 0 ? <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-content-muted">{t('qbed.curriculum_no_version')}</p>
        {!disabled && onAddVersion && <Button type="button" variant="secondary" className="shrink-0" onClick={onAddVersion}>
          <Plus aria-hidden="true" className="h-4 w-4" />{t('qbed.add_item.curriculum-version.button')}
        </Button>}
      </div> : <>
        {!disabled && <div className="relative flex flex-col">
          <input type="search" className="rounded-token border px-3 py-2 text-sm" placeholder={t('qbed.curriculum_search')} value={query}
            role="combobox" aria-expanded={open} aria-controls={listId} aria-label={label} aria-autocomplete="list"
            aria-activedescendant={open && shown[cursor] ? `${listId}-${shown[cursor].id}` : undefined}
            onChange={event => { setQuery(event.target.value); setOpen(true); setCursor(0) }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onSearchKeyDown} />
          {open && <ul id={listId} role="listbox" aria-multiselectable="true" className="mt-1 flex max-h-64 flex-col overflow-auto rounded-token border bg-surface">
            {shown.length === 0 ? <li className="px-3 py-2 text-sm text-content-muted">{t('qbed.curriculum_none')}</li> : shown.map((row, index) => (
              <li key={row.id} role="none" className="flex items-start gap-1 px-2 py-1" dir="auto">
                <div id={`${listId}-${row.id}`} role="option" aria-selected={value.includes(String(row.id))}
                  className={`flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-token px-1 py-1 text-sm ${index === cursor ? 'bg-surface-muted' : ''}`}
                  onMouseDown={event => { event.preventDefault(); toggleSearchRow(row) }} onMouseEnter={() => setCursor(index)}>
                  <input type="checkbox" readOnly tabIndex={-1} checked={value.includes(String(row.id))} className="mt-1" aria-hidden="true" />
                  <span className="flex-1 break-words">{row.label}{row.kind && <span className="text-xs text-content-muted"> · {t(`qbed.node_kinds.${row.kind}`, row.kind)}</span>}</span>
                </div>
              </li>
            ))}
          </ul>}
        </div>}
        {!disabled && versions.length > 1 && <Select label={t('qbed.node_version')} value={versionId}
          options={versions.map(version => ({ value: String(version.id), label: version.label ?? version.name_bn ?? version.name_en ?? version.version_key }))}
          onChange={event => {
            const nextVersion = event.target.value
            if (activeSelection) onChange(value.filter(item => String(item) !== String(activeSelection)))
            setVersionId(nextVersion)
            setPath([])
            setActiveSelection(null)
          }} />}
        {!disabled && levels.map(({ depth, parentId: levelParentId, options }) => (
          <div key={`${versionId}-${depth}`} className="flex items-end gap-2">
            <Select className="min-w-0 flex-1" label={t('qbed.curriculum_level', { level: depth + 1 })}
              placeholder={t('qb.none_option')}
              options={options.map(row => ({ value: String(row.id), label: `${row.path.at(-1)} · ${t(`qbed.node_kinds.${row.kind}`, row.kind)}` }))}
              value={path[depth] ?? ''} onChange={event => changeLevel(depth, event.target.value)} />
            {onAdd && <Button type="button" variant="secondary" className="shrink-0" onClick={() => add({ depth, parentId: levelParentId })}>
              <Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add')}
            </Button>}
          </div>
        ))}
        {activeSelection && !disabled && <Button type="button" variant="secondary" className="self-start" onClick={beginAnotherPath}>
          <Plus aria-hidden="true" className="h-4 w-4" />{t('qbed.curriculum_add_path')}
        </Button>}
      </>}
      {chosen.length === 0 && <p className="text-xs text-content-muted">{t('qbed.curriculum_optional')}</p>}
      {note && <p className="text-xs text-content-muted">{note}</p>}
    </div>
  )
}
