import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Package, DollarSign, TrendingDown, AlertTriangle,
  RefreshCw, Search, SlidersHorizontal, Download, X,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
} from 'lucide-react'
import { analyticsApi, type InventoryReportRow } from '../../../../api/analytics.api'
import { DomainShell } from '../components/DomainShell'
import { useCurrency } from '../../../../hooks/useCurrency'
import { useColState } from '../../../../hooks/useColState'
import { ColPicker, type ColDef } from '../../../../components/reports/ColPicker'
import { downloadCsv } from '../../../../utils/export'

// ── Column definitions ────────────────────────────────────────────────────────

type ColKey = keyof InventoryReportRow

const ALL_COLS: ColDef[] = [
  { key: 'productCode',      label: 'كود الصنف',                          group: 'أساسي' },
  { key: 'productName',      label: 'اسم الصنف',                          group: 'أساسي' },
  { key: 'barcode',          label: 'الباركود',                           group: 'أساسي' },
  { key: 'category',         label: 'الفئة',                              group: 'أساسي' },
  { key: 'stockQty',         label: 'كمية المخزون',                       group: 'كميات' },
  { key: 'costValue',        label: 'قيمة المخزون بسعر التكلفة',          group: 'قيم' },
  { key: 'sellValue',        label: 'قيمة المخزون بسعر البيع',            group: 'قيم' },
  { key: 'availableForSale', label: 'الكمية المتاحة للبيع',               group: 'كميات' },
  { key: 'nearExpiryQty',    label: 'كمية قريبة الانتهاء',                group: 'صلاحية' },
  { key: 'expiredQty',       label: 'الكمية منتهية الصلاحية',             group: 'صلاحية' },
  { key: 'avgCostPrice',     label: 'متوسط سعر التكلفة',                  group: 'أسعار' },
  { key: 'avgSellPrice',     label: 'متوسط سعر البيع',                    group: 'أسعار' },
  { key: 'status',           label: 'الحالة',                             group: 'أساسي' },
  { key: 'avgDiscount',      label: 'متوسط الخصم',                        group: 'خصومات' },
  { key: 'minDiscount',      label: 'أقل خصم',                            group: 'خصومات' },
  { key: 'maxDiscount',      label: 'أعلى خصم',                          group: 'خصومات' },
  { key: 'avgFreeUnits',     label: 'متوسط الوحدات المجانية',             group: 'مجاني' },
  { key: 'minFreeUnits',     label: 'أقل عدد وحدات مجانية',               group: 'مجاني' },
  { key: 'maxFreeUnits',     label: 'أعلى عدد وحدات مجانية',              group: 'مجاني' },
  { key: 'avgProfitPerUnit', label: 'متوسط الربح لكل وحدة',               group: 'ربحية' },
]

const STATUS_LABELS: Record<InventoryReportRow['status'], { label: string; cls: string }> = {
  active:      { label: 'نشط',               cls: 'bg-emerald-100 text-emerald-700' },
  near_expiry: { label: 'قريب الانتهاء',     cls: 'bg-amber-100  text-amber-700'  },
  expired:     { label: 'منتهي الصلاحية',   cls: 'bg-red-100    text-red-700'     },
  low_stock:   { label: 'مخزون منخفض',      cls: 'bg-orange-100 text-orange-700'  },
}

