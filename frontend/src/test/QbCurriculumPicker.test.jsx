import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
    render(<CurriculumPicker label="Path" rows={rows} value={[]} onChange={onChange} />)
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: 'prose aam' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['11'])
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows picked paths as removable breadcrumbs and an empty result', () => {
    const onChange = vi.fn()
    render(<CurriculumPicker label="Path" rows={rows} value={['11', '12']} onChange={onChange} />)
    expect(screen.getByTestId('curriculum-breadcrumb').textContent).toContain('Prose › Aam Antir Bhepu')
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(onChange).toHaveBeenCalledWith(['12'])
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
