import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import Tabs from '../../ui/variants/Tabs'
import MathText from '../../features/qb/MathText'
import { fmtDate } from '../../i18n/format'

// QB.9 /student/question-bank (D65/D66 §5): the student's own class first; questions free to read, an answer or a concept bought
// by the student with bKash (the server prices it; the page sends only the item). Back from bKash, ?payment= says how it went.
export default function QbStudy() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('questions')
  const [place, setPlace] = useState({ subject: '', chapter: '', topic: '' })
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)
  const validity = useQuery({ queryKey: ['qb-study', 'validity'], queryFn: () => api.get('/student/qb/validity').then(r => r.data.data) })   // D165 ST.2
  const tree = useQuery({ queryKey: ['qb-study', 'curriculum'], queryFn: () => api.get('/student/qb/curriculum').then(r => r.data.data) })
  const q = place.topic ? { qb_topic_id: place.topic } : place.chapter ? { qb_chapter_id: place.chapter } : place.subject ? { qb_subject_id: place.subject } : {}
  const list = useQuery({ queryKey: ['qb-study', tab, q], queryFn: () => api.get(`/student/qb/${tab}`, { params: q }).then(r => r.data.data), enabled: tab === 'questions' || Boolean(place.topic) })
  const item = useQuery({ queryKey: ['qb-study', 'item', open], queryFn: () => api.get(`/student/qb/${open.kind}/${open.id}`).then(r => r.data.data), enabled: Boolean(open) })

  useEffect(() => {                                          // back from bKash
    const result = params.get('payment')
    if (!result) return
    useUiStore.getState().addToast(t(`qbst.payment.${result}`, { defaultValue: t('qbst.payment.failed') }), result === 'success' ? 'success' : 'error')
    setParams({}, { replace: true })
  }, [params, setParams, t])

  if (tree.isPending) return <Loader type="page" />
  if (tree.isError) return <ErrorState onRetry={tree.refetch} />
  const name = (n) => (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en
  const mine = tree.data.my_class_level_id
  const subjects = [...tree.data.subjects].sort((a, b) => Number(b.class_level_ids.includes(mine)) - Number(a.class_level_ids.includes(mine)))
  const subject = subjects.find(s => String(s.id) === place.subject)
  const chapter = subject?.chapters.find(c => String(c.id) === place.chapter)
  const pick = (next) => { setOpen(null); setPlace(next) }

  const buy = async (kind, id) => {
    setBusy(true)
    try {
      const { data } = await api.post('/student/qb/orders', { items: [{ item_type: kind === 'questions' ? 'question' : 'concept', item_id: id }] })
      if (data.data.paid) { useUiStore.getState().addToast(t('qbst.opened')); item.refetch(); list.refetch(); return }
      window.location.assign(data.data.bkash_url)              // bKash's page; it sends the student back here
    } catch (e) {
      useUiStore.getState().addToast(e.response?.data?.message ?? t('qbst.payment.failed'), 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-study">
      <PageHeader title={t('qbst.title')} />
      {validity.data && (   // D165 (3): how long a purchase made today lasts, before paying
        <p className={`text-sm ${validity.data.days_left < 30 ? 'font-semibold' : 'text-content-muted'}`} data-testid="qb-validity" role="note">
          {t('qbst.validity', { date: fmtDate(validity.data.expires_at, locale) })}{validity.data.days_left < 30 ? ` ${t('qbst.validity_short', { n: validity.data.days_left })}` : ''}
        </p>)}
      <Card className="grid gap-3 sm:grid-cols-3">
        <Select label={t('qb.subject')} placeholder={t('qb.pick')} value={place.subject} name="subject"
          options={subjects.map(s => ({ value: String(s.id), label: name(s) + (s.class_level_ids.includes(mine) ? ` ★` : '') }))} onChange={e => pick({ subject: e.target.value, chapter: '', topic: '' })} />
        <Select label={t('qb.chapter')} placeholder={t('qb.pick')} value={place.chapter} name="chapter"
          options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} onChange={e => pick({ ...place, chapter: e.target.value, topic: '' })} />
        <Select label={t('qb.topic')} placeholder={t('qb.pick')} value={place.topic} name="topic"
          options={(chapter?.topics ?? []).map(tp => ({ value: String(tp.id), label: name(tp) }))} onChange={e => pick({ ...place, topic: e.target.value })} />
      </Card>
      <Tabs label={t('qbst.title')} value={tab} onChange={(k) => { setOpen(null); setTab(k) }} items={[{ key: 'questions', label: t('qb.questions') }, { key: 'concepts', label: t('qb.concepts') }]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          {tab === 'concepts' && !place.topic ? <EmptyState title={t('qb.pick_topic')} />
            : list.isPending ? <Loader /> : list.isError ? <ErrorState onRetry={list.refetch} />
            : list.data.length === 0 ? <EmptyState title={t(tab === 'questions' ? 'qb.no_questions' : 'qb.no_concepts')} />
            : (
              <ul className="flex flex-col divide-y" data-testid="qb-study-list">
                {list.data.map(x => (
                  <li key={x.id}>
                    <button type="button" onClick={() => setOpen({ kind: tab, id: x.id })} className="w-full py-2 text-start flex items-center gap-2 hover:bg-surface-muted">
                      {!x.unlocked && <Lock aria-label={t('qb.locked')} className="h-4 w-4 text-content-muted" />}
                      <span dir="auto" className="line-clamp-2"><MathText text={tab === 'questions' ? x.question_text : (locale === 'bn' ? x.title_bn : x.title_en) || x.title_bn} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </Card>
        {open && (
          <Card className="flex flex-col gap-3" data-testid="qb-study-item" aria-live="polite">
            {item.isPending ? <Loader /> : item.isError ? <ErrorState onRetry={item.refetch} /> : <>
              {open.kind === 'questions' ? <>
                <MathText text={item.data.question_text} className="text-base" />
                {item.data.options.length > 0 && <ol className="flex flex-col gap-1">{item.data.options.map(o => (
                  <li key={o.label} className="flex gap-2"><span className="font-medium">{o.label}.</span><MathText text={o.content_text} />{o.is_correct && <span className="text-xs text-content-muted">({t('qb.correct')})</span>}</li>))}</ol>}
                {item.data.unlocked && item.data.answer_text && <div className="text-sm" data-testid="qb-answer"><span className="font-medium">{t('qb.answer')}: </span><MathText text={item.data.answer_text} /></div>}
                {item.data.unlocked && item.data.explanation_text && <div className="text-sm text-content-muted"><MathText text={item.data.explanation_text} /></div>}
              </> : <>
                <h2 className="text-lg font-semibold" dir="auto">{item.data.title_bn}</h2>
                {item.data.unlocked && <MathText text={item.data.body_text} />}
              </>}
              {!item.data.unlocked && (item.data.price != null
                ? <div><Button onClick={() => buy(open.kind, open.id)} loading={busy} data-action="buy">{t(open.kind === 'questions' ? 'qbb.see_answer' : 'qbst.buy_concept', { price: item.data.price })}</Button></div>
                : <p className="text-sm text-content-muted">{t('qbb.not_for_sale')}</p>)}
            </>}
          </Card>
        )}
      </div>
    </div>
  )
}