const PAGE_SIZE = 30

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronUp size={12} className="text-gray-300" />
  return dir === 'asc' ? <ChevronUp size={12} className="text-orange-600" /> : <ChevronDown size={12} className="text-orange-600" />
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <span className="text-xs text-gray-500">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight size={16} className="text-gray-600" />
        </button>
        {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
          const p = pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= pages - 3 ? pages - 6 + i : page - 3 + i
          return (
            <button key={p} onClick={() => onChange(p)}
              className={`w-7 h-7 rounded-lg text-xs font-medium ${p === page ? 'bg-orange-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
              {p}
            </button>
          )
        })}
        <button onClick={() => onChange(page + 1)} disabled={page === pages}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronLeft size={16} className="text-gray-600" />
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CurrentInventoryPage() {
  const { fmt } = useCurrency()
  const fmtN  = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const fmtP  = (n: number) => `${n.toFixed(2)}%`
  const fmtD  = (n: number) => n.toFixed(4)

  const [search,       setSearch]      = useState('')
  const [category,     setCategory]    = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortKey,      setSortKey]     = useState<ColKey>('sellValue')
  const [sortDir,      setSortDir]     = useState<'asc' | 'desc'>('desc')
  const [page,         setPage]        = useState(1)
  const [colPickerOpen, setColPickerOpen] = useState(false)

  const { visible, order, displayCols, toggleCol, setOrder, reset } =
    useColState(ALL_COLS, 'inventoryReport')

  const { data: rows = [], isLoading, error, refetch } = useQuery({
    queryKey: ['inventory-report', search, category, statusFilter],
    queryFn:  () => analyticsApi.getInventoryReport({
      search:   search   || undefined,
      category: category || undefined,
    }),
    staleTime: 2 * 60_000,
    retry: 1,
  })

  const filteredRows = useMemo(() =>
    statusFilter ? rows.filter(r => r.status === statusFilter) : rows,
    [rows, statusFilter]
  )

  const totals = useMemo(() => filteredRows.reduce((acc, r) => ({
    stockQty:  acc.stockQty  + r.stockQty,
    costValue: acc.costValue + r.costValue,
    sellValue: acc.sellValue + r.sellValue,
    nearExpiryQty: acc.nearExpiryQty + r.nearExpiryQty,
    expiredQty:    acc.expiredQty    + r.expiredQty,
  }), { stockQty: 0, costValue: 0, sellValue: 0, nearExpiryQty: 0, expiredQty: 0 }), [filteredRows])

  const categories = useMemo(() => [...new Set(rows.map(r => r.category).filter(Boolean))].sort(), [rows])

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [filteredRows, sortKey, sortDir])

  const pagedRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(key: ColKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  function fmtCell(row: InventoryReportRow, key: ColKey): string {
    switch (key) {
      case 'productCode':      return row.productCode
      case 'productName':      return row.productName
      case 'barcode':          return row.barcode
      case 'category':         return row.category
      case 'stockQty':         return fmtN(row.stockQty)
      case 'costValue':        return fmt(row.costValue)
      case 'sellValue':        return fmt(row.sellValue)
      case 'availableForSale': return fmtN(row.availableForSale)
      case 'nearExpiryQty':    return fmtN(row.nearExpiryQty)
      case 'expiredQty':       return fmtN(row.expiredQty)
      case 'avgCostPrice':     return fmt(row.avgCostPrice)
      case 'avgSellPrice':     return fmt(row.avgSellPrice)
      case 'status':           return STATUS_LABELS[row.status]?.label ?? row.status
      case 'avgDiscount':      return fmtP(row.avgDiscount)
      case 'minDiscount':      return fmtP(row.minDiscount)
      case 'maxDiscount':      return fmtP(row.maxDiscount)
      case 'avgFreeUnits':     return fmtD(row.avgFreeUnits)
      case 'minFreeUnits':     return fmtD(row.minFreeUnits)
      case 'maxFreeUnits':     return fmtD(row.maxFreeUnits)
      case 'avgProfitPerUnit': return fmt(row.avgProfitPerUnit)
    }
  }

  function handleExport() {
    const headers = displayCols.map(c => c.label)
    const rowData = sortedRows.map(r => displayCols.map(c => fmtCell(r, c.key as ColKey)))
    downloadCsv(`inventory-current-${new Date().toISOString().split('T')[0]}.csv`, headers, rowData)
  }

  return (
    <DomainShell
      icon={Package} iconColor="text-orange-600" iconBg="bg-orange-50"
      title="تقرير المخزون الحالي"
      subtitle="نظرة شاملة على مستويات المخزون والكميات المتوفرة — القيم، الصلاحيات، الخصومات، والأصناف المنخفضة"
    >
    <div className="space-y-5 pb-8">

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-orange-400 shadow-sm flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><Package size={12} />عدد الأصناف</span>
          <p className="text-lg font-bold text-gray-900">{fmtN(filteredRows.length)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-blue-400 shadow-sm flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><DollarSign size={12} />إجمالي قيمة التكلفة</span>
          <p className="text-lg font-bold text-gray-900">{fmt(totals.costValue)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-emerald-400 shadow-sm flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><TrendingDown size={12} />إجمالي قيمة البيع</span>
          <p className="text-lg font-bold text-gray-900">{fmt(totals.sellValue)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-amber-400 shadow-sm flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><AlertTriangle size={12} />وحدات قريبة الانتهاء</span>
          <p className="text-lg font-bold text-amber-700">{fmtN(totals.nearExpiryQty)}</p>
          <p className="text-xs text-gray-400">وحدة ستنتهي قريباً</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 border-l-4 border-l-red-500 shadow-sm flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><AlertTriangle size={12} />وحدات منتهية الصلاحية</span>
          <p className="text-lg font-bold text-red-600">{fmtN(totals.expiredQty)}</p>
          <p className="text-xs text-gray-400">وحدة منتهية الصلاحية الآن</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="بحث باسم الصنف، الكود، أو الباركود..."
            className="w-full border border-gray-200 rounded-xl pr-8 pl-3 py-1.5 text-xs bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2">
              <X size={12} className="text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
        <select value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white min-w-[120px]">
          <option value="">كل الفئات</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white min-w-[140px]">
          <option value="">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="near_expiry">قريب الانتهاء</option>
          <option value="expired">منتهي الصلاحية</option>
          <option value="low_stock">مخزون منخفض</option>
        </select>
        <div className="flex-1" />
        <span className="text-xs text-gray-400 hidden sm:block">{filteredRows.length} صنف</span>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
          <RefreshCw size={12} /> تحديث
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700 font-mono">
          <p className="font-semibold mb-1">خطأ من الخادم:</p>
          <p>{(error as any)?.response?.data?.message ?? (error as Error)?.message ?? String(error)}</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : filteredRows.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-700">تفاصيل المخزون</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{filteredRows.length} صنف</span>
              <span className="text-xs text-gray-400">
                صفحة {page} من {Math.ceil(sortedRows.length / PAGE_SIZE)}
                {' '}({(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedRows.length)})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
                <Download size={13} /> تنزيل CSV
              </button>
              <div className="relative">
                <button onClick={() => setColPickerOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    colPickerOpen ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <SlidersHorizontal size={13} />
                  الأعمدة
                  {visible.size < ALL_COLS.length && (
                    <span className="bg-orange-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                      {ALL_COLS.length - visible.size}
                    </span>
                  )}
                </button>
                {colPickerOpen && (
                  <ColPicker
                    allCols={ALL_COLS}
                    visible={visible}
                    order={order}
                    onToggle={toggleCol}
                    onReorder={setOrder}
                    onReset={reset}
                    onClose={() => setColPickerOpen(false)}
                    checkboxBg="bg-orange-600"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead className="bg-gray-50">
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
                {pagedRows.map((row, i) => (
                  <tr key={`${row.productCode}-${i}`}
                    className={`border-t border-gray-50 hover:bg-orange-50/30 transition-colors ${
                      row.status === 'expired'     ? 'bg-red-50/40'    :
                      row.status === 'near_expiry' ? 'bg-amber-50/40'  :
                      row.status === 'low_stock'   ? 'bg-orange-50/40' :
                      i % 2 === 1 ? 'bg-gray-50/30' : ''
                    }`}>
                    {displayCols.map(col => (
                      <td key={col.key}
                        className={`px-3 py-2.5 text-right whitespace-nowrap text-xs ${
                          col.key === 'productName'  ? 'font-medium text-gray-900 max-w-[180px] truncate' :
                          col.key === 'productCode'  ? 'font-mono text-gray-600' :
                          col.key === 'status'       ? '' :
                          typeof row[col.key as ColKey] === 'number' && (row[col.key as ColKey] as number) < 0 ? 'text-red-600 font-medium' :
                          col.key === 'sellValue' || col.key === 'costValue' ? 'font-medium text-gray-900' :
                          'text-gray-600'
                        }`}>
                        {col.key === 'status' ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_LABELS[row.status]?.cls ?? ''}`}>
                            {STATUS_LABELS[row.status]?.label ?? row.status}
                          </span>
                        ) : fmtCell(row, col.key as ColKey)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} total={sortedRows.length} onChange={setPage} />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 shadow-sm">
          <Package size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">لا توجد أصناف في المخزون</p>
        </div>
      )}
    </div>
    </DomainShell>
  )
}
