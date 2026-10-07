import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

// Present / absent / late style ratios. Each slice may name its status tone; the legend shows names, so colour is never the only cue.
const TONES = ['var(--status-success)', 'var(--status-danger)', 'var(--status-warning)', 'var(--status-info)', 'var(--status-muted)']
export default function DonutChart({ data, title, height = 220 }) {
  return (
    <figure className="flex flex-col gap-2">
      {title && <figcaption className="text-sm font-medium text-content">{title}</figcaption>}
      <div dir="ltr" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
              {data.map((d, i) => <Cell key={d.name} fill={d.tone ? `var(--status-${d.tone})` : TONES[i % TONES.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
