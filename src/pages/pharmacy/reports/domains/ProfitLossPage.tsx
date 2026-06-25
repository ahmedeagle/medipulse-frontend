import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Download, RefreshCw, ArrowUpRight, ArrowDownRight,
  ChevronUp, ChevronDown, Bookmark, BarChart2, Percent, SlidersHorizontal,
} from 'lucide-react'
import { useColState } from '../../../../hooks/useColState'
import { ColPicker, type ColDef } from '../../../../components/reports/ColPicker'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { analyticsApi, type SalesSummaryRow } from '../../../../api/analytics.api'
import { DomainShell } from '../components/DomainShell'
import { useCurrency } from '../../../../hooks/useCurrency'
import { downloadCsv } from '../../../../utils/export'

// ── Constants ─────────────────────────────────────────────────────────────────

const AR_MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
]

function monthLabel(row: SalesSummaryRow): string {
  if (row.monthNumber) return AR_MONTHS[row.monthNumber - 1] ?? row.period
  const m = parseInt(row.period.split('-')[1] ?? '0', 10)
  return AR_MONTHS[m - 1] ?? row.period
}

type ColKey = 'month' | 'totalSales' | 'salesBeforeDiscount' | 'totalDiscounts' | 'totalReturns' |
              'netSales' | 'cogs' | 'grossMargin' | 'grossMarginPct' |
              'invoiceCount' | 'avgInvoice'

const ALL_COLS: ColDef[] = [
  { key: 'month',               label: 'الشهر',                          group: 'أساسي' },
  { key: 'totalSales',          label: 'إجمالي المبيعات',                 group: 'مبيعات' },
  { key: 'salesBeforeDiscount', label: 'المبيعات قبل الخصومات',           group: 'مبيعات' },
  { key: 'totalDiscounts',      label: 'قيمة الخصومات',                  group: 'مبيعات' },
  { key: 'totalReturns',        label: 'قيمة المرتجعات',                  group: 'مبيعات' },
  { key: 'netSales',            label: 'صافي الإيرادات',                  group: 'مبيعات' },
  { key: 'cogs',                label: 'إجمالي قيمة التكلفة',             group: 'ربحية' },
  { key: 'grossMargin',         label: 'إجمالي الربح',                    group: 'ربحية' },
  { key: 'grossMarginPct',      label: 'نسبة هامش الربح الإجمالي',        group: 'ربحية' },
  { key: 'invoiceCount',        label: 'عدد الفواتير',                    group: 'فواتير' },
  { key: 'avgInvoice',          label: 'متوسط قيمة الفاتورة',             group: 'فواتير' },
]

// ── Helper components ──────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronUp size={11} className="text-gray-300" />
  return dir === 'asc'
    ? <ChevronUp size={11} className="text-emerald-600" />
    : <ChevronDown size={11} className="text-emerald-600" />
}

function DeltaBadge({ delta, invert = false }: { delta: number; invert?: boolean }) {
  if (Math.abs(delta) < 0.1) return <span className="text-xs text-gray-400">—</span>
  const good = invert ? delta < 0 : delta > 0
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${good ? 'text-emerald-600' : 'text-red-500'}`}>
      <Icon size={12} />
      {Math.abs(delta).toFixed(1)}%
    </span>
  )
}

function KpiCard({
  label, value, prior, formatFn, icon: Icon, accent, invert = false,
}: {
  label: string; value: number; prior: number; formatFn: (n: number) => string
  icon: React.ElementType; accent: string; invert?: boolean
}) {
  const delta = prior > 0 ? ((value - prior) / prior) * 100 : 0
  return (
    <div className={`bg-white rounded-2xl p-4 border border-gray-100 border-l-4 ${accent} shadow-sm flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <Icon size={14} className="text-gray-400" />
      </div>
      <p className="text-xl font-bold text-gray-900 leading-none">{formatFn(value)}</p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10px] text-gray-400">مقارنةً بالعام السابق</span>
        <DeltaBadge delta={delta} invert={invert} />
      </div>
    </div>
  )
}

