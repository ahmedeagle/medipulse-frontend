import { useMemo } from 'react'

export interface PricePoint {
  date: string
  price: number
  currency?: string
  stockAtTime?: number | null
}

interface Props {
  points: PricePoint[]
  width?: number
  height?: number
  currency?: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
}

function formatPrice(n: number, currency = 'EGP'): string {
  return `${n.toLocaleString('ar-EG', { maximumFractionDigits: 1 })} ${currency}`
}

function pctChange(first: number, last: number): number {
  if (first === 0) return 0
  return Math.round(((last - first) / first) * 100)
}

export function PriceMiniChart({ points, width = 220, height = 60, currency = 'EGP' }: Props) {
  const { pathD, areaD, dotX, dotY, minY, maxY, firstDate, lastDate } = useMemo(() => {
    if (points.length < 2) return { pathD: '', areaD: '', dotX: 0, dotY: 0, minY: 0, maxY: 0, firstDate: '', lastDate: '' }

    const prices = points.map(p => p.price)
    const minP = Math.min(...prices)
    const maxP = Math.max(...prices)
    const rangeP = maxP - minP || 1

    const padX = 8
    const padY = 6
    const usableW = width - padX * 2
    const usableH = height - padY * 2

    const toX = (i: number) => padX + (i / (points.length - 1)) * usableW
    const toY = (p: number) => padY + usableH - ((p - minP) / rangeP) * usableH

    const coords = points.map((pt, i) => ({ x: toX(i), y: toY(pt.price) }))
    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
    const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - padY).toFixed(1)} L ${padX} ${(height - padY).toFixed(1)} Z`

    const last = coords[coords.length - 1]
    return {
      pathD,
      areaD,
      dotX: last.x,
      dotY: last.y,
      minY: minP,
      maxY: maxP,
      firstDate: formatDate(points[0].date),
      lastDate: formatDate(points[points.length - 1].date),
    }
  }, [points, width, height])

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-16 rounded-lg bg-gray-50 border border-gray-100">
        <p className="text-[11px] text-gray-400">لا توجد بيانات أسعار كافية</p>
      </div>
    )
  }

  const first = points[0].price
  const last = points[points.length - 1].price
  const pct = pctChange(first, last)
  const isUp = pct >= 0
  const trendColor = isUp ? '#f59e0b' : '#10b981'
  const trendText = isUp
    ? `ارتفع السعر ${pct}% خلال هذه الفترة`
    : `انخفض السعر ${Math.abs(pct)}% خلال هذه الفترة`

  return (
    <div className="space-y-1.5">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ maxWidth: width }}
      >
        <defs>
          <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path d={areaD} fill="url(#price-fill)" />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={trendColor}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dot at latest price */}
        <circle cx={dotX} cy={dotY} r="3.5" fill={trendColor} />
        <circle cx={dotX} cy={dotY} r="6" fill={trendColor} fillOpacity="0.2" />

        {/* Min/max labels */}
        <text x={8} y={height - 2} fontSize="8" fill="#9ca3af">{formatPrice(minY, currency)}</text>
        <text x={8} y={10} fontSize="8" fill="#9ca3af">{formatPrice(maxY, currency)}</text>

        {/* Date range */}
        <text x={8} y={height / 2 + 3} fontSize="8" fill="#d1d5db" textAnchor="start">{firstDate}</text>
        <text x={width - 8} y={height / 2 + 3} fontSize="8" fill="#d1d5db" textAnchor="end">{lastDate}</text>
      </svg>

      {/* Trend insight */}
      <p className={`text-[10px] font-medium ${isUp ? 'text-amber-600' : 'text-emerald-600'}`}>
        {isUp ? '↑' : '↓'} {trendText}
      </p>
    </div>
  )
}

/** Skeleton shown while fetching */
export function PriceMiniChartSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="flex items-end gap-1 h-14">
        {[40, 55, 35, 65, 50, 70, 60, 75, 58, 80].map((h, i) => (
          <div key={i} className="flex-1 bg-gray-200 rounded-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="h-2.5 bg-gray-200 rounded w-3/4" />
    </div>
  )
}
