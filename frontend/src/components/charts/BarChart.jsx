import { Bar, BarChart as RBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// docs/design/component-library.md "charts/BarChart" (recharts). Colours are CSS variables, so the chart follows the theme and dark mode.
// The container stays dir="ltr" so time runs left to right in every language (I18N.md section 3.3).
export default function BarChart({ data, xKey, yKey, title, color = 'var(--color-primary)', height = 240 }) {
  return (
    <figure className="flex flex-col gap-2">
      {title && <figcaption className="text-sm font-medium text-content">{title}</figcaption>}
      <div dir="ltr" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RBarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey={xKey} stroke="var(--text-muted)" fontSize={12} />
            <YAxis stroke="var(--text-muted)" fontSize={12} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
          </RBarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
