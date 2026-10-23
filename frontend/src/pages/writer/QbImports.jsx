import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { versionsForSubject } from '../../features/qb/curriculum'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { fmtDate, fmtNumber as formatNumber, fmtTime } from '../../i18n/format'
import { multipart } from '../../features/students/formData'
import { subjectsForClasses } from '../../features/qb/curriculum'

// R2.1.3 /writer/imports (D123, D110): qbank's JSON import page, with TOON - one or several .json/.toon/.txt files or pasted
// text, then the staging review; below it the recent imports with their exact counts. The schema and examples download here.
export default function QbImports() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const n = (v) => formatNumber(v, i18n.language)
  const [files, setFiles] = useState([])
  const [text, setText] = useState('')
  const [format, setFormat] = useState('json')
  const [range, setRange] = useState({ from: '', to: '' })
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptClassId, setPromptClassId] = useState('')
  const [promptSubjectId, setPromptSubjectId] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const modalRef = useRef(null)
  const promptTree = useQuery({
    queryKey: ['writer', 'curriculum'],
    queryFn: () => api.get('/writer/curriculum').then(r => r.data.data),
    enabled: promptOpen,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const promptTypes = useQuery({
    queryKey: ['writer', 'question-types'],
    queryFn: () => api.get('/writer/question-types').then(r => r.data.data),
    enabled: promptOpen,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const isPdf = files.length === 1 && /\.pdf$/i.test(files[0].name)
  const list = useQuery({ queryKey: ['writer', 'imports'], queryFn: () => api.get('/writer/imports').then(r => r.data.data) })
  const send = useMutation({
    mutationFn: () => {
      if (isPdf) {                                       // D124: one PDF, with an optional page range
        const fd = new FormData()
        fd.append('pdf', files[0])
        if (range.from) fd.append('page_from', range.from)
        if (range.to) fd.append('page_to', range.to)
        return api.post('/writer/imports', fd, multipart).then(r => r.data.data)
      }
      if (files.length) {
        const fd = new FormData()
        files.forEach(f => fd.append('files[]', f))
        return api.post('/writer/imports', fd, multipart).then(r => r.data.data)
      }
      return api.post('/writer/imports', { text, format }).then(r => r.data.data)
    },
    onSuccess: (b) => nav(`/writer/imports/${b.id}`),
  })
  const download = async (path, name) => {
    const blob = (await api.get(path, { responseType: 'blob' })).data
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const locale = i18n.resolvedLanguage?.startsWith('bn') ? 'bn' : 'en'
  const tree = promptTree.data
  const selectedClass = tree?.class_levels?.find(c => String(c.id) === promptClassId)
  const availableSubjects = useMemo(() => subjectsForClasses(tree?.subjects ?? [], promptClassId ? [promptClassId] : []), [tree, promptClassId])
  const selectedSubject = availableSubjects.find(s => String(s.id) === promptSubjectId)
  const currentChapters = (selectedSubject?.chapters ?? []).filter(ch => !ch.class_level_ids?.length || ch.class_level_ids.some(id => Number(id) === Number(promptClassId)))
  const displayName = (row) => (locale === 'bn' ? row?.name_bn : row?.name_en) || row?.name_bn || row?.name_en || ''
  const curriculumVersions = versionsForSubject(tree?.curriculum_versions, selectedSubject?.id, promptClassId ? [promptClassId] : [])
  const namedNodes = (nodes) => (nodes ?? []).map(node => ({ id: node.id, kind: node.kind, name: displayName(node), children: namedNodes(node.children) }))
  const subjectNames = `${selectedSubject?.name_en ?? ''} ${selectedSubject?.name_bn ?? ''}`
  const contentLanguage = /english|ইংরেজি/i.test(subjectNames)
    ? 'en'
    : /bangla|বাংলা/i.test(subjectNames) ? 'bn' : locale
  const prompt = selectedClass && selectedSubject ? [
    `Create question records for ${displayName(selectedSubject)} in ${displayName(selectedClass)}. Follow the subject's terminology and question conventions, using only the curriculum data below.`,
    'Return exactly one raw UTF-8 JSON object using schema_version "exam-management.universal-content-json.v5", with document and questions fields. Do not return an attachment or attachment reference (including #attachment:...), HTML-escaped text such as &#x20;, markdown fences, labels, commentary, or text outside the object. Do not add backslashes at line ends or between JSON lines. The response must paste directly into JSON.parse without cleanup.',
    `Use this syntax-only example; replace every sample value and question with the requested content: ${JSON.stringify({
      schema_version: 'exam-management.universal-content-json.v5',
      document: { title: 'নমুনা', language: contentLanguage },
      questions: [{
        question_type: 'mcq', question_text: 'প্রশ্নের লেখা', answer_text: 'সঠিক উত্তর', explanation_text: 'সংক্ষিপ্ত ব্যাখ্যা',
        settings: { class_levels: [{ id: selectedClass.id, name: displayName(selectedClass) }], subject: { id: selectedSubject.id, name: displayName(selectedSubject) } },
        options: [{ label: 'ক', text: 'বিকল্প ১', is_correct: true }, { label: 'খ', text: 'বিকল্প ২', is_correct: false }],
        occurrences: [],
      }],
    }, null, 2)}`,
    'Only transcribe or reproduce supplied source questions when the user confirms they own the rights or have explicit permission to reproduce and import them. A copyright notice or upload alone is not permission. Otherwise, do not copy or closely paraphrase the source; offer original questions instead.',
    `Set document.language to "${contentLanguage}" and write the question content in ${contentLanguage === 'bn' ? 'Bengali' : 'English'} unless the source material requires another language.`,
    'For mathematical expressions, use LaTeX in question_text, options[].text, answer_text, explanation_text, stimulus_text and creative-part text where needed. Use \\( ... \\) for inline math and \\[ ... \\] for display math. Keep formulas as text; do not convert them to HTML or HTML entities.',
    `JSON must escape LaTeX backslashes so the parsed string contains the normal delimiters. Example: ${JSON.stringify({ question_text: 'সমীকরণটি \\(x^2 = 9\\) সমাধান করো।' })}`,
    'Each question must include question_type, question_text, answer_text and explanation_text when applicable, plus settings containing class_levels and subject. For legacy chapter/topic curricula, include settings.chapter and settings.topic using supplied IDs and exact names. For a language-paper syllabus path, include question-level curriculum_node_ids as an array of integer node IDs from the selected subject; include every applicable node ID, and do not use question type or exam part as a syllabus node. For multiple choice questions include options with label, text and is_correct; for creative questions include stimulus_text and creative_parts with label, cognitive_level, question_text, answer_text and marks. Put source information in that question\'s occurrences array using only known fields such as note, institution_name, board, exam_type, year, question_number, set_label and page_reference.',
    `For every question transcribed from a rights-cleared source, include the source's exact printed serial in occurrences.question_number as a JSON string (for example "12"), never a number or the output/batch position; include page_reference as a string when known. Preserve letters, punctuation and leading zeroes in printed serials. Do not guess or renumber missing source numbers. For independently authored questions with no source mapping, use occurrences: []. Keep the source number and page reference on image-bearing questions so a later editor can match the correct figure. Example occurrence shape (replace these illustrative values): ${JSON.stringify({ question_number: '12', page_reference: 'p. 4' })}`,
    `Use question_type only from these active types: ${JSON.stringify((promptTypes.data ?? []).map(type => type.slug))}.`,
    'Never invent a curriculum item or map an unfamiliar topic to an existing topic. If a genuinely new topic is needed, leave that question\'s settings.topic unset and add a root-level topic_proposals array entry with chapter_id, chapter_name, proposed_topic_name, reason, and affected_question_numbers. Tell the user to add or review each proposed topic in its named chapter before assigning it. topic_proposals is informational metadata, not an importable question.',
    'Do not include markdown fences or text outside the JSON object.',
    `Selected class: ${JSON.stringify({ id: selectedClass.id, name: displayName(selectedClass) })}`,
    `Selected subject: ${JSON.stringify({ id: selectedSubject.id, name: displayName(selectedSubject) })}`,
    `Existing chapters and topics: ${JSON.stringify(currentChapters.map(ch => ({ id: ch.id, name: displayName(ch), topics: (ch.topics ?? []).map(topic => ({ id: topic.id, name: displayName(topic) })) })))}`,
    `Applicable language-paper curriculum versions and nodes: ${JSON.stringify(curriculumVersions.map(version => ({ id: version.id, version_key: version.version_key, name: displayName(version), nodes: namedNodes(version.nodes) })))}`,
  ].join('\n\n') : ''
  const closePrompt = () => { setPromptOpen(false); setCopied(false); setCopyFailed(false) }
  useEffect(() => {
    if (!promptOpen) return undefined
    const previous = document.activeElement
    modalRef.current?.querySelector('select')?.focus()
    const onKey = e => { if (e.key === 'Escape') { setPromptOpen(false); setCopied(false); setCopyFailed(false) } }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [promptOpen])
  const copyPrompt = async () => {
    setCopyFailed(false)
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(prompt)
      else {
        const field = document.createElement('textarea')
        field.value = prompt
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        const ok = document.execCommand('copy')
        field.remove()
        if (!ok) throw new Error('copy unavailable')
      }
      setCopied(true)
    } catch { setCopyFailed(true) }
  }
  const downloadPrompt = () => {
    const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ai-question-prompt.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-imports">
      <PageHeader title={t('qbi.title')} subtitle={t('qbi.subtitle')} />
      <div className="flex justify-end">
        <Button onClick={() => { setPromptClassId(''); setPromptSubjectId(''); setCopied(false); setCopyFailed(false); setPromptOpen(true) }} data-testid="qbi-ai-prompt">{t('qbi.ai_prompt')}</Button>
      </div>
      <Card>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); send.mutate() }}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('qbi.files')}</span>
            <input type="file" name="files" multiple accept=".json,.toon,.txt,.pdf,application/json,text/plain,application/pdf" onChange={e => setFiles([...e.target.files])} />
            <span className="text-xs text-content-muted">{t('qbi.files_hint')}</span>
          </label>
          {isPdf && (
            <div className="grid max-w-md gap-3 sm:grid-cols-2" data-testid="qbi-range">
              <Input label={t('qbi.page_from')} name="page_from" type="number" min="1" ltr value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} />
              <Input label={t('qbi.page_to')} name="page_to" type="number" min="1" ltr value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} />
            </div>
          )}
          {files.length === 0 && (
            <>
              <Textarea label={t('qbi.paste')} name="text" rows={6} dir="ltr" value={text} onChange={e => setText(e.target.value)} />
              <div className="max-w-xs">
                <Select label={t('qbi.format')} name="format" value={format} onChange={e => setFormat(e.target.value)}
                  options={[{ value: 'json', label: 'JSON' }, { value: 'toon', label: 'TOON' }]} />
              </div>
            </>
          )}
          {send.isError && <p className="text-sm text-red-600" role="alert">{send.error?.response?.data?.message ?? t('qbi.failed')}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={send.isPending} disabled={!files.length && !text.trim()} data-testid="qbi-upload">{t('qbi.check')}</Button>
            <Button variant="ghost" onClick={() => download('/writer/imports/schema.json', 'question-import-schema.json')}>{t('qbi.schema')}</Button>
            <Button variant="ghost" onClick={() => download('/writer/imports/example.json', 'question-import-example.json')}>{t('qbi.example_json')}</Button>
            <Button variant="ghost" onClick={() => download('/writer/imports/example.toon', 'question-import-example.toon')}>{t('qbi.example_toon')}</Button>
          </div>
        </form>
      </Card>
      {promptOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-5" onClick={closePrompt}>
          <section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="qbi-prompt-title" onClick={e => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-token bg-surface p-density text-content shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="qbi-prompt-title" className="text-lg font-semibold">{t('qbi.ai_prompt')}</h2><p className="mt-1 text-sm text-content-muted">{t('qbi.ai_prompt_hint')}</p></div>
              <Button variant="ghost" aria-label={t('qbi.prompt_close')} onClick={closePrompt}>
                <span aria-hidden="true" className="inline-flex size-4 items-center justify-center text-2xl leading-none">×</span>
              </Button>
            </div>
            {promptTree.isPending || promptTypes.isPending ? <Loader type="list" /> : promptTree.isError || promptTypes.isError ? (
              <ErrorState onRetry={() => { promptTree.refetch(); promptTypes.refetch() }} />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label={t('qbi.prompt_class')} value={promptClassId} onChange={e => { setPromptClassId(e.target.value); setPromptSubjectId('') }}
                    placeholder={t('qbi.prompt_choose_class')} options={(tree?.class_levels ?? []).filter(c => c.is_active !== false).map(c => ({ value: String(c.id), label: displayName(c) }))} />
                  <Select label={t('qbi.prompt_subject')} value={promptSubjectId} disabled={!promptClassId} onChange={e => setPromptSubjectId(e.target.value)}
                    placeholder={t('qbi.prompt_choose_subject')} options={availableSubjects.filter(s => s.is_active !== false).map(s => ({ value: String(s.id), label: displayName(s) }))} />
                </div>
                {promptClassId && availableSubjects.length === 0 && <p className="text-sm text-content-muted">{t('qbi.prompt_no_subjects')}</p>}
                {selectedSubject && currentChapters.length === 0 && <p className="text-sm text-content-muted">{t('qbi.prompt_no_chapters')}</p>}
                {prompt && <Textarea label={t('qbi.prompt_output')} rows={16} readOnly value={prompt} dir="auto" data-testid="qbi-prompt-output" />}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" disabled={!prompt} onClick={copyPrompt}
                    className={copied ? 'animate-[qb-copy-success_700ms_ease-out] border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' : ''}
                    aria-live="polite" data-testid="qbi-copy-button">
                    {copied ? <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block animate-[qb-copy-check_500ms_cubic-bezier(0.16,1,0.3,1)]">✓</span>{t('qbi.prompt_copied')}</span> : copyFailed ? t('qbi.prompt_copy_failed') : t('qbi.prompt_copy')}
                  </Button>
                  <Button disabled={!prompt} onClick={downloadPrompt}>{t('qbi.prompt_download')}</Button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      <Card>
        <h2 className="mb-3 font-semibold">{t('qbi.recent')}</h2>
        {list.isPending ? <Loader type="list" /> : list.isError ? <ErrorState onRetry={list.refetch} /> : list.data.length === 0 ? <EmptyState title={t('qbi.none')} /> : (
          <ul className="flex flex-col gap-2">
            {list.data.map(b => (
              <li key={b.id}>
                <Link to={`/writer/imports/${b.id}`} data-batch={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-token [border:1px_solid_var(--line)] p-3 hover:bg-surface-muted">
                  <span className="min-w-0 font-medium" dir="auto">
                    {b.files.map(f => f.name).join(', ')} <span className="text-xs uppercase text-content-muted">{b.format}</span>
                    {b.created_at && <time className="block text-xs font-normal text-content-muted" dateTime={b.created_at}>{fmtDate(b.created_at, i18n.language)} · {fmtTime(b.created_at, i18n.language)}</time>}
                  </span>
                  <span className="text-sm">{t(`qbi.status.${b.status}`)} · {t('qbi.counts', { total: n(b.counts.total), valid: n(b.counts.valid), invalid: n(b.counts.invalid), imported: n(b.counts.imported) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