// P&L Statement cascade row
function PlRow({
  label, value, fmt, indent = false, type = 'normal',
}: {
  label: string; value: number; fmt: (n: number) => string
  indent?: boolean; type?: 'revenue' | 'cost' | 'profit' | 'normal' | 'pct'
}) {
  const isNegative = value < 0 || type === 'cost'
  const valueStr = type === 'pct'
    ? `${value.toFixed(1)}%`
    : isNegative ? `(${fmt(Math.abs(value))})` : fmt(value)

  return (
    <div className={`flex items-center justify-between py-2 ${indent ? 'pr-5' : ''} ${
      type === 'profit' ? 'border-t border-gray-200 mt-1 pt-3' :
      type === 'revenue' ? 'border-b border-gray-100' : ''
    }`}>
      <span className={`text-sm ${
        type === 'profit' ? 'font-bold text-gray-900' :
        indent ? 'text-gray-500 text-xs' :
        'font-medium text-gray-700'
      }`}>{label}</span>
      <span className={`text-sm tabular-nums ${
        type === 'profit' && value > 0 ? 'font-bold text-emerald-700' :
        type === 'profit' && value <= 0 ? 'font-bold text-red-600' :
        type === 'pct' && value >= 20 ? 'font-semibold text-emerald-600' :
        type === 'pct' && value >= 10 ? 'font-semibold text-amber-600' :
        type === 'pct' ? 'font-semibold text-red-500' :
        type === 'cost' || isNegative ? 'text-red-600 font-medium' :
        'font-semibold text-gray-800'
      }`}>{valueStr}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfitLossPage() {
  const { fmt } = useCurrency()
  const fmtN = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  const now = new Date()
  const currentYear = now.getFullYear()
  const YEARS = [currentYear - 2, currentYear - 1, currentYear].filter(y => y >= 2023)

  const [year,          setYear]          = useState(currentYear)
  const [sortKey,       setSortKey]       = useState<ColKey>('month')
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('asc')
  const [colPickerOpen, setColPickerOpen] = useState(false)

  const { visible: visibleCols, order: colOrder, displayCols, toggleCol, setOrder, reset: resetCols } =
    useColState(ALL_COLS, 'profitLoss')

  const dateFrom = `${year}-01-01`
  const dateTo   = `${year}-12-31`
  const priorFrom = `${year - 1}-01-01`
  const priorTo   = `${year - 1}-12-31`

  const { data: currData, isLoading, refetch } = useQuery({
    queryKey: ['pnl-report', year],
    queryFn: () => analyticsApi.getSalesSummary({ granularity: 'monthly', dateFrom, dateTo, pageSize: 12 }),
    staleTime: 5 * 60_000,
  })

  const { data: priorData } = useQuery({
    queryKey: ['pnl-report-prior', year - 1],
    queryFn: () => analyticsApi.getSalesSummary({ granularity: 'monthly', dateFrom: priorFrom, dateTo: priorTo, pageSize: 12 }),
    staleTime: 10 * 60_000,
  })

  const rows      = currData?.data  ?? []
  const priorRows = priorData?.data ?? []

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    totalSales:          acc.totalSales          + r.totalSales,
    salesBeforeDiscount: acc.salesBeforeDiscount + r.salesBeforeDiscount,
    totalDiscounts:      acc.totalDiscounts      + r.totalDiscounts,
    totalReturns:        acc.totalReturns        + r.totalReturns,
    netSales:            acc.netSales            + r.netSales,
    cogs:                acc.cogs                + r.cogs,
    grossMargin:         acc.grossMargin         + r.grossMargin,
    invoiceCount:        acc.invoiceCount        + r.invoiceCount,
  }), { totalSales: 0, salesBeforeDiscount: 0, totalDiscounts: 0, totalReturns: 0, netSales: 0, cogs: 0, grossMargin: 0, invoiceCount: 0 }), [rows])

  const priorTotals = useMemo(() => priorRows.reduce((acc, r) => ({
    totalSales: acc.totalSales + r.totalSales, netSales: acc.netSales + r.netSales,
    cogs: acc.cogs + r.cogs, grossMargin: acc.grossMargin + r.grossMargin,
    invoiceCount: acc.invoiceCount + r.invoiceCount,
  }), { totalSales: 0, netSales: 0, cogs: 0, grossMargin: 0, invoiceCount: 0 }), [priorRows])

  const marginPct = totals.netSales > 0 ? (totals.grossMargin / totals.netSales) * 100 : 0
  const avgInvoice = totals.invoiceCount > 0 ? totals.netSales / totals.invoiceCount : 0

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let av: number | string, bv: number | string
      switch (sortKey) {
        case 'month':               av = a.monthNumber ?? 0;        bv = b.monthNumber ?? 0;        break
        case 'totalSales':          av = a.totalSales;               bv = b.totalSales;               break
        case 'salesBeforeDiscount': av = a.salesBeforeDiscount;      bv = b.salesBeforeDiscount;      break
        case 'totalDiscounts':      av = a.totalDiscounts;           bv = b.totalDiscounts;           break
        case 'totalReturns':        av = a.totalReturns;             bv = b.totalReturns;             break
        case 'netSales':            av = a.netSales;                 bv = b.netSales;                 break
        case 'cogs':                av = a.cogs;                     bv = b.cogs;                     break
        case 'grossMargin':         av = a.grossMargin;              bv = b.grossMargin;              break
        case 'grossMarginPct':      av = a.grossMarginPct;           bv = b.grossMarginPct;           break
        case 'invoiceCount':        av = a.invoiceCount;             bv = b.invoiceCount;             break
        case 'avgInvoice':          av = a.avgInvoice;               bv = b.avgInvoice;               break
        default: av = 0; bv = 0
      }
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [rows, sortKey, sortDir])

  function toggleSort(key: ColKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'month' ? 'asc' : 'desc') }
  }

  function fmtCell(row: SalesSummaryRow, key: ColKey): string {
    const rowAvg = row.invoiceCount > 0 ? row.netSales / row.invoiceCount : 0
    switch (key) {
      case 'month':               return monthLabel(row)
      case 'totalSales':          return fmt(row.totalSales)
      case 'salesBeforeDiscount': return fmt(row.salesBeforeDiscount)
      case 'totalDiscounts':      return fmt(row.totalDiscounts)
      case 'totalReturns':        return fmt(row.totalReturns)
      case 'netSales':            return fmt(row.netSales)
      case 'cogs':                return fmt(row.cogs)
      case 'grossMargin':         return fmt(row.grossMargin)
      case 'grossMarginPct':      return `${row.grossMarginPct.toFixed(1)}%`
      case 'invoiceCount':        return fmtN(row.invoiceCount)
      case 'avgInvoice':          return fmt(rowAvg)
    }
  }

  function fmtTotal(key: ColKey): string {
    const totalAvg = totals.invoiceCount > 0 ? totals.netSales / totals.invoiceCount : 0
    switch (key) {
      case 'month':               return 'إجمالي السنة'
      case 'totalSales':          return fmt(totals.totalSales)
      case 'salesBeforeDiscount': return fmt(totals.salesBeforeDiscount)
      case 'totalDiscounts':      return fmt(totals.totalDiscounts)
      case 'totalReturns':        return fmt(totals.totalReturns)
      case 'netSales':            return fmt(totals.netSales)
      case 'cogs':                return fmt(totals.cogs)
      case 'grossMargin':         return fmt(totals.grossMargin)
      case 'grossMarginPct':      return `${marginPct.toFixed(1)}%`
      case 'invoiceCount':        return fmtN(totals.invoiceCount)
      case 'avgInvoice':          return fmt(totalAvg)
    }
  }

  function handleExport() {
    const headers = displayCols.map(c => c.label)
    const data = sortedRows.map(r => displayCols.map(c => fmtCell(r, c.key as ColKey)))
    data.push(displayCols.map(c => fmtTotal(c.key as ColKey)))
    downloadCsv(`profit-loss-${year}.csv`, headers, data)
  }

  const chartData = sortedRows.map(r => ({
    name: monthLabel(r),
    'صافي الإيرادات': r.netSales,
    'تكلفة البضاعة':   r.cogs,
    'إجمالي الربح':    r.grossMargin,
    'هامش %': r.grossMarginPct,
  }))

  return (
    <DomainShell
      icon={TrendingUp} iconColor="text-emerald-700" iconBg="bg-emerald-50"
      title="تقرير الأرباح والخسائر"
      subtitle="ملخص للإيرادات والتكاليف وصافي الربح — مقارنةً بالعام السابق مع تحليل الهامش الشهري"
    >
    <div className="space-y-5 pb-8">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">السنة المالية:</span>
          <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
            {YEARS.map(y => (
              <button key={y} onClick={() => setYear(y)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  y === year ? 'bg-white text-emerald-700 shadow font-bold' : 'text-gray-500 hover:text-gray-700'
                }`}>{y}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
            <RefreshCw size={12} /> تحديث
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-500 cursor-not-allowed opacity-60"
            disabled title="قريباً">
            <Bookmark size={12} /> حفظ التقرير المخصص
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all">
            <Download size={13} /> تنزيل
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-gray-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="صافي الإيرادات"    value={totals.netSales}    prior={priorTotals.netSales}    formatFn={fmt}  icon={DollarSign}   accent="border-l-emerald-400" />
            <KpiCard label="إجمالي الربح"       value={totals.grossMargin} prior={priorTotals.grossMargin} formatFn={fmt}  icon={TrendingUp}   accent="border-l-violet-400" />
            <KpiCard label="تكلفة البضاعة المباعة" value={totals.cogs}    prior={priorTotals.cogs}       formatFn={fmt}  icon={TrendingDown}  accent="border-l-rose-400" invert />
            <KpiCard label="عدد الفواتير"       value={totals.invoiceCount} prior={priorTotals.invoiceCount} formatFn={fmtN} icon={ShoppingCart} accent="border-l-indigo-400" />
          </div>

          {/* ── P&L Statement + Margin card ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Income Statement */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={16} className="text-emerald-600" />
                <h3 className="text-sm font-semibold text-gray-700">قائمة الدخل — {year}</h3>
                <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full mr-auto">{rows.length} شهر</span>
              </div>
              <PlRow label="إجمالي المبيعات"          value={totals.totalSales}     fmt={fmt} type="revenue" />
              <PlRow label="— خصم الخصومات"            value={-totals.totalDiscounts} fmt={fmt} indent type="cost" />
              <PlRow label="— خصم المرتجعات"           value={-totals.totalReturns}   fmt={fmt} indent type="cost" />
              <PlRow label="صافي الإيرادات"            value={totals.netSales}       fmt={fmt} />
              <PlRow label="— تكلفة البضاعة المباعة"  value={-totals.cogs}           fmt={fmt} indent type="cost" />
              <PlRow label="إجمالي الربح (Gross Profit)" value={totals.grossMargin}  fmt={fmt} type="profit" />
              <PlRow label="نسبة هامش الربح الإجمالي"  value={marginPct}             fmt={fmt} type="pct" />
            </div>

            {/* Margin gauge */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col items-center justify-center gap-3">
              <Percent size={20} className={marginPct >= 20 ? 'text-emerald-600' : marginPct >= 10 ? 'text-amber-500' : 'text-red-500'} />
              <p className="text-xs font-semibold text-gray-500 text-center">هامش الربح الإجمالي</p>
              <p className={`text-4xl font-black tabular-nums ${
                marginPct >= 20 ? 'text-emerald-700' : marginPct >= 10 ? 'text-amber-600' : 'text-red-600'
              }`}>{marginPct.toFixed(1)}%</p>
              <p className="text-xs text-gray-400 text-center">
                {marginPct >= 20 ? 'هامش ممتاز ✓' : marginPct >= 10 ? 'هامش مقبول — يمكن تحسينه' : 'هامش منخفض — يحتاج مراجعة'}
              </p>
              <div className="w-full bg-gray-100 rounded-full h-2.5 mt-1">
                <div className={`h-2.5 rounded-full transition-all ${
                  marginPct >= 20 ? 'bg-emerald-500' : marginPct >= 10 ? 'bg-amber-400' : 'bg-red-500'
                }`} style={{ width: `${Math.min(100, marginPct * 2)}%` }} />
              </div>
              <div className="flex justify-between w-full text-[10px] text-gray-400 px-0.5">
                <span>0%</span><span>25%</span><span>50%</span>
              </div>
              <div className="border-t border-gray-100 pt-3 w-full mt-1 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">متوسط الفاتورة</span>
                  <span className="font-semibold text-gray-800">{fmt(avgInvoice)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">العام السابق</span>
                  <span className="font-medium text-gray-500">
                    {priorTotals.netSales > 0 ? `${((priorTotals.grossMargin / priorTotals.netSales) * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Monthly chart ── */}
          {chartData.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <TrendingUp size={15} className="text-emerald-600" />
                الأداء المالي الشهري — {year}
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 48, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tickFormatter={n => `${(n / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={n => `${n}%`} tick={{ fontSize: 11 }} domain={[0, 60]} />
                  <Tooltip
                    formatter={(val: number, name: string) =>
                      name === 'هامش %' ? [`${val.toFixed(1)}%`, name] : [fmt(val), name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="صافي الإيرادات" fill="#10b981" radius={[4,4,0,0]} />
                  <Bar yAxisId="left" dataKey="تكلفة البضاعة"   fill="#f43f5e" radius={[4,4,0,0]} />
                  <Line yAxisId="right" dataKey="هامش %" type="monotone" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Monthly table ── */}
          {rows.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-gray-700">تفاصيل شهرية — {year}</h3>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{rows.length} شهر</span>
                </div>
                <div className="relative">
                  <button onClick={() => setColPickerOpen(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      colPickerOpen ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    <SlidersHorizontal size={13} />
                    الأعمدة
                    {visibleCols.size < ALL_COLS.length && (
                      <span className="bg-emerald-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                        {ALL_COLS.length - visibleCols.size}
                      </span>
                    )}
                  </button>
                  {colPickerOpen && (
                    <ColPicker
                      allCols={ALL_COLS}
                      visible={visibleCols}
                      order={colOrder}
                      onToggle={toggleCol}
                      onReorder={setOrder}
                      onReset={resetCols}
                      onClose={() => setColPickerOpen(false)}
                      checkboxBg="bg-emerald-600"
                    />
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" dir="rtl">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {displayCols.map(col => (
                        <th key={col.key} onClick={() => toggleSort(col.key as ColKey)}
                          className="px-3 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none">
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            <SortIcon active={sortKey === col.key} dir={sortDir} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row, i) => (
                      <tr key={row.period}
                        className={`border-t border-gray-50 hover:bg-emerald-50/20 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                        {displayCols.map(col => (
                          <td key={col.key}
                            className={`px-3 py-2.5 text-right whitespace-nowrap text-xs ${
                              col.key === 'month'          ? 'font-semibold text-gray-800' :
                              col.key === 'grossMargin'    ? 'font-bold text-emerald-700' :
                              col.key === 'grossMarginPct' ? (
                                row.grossMarginPct >= 20 ? 'font-bold text-emerald-700' :
                                row.grossMarginPct >= 10 ? 'font-bold text-amber-600' : 'font-bold text-red-600'
                              ) :
                              col.key === 'cogs'           ? 'font-medium text-rose-700' :
                              col.key === 'totalReturns' || col.key === 'totalDiscounts' ? 'font-medium text-gray-500' :
                              col.key === 'netSales'       ? 'font-bold text-gray-900' :
                              'font-medium text-gray-700'
                            }`}>
                            {fmtCell(row, col.key as ColKey)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {/* Totals footer */}
                    <tr className="border-t-2 border-emerald-200 bg-emerald-50/60">
                      {displayCols.map((col, ci) => (
                        <td key={col.key}
                          className={`px-3 py-3 text-right text-xs whitespace-nowrap ${
                            ci === 0                     ? 'font-bold text-emerald-800' :
                            col.key === 'grossMargin'    ? 'font-bold text-emerald-900' :
                            col.key === 'grossMarginPct' ? (marginPct >= 20 ? 'font-bold text-emerald-700' : marginPct >= 10 ? 'font-bold text-amber-600' : 'font-bold text-red-600') :
                            col.key === 'netSales'       ? 'font-bold text-gray-900' :
                            col.key === 'cogs'           ? 'font-bold text-rose-700' :
                            'font-bold text-gray-700'
                          }`}>
                          {fmtTotal(col.key as ColKey)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {rows.length === 0 && !isLoading && (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 shadow-sm">
              <TrendingUp size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">لا توجد بيانات مبيعات في عام {year}</p>
              <p className="text-xs mt-1 text-gray-300">تأكد من وجود فواتير مكتملة في هذه الفترة</p>
            </div>
          )}
        </>
      )}
    </div>
    </DomainShell>
  )
}
