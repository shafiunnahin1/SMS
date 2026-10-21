import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import { Select, Textarea } from '../../components/FormField'
import MathText from '../../features/qb/MathText'
import { breadcrumbLabel, flattenCurriculum, versionsForSubject } from '../../features/qb/curriculum'
import { fmtNumber as formatNumber } from '../../i18n/format'
import { MAX_PHOTO_BYTES, readPhoto } from '../../features/qb/ocr'

const MIN = 5
const MAX = 5000

// R2.1.2 /writer/finder (D114 (3), D110, D121): qbank's "find a question" screen - step 1 a photo whose text is read in the
// browser (D121) or the text pasted, step 2 check that text, narrow by subject/chapter/topic/type/language, then the best five published matches
// with qbank's confidence labels; one is marked "recommended" only when it is a high match well ahead of the next.
export default function QbFinder() {
  const { t, i18n } = useTranslation()
  const { locale } = useLocale()
  const [text, setText] = useState('')
  const [ocr, setOcr] = useState({ busy: false, status: '', pct: 0, error: '' })
  const [f, setF] = useState({ qb_subject_id: '', qb_chapter_id: '', qb_topic_id: '', curriculum_node_id: '', qb_question_type_id: '', language: '' })
  const tree = useQuery({ queryKey: ['writer', 'curriculum'], queryFn: () => api.get('/writer/curriculum').then(r => r.data.data) })
  const types = useQuery({ queryKey: ['writer', 'types'], queryFn: () => api.get('/writer/question-types').then(r => r.data.data) })
  const find = useMutation({
    mutationFn: () => {
      const body = { text: text.trim() }
      Object.entries(f).forEach(([k, v]) => { if (v) body[k] = k === 'language' ? v : Number(v) })
      return api.post('/writer/question-finder', body).then(r => r.data)
    },
  })
  if (tree.isPending || types.isPending) return <Loader type="page" />
  if (tree.isError || types.isError) return <ErrorState onRetry={() => { tree.refetch(); types.refetch() }} />

  const name = (n) => (n ? ((locale === 'bn' ? n.name_bn : n.name_en) || n.name_en || n.name_bn) : '')
  const n = (v) => formatNumber(v, i18n.language)
  const subject = tree.data.subjects.find(s => String(s.id) === f.qb_subject_id)
  const chapter = subject?.chapters.find(c => String(c.id) === f.qb_chapter_id)
  const curriculumOptions = flattenCurriculum(versionsForSubject(tree.data.curriculum_versions, f.qb_subject_id), name)
  const set = (k, v) => setF(p => ({ ...p, [k]: v, ...(k === 'qb_subject_id' ? { qb_chapter_id: '', qb_topic_id: '', curriculum_node_id: '' } : {}), ...(k === 'qb_chapter_id' ? { qb_topic_id: '' } : {}) }))
  const short = text.trim().length < MIN
  const r = find.data
  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setOcr({ busy: false, status: '', pct: 0, error: t('qbf.photo_type') })
    if (file.size > MAX_PHOTO_BYTES) return setOcr({ busy: false, status: '', pct: 0, error: t('qbf.photo_size') })
    setOcr({ busy: true, status: '', pct: 0, error: '' })
    try {
      const read = await readPhoto(file, (status, p) => setOcr(o => ({ ...o, status, pct: Math.round(p * 100) })))
      setText(read.slice(0, MAX))
      setOcr({ busy: false, status: '', pct: 100, error: read ? '' : t('qbf.photo_empty') })
    } catch {
      setOcr({ busy: false, status: '', pct: 0, error: t('qbf.photo_failed') })
    }
  }
  const STEPS = ['loading tesseract core', 'initializing tesseract', 'loading language traineddata', 'initializing api', 'recognizing text']

  return (
    <div className="flex flex-col gap-4" data-testid="qb-finder">
      <PageHeader title={t('qbf.title')} subtitle={t('qbf.subtitle')} />
      <Card>
        <div className="mb-3 flex flex-col gap-2" data-testid="qbf-photo">
          <h2 className="font-semibold">{t('qbf.step1')}</h2>
          <input type="file" accept="image/*" name="photo" onChange={onPhoto} disabled={ocr.busy} className="text-sm" />
          {ocr.busy && (
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ocr.pct} className="flex flex-col gap-1 text-sm">
              <span>{t(`qbf.ocr.${STEPS.includes(ocr.status) ? STEPS.indexOf(ocr.status) : 'busy'}`)} <span dir="ltr">{n(ocr.pct)}%</span></span>
              <span className="h-2 rounded-token bg-surface-muted"><span className="block h-2 rounded-token bg-primary" style={{ width: `${ocr.pct}%` }} /></span>
            </div>
          )}
          {ocr.error && <p className="text-sm text-red-600" role="alert">{ocr.error}</p>}
        </div>
        <h2 className="mb-2 font-semibold">{t('qbf.step2')}</h2>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (!short) find.mutate() }}>
          <Textarea label={t('qbf.text')} name="text" rows={5} value={text} maxLength={MAX} dir="auto"
            onChange={e => setText(e.target.value)} hint={`${n(text.length)} / ${n(MAX)}`}
            error={text && short ? t('qbf.too_short') : undefined} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select label={t('qb.subject')} name="qb_subject_id" value={f.qb_subject_id} placeholder={t('qbf.any')} onChange={e => set('qb_subject_id', e.target.value)}
              options={tree.data.subjects.map(s => ({ value: String(s.id), label: name(s) }))} />
            {curriculumOptions.length > 0
              ? <Select className="lg:col-span-2" label={t('qbed.curriculum_path')} name="curriculum_node_id" value={f.curriculum_node_id} placeholder={t('qbf.any')} onChange={e => set('curriculum_node_id', e.target.value)} options={curriculumOptions.map(x => ({ value: String(x.id), label: x.label }))} />
              : <>
                <Select label={t('qb.chapter')} name="qb_chapter_id" value={f.qb_chapter_id} placeholder={t('qbf.any')} onChange={e => set('qb_chapter_id', e.target.value)}
                  options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} />
                <Select label={t('qb.topic')} name="qb_topic_id" value={f.qb_topic_id} placeholder={t('qbf.any')} onChange={e => set('qb_topic_id', e.target.value)}
                  options={(chapter?.topics ?? []).map(tp => ({ value: String(tp.id), label: name(tp) }))} />
              </>}
            <Select label={t('qbed.question_type_exam_part')} name="qb_question_type_id" value={f.qb_question_type_id} placeholder={t('qbf.any')} onChange={e => set('qb_question_type_id', e.target.value)}
              options={types.data.map(ty => ({ value: String(ty.id), label: name(ty) }))} />
            <Select label={t('qbf.language')} name="language" value={f.language} placeholder={t('qbf.any')} onChange={e => set('language', e.target.value)}
              options={[{ value: 'bn', label: t('qbf.lang_bn') }, { value: 'en', label: t('qbf.lang_en') }]} />
          </div>
          <div><Button type="submit" disabled={short} loading={find.isPending} data-testid="qbf-search">{t('qbf.search')}</Button></div>
        </form>
      </Card>
      {find.isError && <ErrorState onRetry={() => find.mutate()} />}
      {r && (
        <Card data-testid="qbf-results" data-decision={r.decision}>
          <h2 className="mb-1 font-semibold">{t('qbf.results')}</h2>
          <p className="mb-3 text-sm text-content-muted">{t(`qbf.decision.${r.decision}`, { count: n(r.candidate_count) })}</p>
          {r.results.length === 0 ? <p className="text-content-muted">{t('qbf.none')}</p> : (
            <ol className="flex flex-col gap-2">
              {r.results.map(x => (
                <li key={x.question_id} data-question={x.question_id} data-confidence={x.confidence}
                  className="flex flex-col gap-1 rounded-token [border:1px_solid_var(--line)] p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold" dir="ltr">#{n(x.rank)}</span>
                    <span className="rounded-token bg-surface-muted px-2">{t(`qbf.conf.${x.confidence}`)} · <span dir="ltr">{n(x.score)}%</span></span>
                    {r.recommended_question_id === x.question_id && <span className="rounded-token bg-primary px-2 text-on-primary" data-testid="qbf-recommended">{t('qbf.recommended')}</span>}
                  </div>
                  <span dir="auto"><MathText text={x.question_text} /></span>
                  <span className="text-sm text-content-muted">{[name(x.subject), name(x.chapter), name(x.topic), name(x.question_type)].filter(Boolean).join(' › ')}</span>
                  {(x.curriculum_breadcrumbs ?? []).map((crumb, i) => <span key={i} className="text-sm text-content-muted break-words" dir="auto" data-testid="finder-curriculum">{breadcrumbLabel(crumb, locale)}</span>)}
                  <Link to={`/writer/questions/${x.question_id}`} className="text-sm text-primary-fg underline">{t('qbf.open')}</Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  )
}
