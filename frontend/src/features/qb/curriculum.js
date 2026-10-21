// D138/D139: helpers for the flexible (language-paper) curriculum next to the fixed chapter → topic tree. A subject that has a
// curriculum version is placed by its syllabus path (Part → Unit → Lesson → Text → Topic, any depth); other subjects keep chapter →
// topic. The question type / exam part (Grammar, Seen/Unseen, MCQ …) is a separate taxonomy and never a path node.

/** the subjects that belong to the chosen classes (all subjects when no class is chosen) */
export const subjectsForClasses = (subjects, classIds) => {
  const ids = (classIds ?? []).map(Number)
  return (subjects ?? []).filter(s => ids.length === 0 || (s.class_level_ids ?? []).some(id => ids.includes(Number(id))))
}

/** the subject's curriculum versions, active first */
export const versionsForSubject = (versions, subjectId) => (versions ?? [])
  .filter(v => String(v.qb_subject_id) === String(subjectId))
  .sort((a, b) => Number(b.is_active) - Number(a.is_active))

/** every node of the versions as one searchable row: its id, the path of names and the version it belongs to */
export function flattenCurriculum(versions, name) {
  const rows = []
  const walk = (nodes, parents, version) => (nodes ?? []).forEach(node => {
    const path = [...parents, name(node)]
    rows.push({ id: node.id, kind: node.kind, path, label: path.join(' › '), version: name(version) || version.version_key, version_id: version.id, parent_id: node.parent_id ?? null, sort_order: node.sort_order ?? 0, depth: parents.length })
    walk(node.children, path, version)
  })
  for (const version of versions ?? []) walk(version.nodes, [], version)
  return rows
}

/** a stored breadcrumb (from the API) as one localized line: subject › part › … › node */
export const breadcrumbLabel = (crumb, locale) => [locale === 'bn' ? crumb.subject_name_bn : crumb.subject_name_en,
  ...(crumb.path ?? []).map(part => (locale === 'bn' ? part.name_bn || part.name_en : part.name_en || part.name_bn))].filter(Boolean).join(' › ')

/** a source occurrence as one line, with the optional question number, set and page/reference (D139) */
export const sourceLabel = (o, t) => [o.board, o.institution_name, o.exam_type, o.year,
  o.question_number && t('qbed.question_number_short', { n: o.question_number }),
  o.set_label && t('qbed.set_label_short', { n: o.set_label }),
  o.page_reference && t('qbed.page_reference_short', { n: o.page_reference })].filter(Boolean).join(' · ')
