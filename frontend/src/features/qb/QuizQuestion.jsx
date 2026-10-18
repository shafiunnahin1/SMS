import { plainText } from './richText'
import { useTranslation } from 'react-i18next'
import MathText from './MathText'

const field = 'w-full h-10 rounded-token bg-surface text-content px-3 [border:1px_solid_var(--line)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg'

// QB.10: one quiz question as the student answers it - the public shape (never an answer). mcq / true-false: pick an option
// label; matching: pick a right side for each left item; gaps: one text per gap item; a plain fill-in-the-gap: one text.
// `value` is what the server marks (a label, a text, or a list in item order).
export default function QuizQuestion({ q, n, value, onChange, disabled = false }) {
  const { t } = useTranslation()
  const items = q.items ?? []
  const list = Array.isArray(value) ? value : []
  const setAt = (i, v) => { const next = items.map((_, k) => list[k] ?? ''); next[i] = v; onChange(next) }
  return (
    <fieldset className="flex flex-col gap-2" data-testid="quiz-question" data-question={q.id} disabled={disabled}>
      <legend className="flex gap-2 font-medium"><span>{n}.</span><MathText text={q.question_text} /></legend>
      {q.options?.length > 0 ? (
        <div className="flex flex-col gap-1">
          {q.options.map(o => (
            <label key={o.label} className="flex items-center gap-2 rounded-token px-2 py-1 hover:bg-surface-muted">
              <input type="radio" name={`q-${q.id}`} value={o.label} checked={value === o.label} onChange={() => onChange(o.label)} />
              <span className="font-medium">{o.label}.</span><MathText text={o.content_text} />
            </label>
          ))}
        </div>
      ) : items.length > 0 && items.every(it => it.item_type === 'match_pair') ? (
        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <label key={i} className="grid grid-cols-2 items-center gap-2">
              <MathText text={it.prompt_text} />
              <select className={field} value={list[i] ?? ''} onChange={e => setAt(i, e.target.value)} aria-label={plainText(it.prompt_text)}>
                <option value="">{t('qb.pick')}</option>
                {(q.choices ?? []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <label key={i} className="flex flex-col gap-1 text-sm">
              <span>{t('qbz.gap', { n: i + 1 })}{it.prompt_text ? ` — ${plainText(it.prompt_text)}` : ''}</span>
              <input className={field} dir="auto" value={list[i] ?? ''} onChange={e => setAt(i, e.target.value)} />
            </label>
          ))}
        </div>
      ) : (
        <input className={field} dir="auto" aria-label={t('qbz.your_answer')} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} />
      )}
    </fieldset>
  )
}
