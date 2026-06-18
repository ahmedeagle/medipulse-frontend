import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'

export interface TrendPoint {
  label: string
  [key: string]: string | number
}

export interface TrendSeries {
  key: string
  label: string
  type: 'bar' | 'line'
  color: string
  /** set true to bind this series to the right Y-axis */
  rightAxis?: boolean
}

interface Props {
  data: TrendPoint[]
  series: TrendSeries[]
  yLabel?: string
}

function fmtTick(label: string): string {
  const d = new Date(label)
  if (isNaN(d.getTime())) return label.length > 10 ? label.slice(0, 10) : label
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`
  if (n >= 1_000)     return `${(n / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}K`
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function TrendView({ data, series, yLabel }: Props) {
  if (!data.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
        لا توجد بيانات كافية لعرض الاتجاه
      </div>
    )
  }

  // Stats — driven by the first bar series (primary metric)
  const primary = series.find(s => s.type === 'bar') ?? series[0]
  const vals    = data.map(d => Number(d[primary.key] ?? 0))
  const total   = vals.reduce((a, b) => a + b, 0)
  const avg     = total / vals.length
  const peak    = Math.max(...vals)
  const peakIdx = vals.indexOf(peak)
  const peakLabel = fmtTick(data[peakIdx]?.label ?? '')

  const hasRightAxis = series.some(s => s.rightAxis)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Stats header */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-5 py-3 text-center">
          <p className="text-[10px] text-gray-400 font-medium mb-0.5">الإجمالي</p>
          <p className="text-base font-bold text-gray-900">{fmtNum(total)}</p>
        </div>
        <div className="px-5 py-3 text-center">
          <p className="text-[10px] text-gray-400 font-medium mb-0.5">المتوسط اليومي</p>
          <p className="text-base font-bold text-gray-900">{fmtNum(avg)}</p>
        </div>
        <div className="px-5 py-3 text-center">
          <p className="text-[10px] text-gray-400 font-medium mb-0.5">أعلى يوم</p>
          <p className="text-base font-bold text-teal-700">{fmtNum(peak)}</p>
          <p className="text-[10px] text-gray-400">{peakLabel}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4 pt-5">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 4, right: hasRightAxis ? 48 : 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="label"
              tickFormatter={fmtTick}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={fmtNum}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#d1d5db' } } : undefined}
            />
            {hasRightAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={fmtNum}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
            )}
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12, direction: 'rtl' }}
              formatter={(value: number, name: string) => [
                value.toLocaleString('en-US', { maximumFractionDigits: 2 }),
                name,
              ]}
              labelFormatter={fmtTick}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <ReferenceLine
              yAxisId="left"
              y={avg}
              stroke="#d1d5db"
              strokeDasharray="5 3"
              label={{ value: 'متوسط', position: 'insideTopRight', fontSize: 10, fill: '#9ca3af' }}
            />
            {series.map(s =>
              s.type === 'bar' ? (
                <Bar
                  key={s.key}
                  yAxisId={s.rightAxis ? 'right' : 'left'}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  fillOpacity={0.85}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              ) : (
                <Line
                  key={s.key}
                  yAxisId={s.rightAxis ? 'right' : 'left'}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: s.color }}
                  activeDot={{ r: 5 }}
                />
              )
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
