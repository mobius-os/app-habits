// Recharts wrappers for the detail screen: the strength Score curve (gradient
// area) and the monthly History bars. recharts is a bare-specifier importmap lib.

import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export function ScoreChart({ data, color, gradId = 'hbScoreFill' }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[0, 100]} />
        <XAxis dataKey="label" hide />
        <Tooltip
          formatter={(v) => [`${Math.round(v)}%`, 'Strength']}
          labelFormatter={(l) => l}
          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
        />
        <Area type="monotone" dataKey="pct" stroke={color} strokeWidth={2.5} fill={`url(#${gradId})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HistoryBars({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval={0} />
        <Tooltip
          cursor={{ fill: 'rgba(125,125,125,0.12)' }}
          formatter={(v) => [v, 'Days']}
          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
        />
        <Bar dataKey="count" radius={[5, 5, 0, 0]} fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}
