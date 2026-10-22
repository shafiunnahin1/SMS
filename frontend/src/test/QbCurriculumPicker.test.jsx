import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '../i18n'
import CurriculumPicker from '../features/qb/CurriculumPicker'
import { breadcrumbLabel, flattenCurriculum, sourceLabel, subjectsForClasses, versionsForSubject } from '../features/qb/curriculum'

const name = (n) => n.name_en
const versions = [
  { id: 2, qb_subject_id: 5, is_active: false, name_en: 'Old', version_key: 'v1', nodes: [] },
  { id: 1, qb_subject_id: 5, is_active: true, name_en: '2026', version_key: 'v2', nodes: [
    { id: 10, kind: 'Part', name_en: 'Prose', children: [{ id: 11, kind: 'Text', name_en: 'Aam Antir Bhepu', children: [] }] },
    { id: 12, kind: 'Part', name_en: 'Poetry', children: [] },
  ] },
  { id: 3, qb_subject_id: 6, is_active: true, name_en: 'Other', nodes: [{ id: 99, kind: 'Unit', name_en: 'X', children: [] }] },
]

describe('D139 curriculum helpers', () => {
  it('filters subjects by class and versions by subject, active first', () => {
    const subjects = [{ id: 5, class_level_ids: [9, 10] }, { id: 6, class_level_ids: [11] }]
    expect(subjectsForClasses(subjects, ['9']).map(s => s.id)).toEqual([5])
    expect(subjectsForClasses(subjects, []).map(s => s.id)).toEqual([5, 6])
    expect(versionsForSubject(versions, '5').map(v => v.id)).toEqual([1, 2])
  })

  it('filters mapped versions by selected class and falls back to legacy versions only before any version is mapped', () => {
    const mapped = [
      { id: 10, qb_subject_id: 5, class_level_ids: [6, 7, 8], is_active: true },
      { id: 11, qb_subject_id: 5, class_level_ids: [9, 10], is_active: true },
      { id: 12, qb_subject_id: 5, class_level_ids: [11, 12], is_active: true },
      { id: 13, qb_subject_id: 5, class_level_ids: [], is_active: true },
    ]
    expect(versionsForSubject(mapped, 5, [7, 8]).map(v => v.id)).toEqual([10])
    expect(versionsForSubject(mapped, 5, [10]).map(v => v.id)).toEqual([11])
    expect(versionsForSubject(mapped, 5, [7, 10]).map(v => v.id)).toEqual([])
    expect(versionsForSubject(mapped, 5, []).map(v => v.id)).toEqual([])
    expect(versionsForSubject([{ ...mapped[3] }], 5, [7]).map(v => v.id)).toEqual([13])
  })

  it('flattens the tree into searchable paths', () => {
    const rows = flattenCurriculum(versionsForSubject(versions, 5), name)
    expect(rows.map(r => r.label)).toEqual(['Prose', 'Prose › Aam Antir Bhepu', 'Poetry'])
    expect(rows[1]).toMatchObject({ id: 11, kind: 'Text', depth: 1, version: '2026' })
  })

  it('labels breadcrumbs per locale and sources with number/set/page', () => {
    const crumb = { subject_name_bn: 'বাংলা', subject_name_en: 'Bangla', path: [{ name_bn: 'গদ্য', name_en: 'Prose' }, { name_bn: '', name_en: 'Text' }] }
    expect(breadcrumbLabel(crumb, 'en')).toBe('Bangla › Prose › Text')
    expect(breadcrumbLabel(crumb, 'bn')).toBe('বাংলা › গদ্য › Text')
    const t = (k, o) => `${k.split('.').pop()}:${o.n}`
    expect(sourceLabel({ board: 'Dhaka', year: 2024, question_number: '3', set_label: 'Ka', page_reference: '' }, t))
      .toBe('Dhaka · 2024 · question_number_short:3 · set_label_short:Ka')
  })
})

