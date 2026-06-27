import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search, Download, Printer, Eye, MoreHorizontal, X,
  ChevronDown, Zap, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, Calendar, Filter,
} from 'lucide-react'
import clsx from 'clsx'
import { posApi, type PosShift } from '../../../api/pos.api'
import { useCurrency } from '../../../hooks/useCurrency'
import { pharmacySettingsApi } from '../../../api/pharmacy-settings.api'
import { printShiftSummary } from '../../../utils/shiftPrint'
import Pagination from '../../../components/ui/Pagination'

// ── Helpers ───────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25

function durText(openedAt: string, closedAt: string | null) {
  const ms  = (closedAt ? new Date(closedAt) : new Date()).getTime() - new Date(openedAt).getTime()
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}د`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}س ${m}د` : `${h}س`
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
  }
}

function expectedCash(s: PosShift) {
  return (
    Number(s.openingBalance)    +
    Number(s.totalCashSales)    +
    Number(s.totalCashIn  ?? 0) -
    Number(s.totalCashOut ?? 0)
  )
}

function shiftVariance(s: PosShift): number | null {
  if (s.closingBalance == null) return null
  return Number(s.closingBalance) - expectedCash(s)
}

// ── Actions dropdown ──────────────────────────────────────────────────────────
function RowMenu({ shift, onPrint }: { shift: PosShift; onPrint: () => void }) {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)
  const navigate        = useNavigate()

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          className="fixed w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[200]"
          style={(() => {
            if (!ref.current) return { top: 0, right: 0 }
            const rect = ref.current.getBoundingClientRect()
            const menuW = 192
            const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8))
            return { top: rect.bottom + 4, left }
          })()}
        >
          <button
            onClick={() => { onPrint(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Printer size={13} className="text-gray-400" /> طباعة ملخص الشفت
          </button>
          <button
            onClick={() => { navigate(`/pharmacy/pos/sales?shiftId=${shift.id}`); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Eye size={13} className="text-gray-400" /> عرض المعاملات
          </button>
          {shift.status === 'open' && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={() => { navigate('/pharmacy/pos'); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50"
              >
                <Zap size={13} /> فتح الكاشير
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Variance badge ────────────────────────────────────────────────────────────
function VarianceBadge({ value, fmt }: { value: number | null; fmt: (n: number) => string }) {
  if (value === null) return <span className="text-gray-300 text-sm">—</span>
  const balanced = Math.abs(value) <= 10
  const positive = value > 10
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-sm font-semibold tabular-nums',
      balanced ? 'text-emerald-600' : positive ? 'text-amber-600' : 'text-red-600',
    )}>
      {balanced ? '✓' : positive ? '+' : ''}
      {fmt(Math.abs(value))}
      {!balanced && (positive ? ' زيادة' : ' عجز')}
    </span>
  )
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV(shifts: PosShift[], currency: string) {
  const headers = [
    'رقم الشفت', 'الكاشير', 'وقت الفتح', 'وقت الإغلاق', 'المدة',
    'النقد الافتتاحي', 'النقد الإغلاقي', 'النقد المتوقع', 'الفرق',
    'إجمالي المبيعات', 'المرتجعات', 'الصافي', 'نقدي', 'كارت',
    'عدد المعاملات', 'الحالة',
  ].join(',')

  const rows = shifts.map((s, i) => {
    const exp = expectedCash(s)
    const v   = shiftVariance(s)
    return [
      i + 1,
      `"${s.cashierName ?? ''}"`,
      new Date(s.openedAt).toLocaleString('en-US'),
      s.closedAt ? new Date(s.closedAt).toLocaleString('en-US') : '',
      durText(s.openedAt, s.closedAt),
      Number(s.openingBalance).toFixed(2),
      s.closingBalance != null ? Number(s.closingBalance).toFixed(2) : '',
      exp.toFixed(2),
      v != null ? v.toFixed(2) : '',
      Number(s.totalSales).toFixed(2),
      Number(s.totalReturns).toFixed(2),
      (Number(s.totalSales) - Number(s.totalReturns)).toFixed(2),
      Number(s.totalCashSales).toFixed(2),
      Number(s.totalCardSales).toFixed(2),
      s.transactionCount,
      s.status === 'open' ? 'مفتوح' : 'مغلق',
    ].join(',')
  })

  const csv = '﻿' + [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `shifts-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ShiftLogPage() {
  const navigate      = useNavigate()
  const { currency, fmt } = useCurrency()

  // ── Filters (server-side: status, dates) ──────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [showFilters,  setShowFilters]  = useState(false)
  const [page,         setPage]         = useState(1)

  // Client-side filters (applied on top of backend result)
  const [cashierSearch, setCashierSearch] = useState('')
  const [varianceFilter, setVarianceFilter] = useState<'all' | 'positive' | 'negative' | 'zero'>('all')
  const [varDropOpen, setVarDropOpen] = useState(false)
  const varDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!varDropRef.current?.contains(e.target as Node)) setVarDropOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Pharmacy settings for print
  const { data: settings } = useQuery({
    queryKey: ['pharmacy-settings'],
    queryFn:  pharmacySettingsApi.getSettings,
    staleTime: 5 * 60_000,
  })

  const pharmName = settings?.pharmacyNameAr || settings?.pharmacyNameEn || 'الصيدلية'

  // ── Server query ──────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['pos-shifts', statusFilter, dateFrom, dateTo, page],
    queryFn: () => posApi.listShifts({
      status:   statusFilter === 'all' ? undefined : statusFilter,
      dateFrom: dateFrom || undefined,
      dateTo:   dateTo   || undefined,
      limit:    PAGE_SIZE,
      offset:   (page - 1) * PAGE_SIZE,
    }),
    staleTime: 15_000,
    placeholderData: prev => prev,
  })

  const allShifts = data?.data ?? []
  const total     = data?.total ?? 0

  // ── Client-side filter ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let out = allShifts
    if (cashierSearch.trim()) {
      const q = cashierSearch.trim().toLowerCase()
      out = out.filter(s => (s.cashierName ?? '').toLowerCase().includes(q))
    }
    if (varianceFilter !== 'all') {
      out = out.filter(s => {
        const v = shiftVariance(s)
        // Open shifts (v===null) are excluded from all variance filters — they have no variance yet
        if (v === null) return false
        if (varianceFilter === 'positive') return v >  0   // any surplus
        if (varianceFilter === 'negative') return v <  0   // any deficit
        if (varianceFilter === 'zero')     return v === 0  // exactly balanced
        return true
      })
    }
    return out
  }, [allShifts, cashierSearch, varianceFilter])

  // ── Summary stats ─────────────────────────────────────────────────────────
  const sumSales   = allShifts.reduce((s, sh) => s + Number(sh.totalSales),   0)
  const sumReturns = allShifts.reduce((s, sh) => s + Number(sh.totalReturns), 0)
  const sumNet     = sumSales - sumReturns

  // ── Print handler ─────────────────────────────────────────────────────────
  const handlePrint = (shift: PosShift) => {
    printShiftSummary(shift, {
      currency,
      pharmName,
      address: settings?.address,
      phone:   settings?.phone,
    })
  }

  const varFilterLabels: Record<string, string> = {
    all:      'جميع الفروق',
    positive: 'زيادة (فائض)',
    negative: 'عجز (ناقص)',
    zero:     'متوازن تماماً',
  }

  return (
    <div className="p-6 space-y-5" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900">سجل الشفتات</h1>
          <p className="text-sm text-gray-400 mt-0.5">مراقبة وتدقيق جميع أنشطة شفتات نقاط البيع</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => exportCSV(filtered, currency)}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download size={14} />
            تصدير إلى CSV
          </button>
          <button
            onClick={() => navigate('/pharmacy/pos')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors shadow-sm"
          >
            <Zap size={14} />
            نقطة البيع
          </button>
        </div>
      </div>

      {/* ── Summary tiles ── */}
      {allShifts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'إجمالي المبيعات', value: fmt(sumSales),   icon: TrendingUp,   color: 'text-teal-600',   bg: 'bg-teal-50' },
            { label: 'إجمالي المرتجعات', value: fmt(sumReturns), icon: TrendingDown, color: 'text-amber-600',  bg: 'bg-amber-50' },
            { label: 'صافي الإيرادات',  value: fmt(sumNet),     icon: DollarSign,   color: sumNet >= 0 ? 'text-emerald-700' : 'text-red-600', bg: sumNet >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4">
              <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', bg)}>
                <Icon size={18} className={color} />
              </div>
              <div className="min-w-0">
                <p className={clsx('text-xl font-black tabular-nums', color)}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Top row */}
        <div className="flex items-center gap-3 p-3 border-b border-gray-100">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={cashierSearch}
              onChange={e => setCashierSearch(e.target.value)}
              placeholder="البحث برقم الشفت أو اسم الكاشير..."
              className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none"
            />
            {cashierSearch && (
              <button onClick={() => setCashierSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status tabs */}
          <div className="flex items-center bg-gray-100 rounded-xl p-0.5 shrink-0">
            {(['all', 'open', 'closed'] as const).map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {s === 'all' ? 'الكل' : s === 'open' ? 'مفتوح' : 'مغلق'}
              </button>
            ))}
          </div>

          {/* Variance dropdown */}
          <div ref={varDropRef} className="relative shrink-0">
            <button
              onClick={() => setVarDropOpen(o => !o)}
              className={clsx(
                'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                varianceFilter !== 'all'
                  ? 'border-teal-400 bg-teal-50 text-teal-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              <span>قيمة الفرق</span>
              <ChevronDown size={13} className={clsx('transition-transform', varDropOpen && 'rotate-180')} />
            </button>
            {varDropOpen && (
              <div className="absolute z-50 top-full mt-1 left-0 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1">
                {(['all', 'positive', 'negative', 'zero'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => { setVarianceFilter(v); setVarDropOpen(false) }}
                    className={clsx(
                      'w-full text-right px-3 py-2 text-sm transition-colors',
                      varianceFilter === v
                        ? 'bg-teal-50 text-teal-700 font-semibold'
                        : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    {varFilterLabels[v]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Expand filters btn */}
          <button
            onClick={() => setShowFilters(o => !o)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors shrink-0',
              showFilters ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
            )}
          >
            <Filter size={13} />
            الفلاتر
            {(dateFrom || dateTo) && (
              <span className="w-2 h-2 rounded-full bg-teal-500" />
            )}
          </button>
        </div>

        {/* Date range (expanded) */}
        {showFilters && (
          <div className="flex items-center gap-4 px-4 py-3 bg-gray-50/60 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-gray-400 shrink-0" />
              <label className="text-xs font-medium text-gray-500 shrink-0">من</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-teal-400 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 shrink-0">إلى</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1) }}
                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-teal-400 outline-none"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors"
              >
                <X size={11} /> مسح التواريخ
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              {[
                'رقم الشفت', 'الكاشير', 'فترة الشفت',
                'النقد الافتتاحي', 'النقد الإغلاقي', 'النقد المتوقع', 'الفرق',
                'الحالة', 'الإجراءات',
              ].map((h, i, arr) => (
                <th
                  key={h}
                  className={clsx(
                    'text-right px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap',
                    i === 0 && 'rounded-tr-2xl',
                    i === arr.length - 1 && 'rounded-tl-2xl w-14',
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {[...Array(9)].map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-20 text-center">
                  <div className="text-gray-300 text-4xl mb-3">📋</div>
                  <p className="text-gray-500 font-semibold">لا توجد شفتات</p>
                  <p className="text-gray-400 text-xs mt-1">جرب تعديل الفلاتر</p>
                </td>
              </tr>
            ) : (
              filtered.map((shift, idx) => {
                const open     = shift.status === 'open'
                const exp      = expectedCash(shift)
                const v        = shiftVariance(shift)
                const net      = Number(shift.totalSales) - Number(shift.totalReturns)
                const openDt   = fmtDateTime(shift.openedAt)
                const closeDt  = shift.closedAt ? fmtDateTime(shift.closedAt) : null
                const shiftNum = total - ((page - 1) * PAGE_SIZE) - idx

                return (
                  <tr
                    key={shift.id}
                    className={clsx(
                      'border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors group',
                      open && 'bg-emerald-50/30',
                    )}
                  >
                    {/* Shift # */}
                    <td className="px-4 py-3.5">
                      <span className={clsx(
                        'font-mono font-bold text-sm',
                        open ? 'text-emerald-600' : 'text-teal-600',
                      )}>
                        Shift-{shiftNum}
                      </span>
                      {open && (
                        <span className="mr-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </td>

                    {/* Cashier */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-[10px] shrink-0">
                          {(shift.cashierName ?? 'K').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <span className="text-sm text-gray-800 font-medium truncate max-w-[120px]">
                          {shift.cashierName ?? '—'}
                        </span>
                      </div>
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3.5">
                      <p className="text-sm text-gray-700 tabular-nums">
                        {openDt.date} {openDt.time}
                        {closeDt && <span className="text-gray-400"> ← {closeDt.time}</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{durText(shift.openedAt, shift.closedAt)}</p>
                    </td>

                    {/* Opening */}
                    <td className="px-4 py-3.5 tabular-nums text-sm text-gray-700">
                      {fmt(shift.openingBalance)}
                    </td>

                    {/* Closing */}
                    <td className="px-4 py-3.5 tabular-nums text-sm text-gray-700">
                      {shift.closingBalance != null ? fmt(shift.closingBalance) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Expected */}
                    <td className="px-4 py-3.5 tabular-nums text-sm text-gray-700">
                      {open ? <span className="text-gray-300">—</span> : fmt(exp)}
                    </td>

                    {/* Variance */}
                    <td className="px-4 py-3.5">
                      <VarianceBadge value={open ? null : v} fmt={fmt} />
                      {!open && v !== null && Math.abs(v) > 10 && (
                        <AlertTriangle size={11} className={clsx('inline mr-1', v < 0 ? 'text-red-400' : 'text-amber-400')} />
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      {open ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          مفتوح
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                          مغلق
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <RowMenu shift={shift} onPrint={() => handlePrint(shift)} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          totalPages={Math.ceil(total / PAGE_SIZE)}
          onPageChange={setPage}
          isLoading={isLoading}
        />
      )}

      {/* Result count */}
      {!isLoading && total > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {filtered.length < allShifts.length
            ? `${filtered.length} نتيجة بعد الفلتر من أصل ${allShifts.length} في هذه الصفحة · إجمالي ${total} شفت`
            : `جميع النتائج ${allShifts.length} في هذه الصفحة · إجمالي ${total} شفت`
          }
        </p>
      )}
    </div>
  )
}
