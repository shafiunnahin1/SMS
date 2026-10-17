import { CartesianGrid, Line, LineChart as RLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function LineChart({ data, xKey, yKey, title, color = 'var(--color-primary)', height = 240 }) {
  return (
    <figure className="flex flex-col gap-2">
      {title && <figcaption className="text-sm font-medium text-content">{title}</figcaption>}
      <div dir="ltr" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RLineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey={xKey} stroke="var(--text-muted)" fontSize={12} />
            <YAxis stroke="var(--text-muted)" fontSize={12} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={false} />
          </RLineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
