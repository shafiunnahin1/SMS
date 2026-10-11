import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import Tabs from '../../ui/variants/Tabs'
import MathText from '../../features/qb/MathText'
import BuyButton from '../../features/qb/BuyButton'

// QB.5 /admin/question-bank and /teacher/question-bank (D65 §5): the platform's published concepts (by topic) and slides / books /
// PDFs (by subject, chapter or topic). A concept's body and a resource's file show only once the institution has it; otherwise the
// title, and for a resource its page count and preview pages. Buying comes with QB.7.
export default function QbLibrary() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [tab, setTab] = useState('questions')
  const [place, setPlace] = useState({ subject: '', chapter: '', topic: '' })
  const [open, setOpen] = useState(null)
  const tree = useQuery({ queryKey: ['qb-library', 'curriculum'], queryFn: () => api.get('/question-bank/curriculum').then(r => r.data.data) })
  const params = place.topic ? { qb_topic_id: place.topic } : place.chapter ? { qb_chapter_id: place.chapter } : place.subject ? { qb_subject_id: place.subject } : {}
  const list = useQuery({
    queryKey: ['qb-library', tab, params],
    queryFn: () => api.get(`/question-bank/${tab}`, { params }).then(r => r.data.data),
    enabled: tab !== 'concepts' || Boolean(place.topic),
  })
  const item = useQuery({ queryKey: ['qb-library', 'item', open], queryFn: () => api.get(`/question-bank/${open.kind}/${open.id}`).then(r => r.data.data), enabled: Boolean(open) })

  if (tree.isPending) return <Loader type="page" />
  if (tree.isError) return <ErrorState onRetry={tree.refetch} />
  const name = (n) => (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en
  const title = (x) => (locale === 'bn' ? x.title_bn : x.title_en) || x.title_bn
  const subject = tree.data.subjects.find(s => String(s.id) === place.subject)
  const chapter = subject?.chapters.find(c => String(c.id) === place.chapter)
  const pick = (next) => { setOpen(null); setPlace(next) }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-library">
      <PageHeader title={t('qb.library')} />
      <Card className="grid gap-3 sm:grid-cols-3">
        <Select label={t('qb.subject')} placeholder={t('qb.pick')} value={place.subject} name="subject"
          options={tree.data.subjects.map(s => ({ value: String(s.id), label: name(s) }))} onChange={e => pick({ subject: e.target.value, chapter: '', topic: '' })} />
        <Select label={t('qb.chapter')} placeholder={t('qb.pick')} value={place.chapter} name="chapter"
          options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} onChange={e => pick({ ...place, chapter: e.target.value, topic: '' })} />
        <Select label={t('qb.topic')} placeholder={t('qb.pick')} value={place.topic} name="topic"
          options={(chapter?.topics ?? []).map(tp => ({ value: String(tp.id), label: name(tp) }))} onChange={e => pick({ ...place, topic: e.target.value })} />
      </Card>
      <Tabs label={t('qb.library')} value={tab} onChange={(k) => { setOpen(null); setTab(k) }} items={[{ key: 'questions', label: t('qb.questions') }, { key: 'concepts', label: t('qb.concepts') }, { key: 'resources', label: t('qb.resources') }]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          {tab === 'concepts' && !place.topic ? <EmptyState title={t('qb.pick_topic')} />
            : list.isPending ? <Loader />
            : list.isError ? <ErrorState onRetry={list.refetch} />
            : list.data.length === 0 ? <EmptyState title={t(`qb.no_${tab}`)} />
            : (
              <ul className="flex flex-col divide-y" data-testid="qb-library-list">
                {list.data.map(x => (
                  <li key={x.id}>
                    <button type="button" onClick={() => setOpen({ kind: tab, id: x.id })} aria-current={open?.id === x.id ? 'true' : undefined}
                      className="w-full py-2 text-start flex flex-wrap items-center gap-2 hover:bg-surface-muted">
                      {!x.unlocked && <Lock aria-label={t('qb.locked')} className="h-4 w-4 text-content-muted" />}
                      <span dir="auto" className="font-medium line-clamp-2">{tab === 'questions' ? <MathText text={x.question_text} /> : title(x)}</span>
                      {x.kind && <span className="text-xs text-content-muted">{t(`qb.kinds.${x.kind}`)} · {t('qb.pages_n', { n: x.page_count ?? '—' })}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </Card>
        {open && (
          <Card className="flex flex-col gap-3" data-testid="qb-library-item" aria-live="polite">
            {item.isPending ? <Loader /> : item.isError ? <ErrorState onRetry={item.refetch} /> : <>
              {open.kind === 'questions' ? <QuestionView q={item.data} /> : <h2 className="text-lg font-semibold" dir="auto">{title(item.data)}</h2>}
              {open.kind === 'resources' && <p className="text-sm text-content-muted">{t(`qb.kinds.${item.data.kind}`)} · {t('qb.pages_n', { n: item.data.page_count ?? '—' })}</p>}
              {open.kind === 'questions' ? null : item.data.unlocked ? (open.kind === 'concepts'
                ? <><MathText text={item.data.body_text} />{(item.data.media ?? []).map(m => <img key={m.id} src={m.url} alt={t('qb.picture_n', { id: m.id })} className="max-h-48 w-auto self-start" />)}</>
                : item.data.file && <a href={item.data.file.url} target="_blank" rel="noopener noreferrer" className="underline self-start" data-testid="qb-open-file">{t('qb.open_pdf')}</a>)
                : <div className="flex flex-col gap-2"><p className="flex items-center gap-2 text-sm" role="status" data-testid="qb-locked"><Lock aria-hidden="true" className="h-4 w-4" />{t(`qb.locked_${open.kind}`)}</p>
                  <div><BuyButton type={open.kind === 'concepts' ? 'concept' : 'resource'} id={item.data.id} /></div></div>}
              {open.kind === 'resources' && (item.data.previews ?? []).length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="font-semibold">{t('qb.preview_pages')}</h3>
                  <ol className="flex flex-wrap gap-2">
                    {item.data.previews.map((m, i) => <li key={m.id}><img src={m.url} alt={t('qb.page_n', { n: i + 1 })} className="h-40 w-auto rounded-token [border:1px_solid_var(--line)]" /></li>)}
                  </ol>
                </section>
              )}
            </>}
          </Card>
        )}
      </div>
    </div>
  )
}

/** A question as a teacher sees it: options without the right one until bought; then the answer and the explanation */
function QuestionView({ q }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2" data-testid="qb-question-view">
      <MathText text={q.question_text} className="text-base" />
      {q.options.length > 0 && <ol className="flex flex-col gap-1">{q.options.map(o => (
        <li key={o.label} className="flex gap-2"><span className="font-medium">{o.label}.</span><MathText text={o.content_text} />{o.is_correct && <span className="text-xs text-content-muted">({t('qb.correct')})</span>}</li>
      ))}</ol>}
      {q.creative_parts.length > 0 && <ol className="flex flex-col gap-1">{q.creative_parts.map(p => <li key={p.part_label}><span className="font-medium">{p.part_label}.</span> <MathText text={p.question_text} /></li>)}</ol>}
      {q.unlocked ? <>
        {q.answer_text && <div className="text-sm" data-testid="qb-answer"><span className="font-medium">{t('qb.answer')}: </span><MathText text={q.answer_text} /></div>}
        {q.explanation_text && <div className="text-sm text-content-muted"><MathText text={q.explanation_text} /></div>}
      </> : <div>{q.quote?.price != null
        ? <BuyButton type="question" id={q.id} label={t('qbb.see_answer', { price: q.quote.price })} />
        : <p className="text-sm text-content-muted">{t('qbb.not_for_sale')}</p>}</div>}
    </div>
  )
}