describe('CurriculumPicker', () => {
  const rows = flattenCurriculum(versionsForSubject(versions, 5), name)

  it('searches by any words and picks with the keyboard', () => {
    const onChange = vi.fn()
    render(<CurriculumPicker label="Path" versions={[{ id: 1, label: '2026' }]} rows={rows} value={[]} onChange={onChange} />)
    expect(screen.getByRole('combobox', { name: 'পাঠ্যক্রম সংস্করণ' })).toHaveValue('1')
    const search = screen.getByRole('combobox', { name: 'Path' })
    fireEvent.change(search, { target: { value: 'prose aam' } })
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['11'])
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('selects a node through parent-to-child dropdowns and replaces the active path node', () => {
    const onChange = vi.fn()
    render(<CurriculumPicker label="Path" versions={[{ id: 1, label: '2026' }]} rows={rows} value={[]} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'সিলেবাসের স্তর 1' }), { target: { value: '10' } })
    expect(onChange).toHaveBeenLastCalledWith(['10'])
    fireEvent.change(screen.getByRole('combobox', { name: 'সিলেবাসের স্তর 2' }), { target: { value: '11' } })
    expect(onChange).toHaveBeenLastCalledWith(['11'])
  })

  it('adds a node at the selected level with the current version and parent', () => {
    const onAdd = vi.fn()
    render(<CurriculumPicker label="Path" versions={[{ id: 1, label: '2026' }]} rows={rows} value={[]} onChange={vi.fn()} onAdd={onAdd} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'সিলেবাসের স্তর 1' }), { target: { value: '10' } })
    fireEvent.click(screen.getAllByRole('button')[1])
    expect(onAdd).toHaveBeenCalledWith({ versionId: '1', parentId: '10', depth: 1, kind: 'Unit' })
  })

  it('hydrates dropdowns from a saved terminal node', () => {
    render(<CurriculumPicker label="Path" versions={[{ id: 1, label: '2026' }]} rows={rows} value={['11']} onChange={vi.fn()} />)
    expect(screen.getAllByRole('combobox').slice(2).map(select => select.value)).toEqual(['10', '11', ''])
  })

  it('shows picked paths as removable breadcrumbs and an empty result', () => {
    const onChange = vi.fn()
    render(<CurriculumPicker label="Path" rows={rows} value={['11', '12']} onChange={onChange} />)
    expect(screen.getByTestId('curriculum-breadcrumb').textContent).toContain('Prose › Aam Antir Bhepu')
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(onChange).toHaveBeenCalledWith(['12'])
    expect(screen.getAllByRole('combobox')).toHaveLength(4)
  })

  it('loads the chosen version before showing its root nodes', () => {
    const versionRows = flattenCurriculum([
      { id: 41, version_key: 'old', name_en: 'Old', nodes: [{ id: 410, kind: 'Part', name_en: 'Old part', children: [] }] },
      { id: 42, version_key: 'new', name_en: 'New', nodes: [{ id: 420, kind: 'Unit', name_en: 'New unit', children: [{ id: 421, kind: 'Topic', name_en: 'New topic', children: [] }] }] },
    ], name)
    render(<CurriculumPicker label="Path" versions={[{ id: 41, label: 'Old' }, { id: 42, label: 'New' }]} rows={versionRows} value={[]} onChange={vi.fn()} />)
    const version = screen.getByRole('combobox', { name: 'পাঠ্যক্রম সংস্করণ' })
    fireEvent.change(version, { target: { value: '42' } })
    const root = screen.getByRole('combobox', { name: 'সিলেবাসের স্তর 1' })
    expect(root).toHaveTextContent('New unit')
    expect(root).not.toHaveTextContent('Old part')
    fireEvent.change(root, { target: { value: '420' } })
    expect(screen.getByRole('combobox', { name: 'সিলেবাসের স্তর 2' })).toHaveTextContent('New topic')
  })
})
