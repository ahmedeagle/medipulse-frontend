import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Search, Package, AlertCircle, ScanBarcode, Layers,
  ChevronLeft, ChevronRight, Filter, X, TrendingDown, TrendingUp,
  AlertTriangle, CheckCircle, FlaskConical,
} from 'lucide-react'
import { inventoryApi, type SmartProduct } from '../../api/inventory.api'

const PAGE_SIZE = 25

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

function StockBadge({ status }: { status: SmartProduct['stockStatus'] }) {
  if (status === 'out_of_stock') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
      <AlertCircle size={10} />نفد
    </span>
  )
  if (status === 'low_stock') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
      <TrendingDown size={10} />نقص
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
      <TrendingUp size={10} />متوفر
    </span>
  )
}

function ExpiryCell({ nearestExpiry }: { nearestExpiry: string | null }) {
  if (!nearestExpiry) return <span className="text-gray-300 text-xs">—</span>
  const days = Math.ceil((new Date(nearestExpiry).getTime() - Date.now()) / 86400000)
  if (days < 0) return (
    <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">منتهي الصلاحية</span>
  )
  if (days <= 30) return (
    <div>
      <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">{days} يوم</span>
      <p className="text-xs text-gray-400 mt-0.5">{new Date(nearestExpiry).toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' })}</p>
    </div>
  )
  if (days <= 90) return (
    <div>
      <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">{days} يوم</span>
      <p className="text-xs text-gray-400 mt-0.5">{new Date(nearestExpiry).toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' })}</p>
    </div>
  )
  return (
    <div>
      <span className="text-xs text-gray-600">{new Date(nearestExpiry).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
    </div>
  )
}

const STATUS_OPTS = [
  { value: '',             label: 'الكل' },
  { value: 'in_stock',     label: 'متوفر' },
  { value: 'low_stock',    label: 'نقص' },
  { value: 'out_of_stock', label: 'نفد' },
  { value: 'expiring_soon',label: 'ينتهي قريباً' },
] as const

export default function ProductsPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState<string>('')
  const [page, setPage] = useState(1)
  const skip = (page - 1) * PAGE_SIZE

  const search = useDebounce(searchInput, 300)

  // Reset to page 1 when debounced search changes
  const prevSearch = useRef(search)
  useEffect(() => {
    if (prevSearch.current !== search) { setPage(1); prevSearch.current = search }
  }, [search])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['smart-products', { search, status, skip }],
    queryFn: () =>
      inventoryApi.getSmartProducts({ search: search || undefined, status: status || undefined, take: PAGE_SIZE, skip })
        .then(r => r.data as { data: SmartProduct[]; total: number }),
    staleTime: 30_000,
    placeholderData: prev => prev,
  })

  // Summary counts across all records (no-filter, page 1, large take for aggregates)
  const { data: summaryData } = useQuery({
    queryKey: ['smart-products-summary'],
    queryFn: () =>
      inventoryApi.getSmartProducts({ take: 2000, skip: 0 })
        .then(r => r.data as { data: SmartProduct[]; total: number }),
    staleTime: 60_000,
  })

  const products: SmartProduct[] = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const clearFilters = () => { setSearchInput(''); setStatus(''); setPage(1) }
  const hasFilters = !!searchInput || !!status

  const allProducts = summaryData?.data ?? products
  const lowCount  = allProducts.filter(p => p.stockStatus === 'low_stock').length
  const outCount  = allProducts.filter(p => p.stockStatus === 'out_of_stock').length
  const warnCount = allProducts.filter(p => p.barcodeWarning).length
  const expCount  = allProducts.filter(p => p.nearestExpiry && Math.ceil((new Date(p.nearestExpiry).getTime() - Date.now()) / 86400000) <= 30).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">كتالوج المنتجات</h1>
          <p className="text-sm text-gray-500 mt-0.5">راقب مخزون كل منتج، حالة الدفعات، وأقرب تاريخ انتهاء صلاحية.</p>
        </div>
      </div>

      {/* Summary stat chips */}
      {!isLoading && products.length > 0 && (outCount > 0 || lowCount > 0 || expCount > 0 || warnCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {outCount > 0 && (
            <button onClick={() => { setStatus('out_of_stock'); setPage(1) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors">
              <AlertCircle size={13} />{outCount} منتج نفد من المخزون
            </button>
          )}
          {lowCount > 0 && (
            <button onClick={() => { setStatus('low_stock'); setPage(1) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
              <TrendingDown size={13} />{lowCount} تحت الحد الأدنى
            </button>
          )}
          {expCount > 0 && (
            <button onClick={() => { setStatus('expiring_soon'); setPage(1) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition-colors">
              <AlertTriangle size={13} />{expCount} ينتهي خلال 30 يوم
            </button>
          )}
          {warnCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold">
              <ScanBarcode size={13} />{warnCount} بدون باركود
            </span>
          )}
        </div>
      )}

      {/* Search + filters */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <div className="relative flex-1">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="ابحث باسم المنتج، المادة الفعالة، SKU، أو الباركود…"
              className="w-full ps-9 pe-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {STATUS_OPTS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setStatus(opt.value); setPage(1) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors ${
                  status === opt.value
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {hasFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
                <X size={12} />مسح
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-2 py-3 w-10"></th>
                <th className="px-4 py-3 text-start font-semibold">SKU</th>
                <th className="px-4 py-3 text-start font-semibold">المنتج</th>
                <th className="px-4 py-3 text-start font-semibold">المادة الفعالة</th>
                <th className="px-4 py-3 text-start font-semibold">الفئة</th>
                <th className="px-4 py-3 text-center font-semibold">الدفعات</th>
                <th className="px-4 py-3 text-start font-semibold">أقرب انتهاء</th>
                <th className="px-4 py-3 text-center font-semibold">المخزون</th>
                <th className="px-4 py-3 text-center font-semibold">الحالة</th>
                <th className="px-4 py-3 text-center font-semibold">باركود</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-20 text-center">
                    <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-red-500 text-sm">
                    تعذّر تحميل المنتجات. يرجى المحاولة مجدداً.
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <Package size={36} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-sm text-gray-400">لا توجد منتجات مطابقة</p>
                    {hasFilters && (
                      <button onClick={clearFilters} className="mt-2 text-xs text-teal-600 underline">مسح الفلاتر</button>
                    )}
                  </td>
                </tr>
              ) : products.map(p => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  {/* Thumbnail */}
                  <td className="px-2 py-2 w-10">
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover border border-gray-100" />
                      : <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center"><Package size={14} className="text-gray-300" /></div>
                    }
                  </td>
                  {/* SKU */}
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                    {p.sku || <span className="text-gray-300">—</span>}
                  </td>
                  {/* Product */}
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="font-medium text-gray-900 truncate">{p.name}</p>
                    {p.nameAr && <p className="text-xs text-gray-400 truncate mt-0.5">{p.nameAr}</p>}
                    {p.strength && <p className="text-xs text-gray-300 mt-0.5">{p.strength} · {p.dosageForm || ''}</p>}
                  </td>
                  {/* Active ingredient */}
                  <td className="px-4 py-3 max-w-[140px]">
                    {p.activeIngredient
                      ? <span className="text-xs text-violet-700 bg-violet-50 px-2 py-0.5 rounded-lg border border-violet-100 truncate block">{p.activeIngredient}</span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  {/* Category */}
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{p.category}</td>
                  {/* Batch count */}
                  <td className="px-4 py-3 text-center">
                    {p.batchCount > 0
                      ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">
                          <Layers size={10} />{p.batchCount}
                        </span>
                      )
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  {/* Nearest expiry */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ExpiryCell nearestExpiry={p.nearestExpiry} />
                  </td>
                  {/* Stock quantity */}
                  <td className="px-4 py-3 text-center">
                    <span className={`text-base font-bold ${p.stockStatus === 'out_of_stock' ? 'text-red-600' : p.stockStatus === 'low_stock' ? 'text-amber-600' : 'text-gray-900'}`}>
                      {p.totalStock}
                    </span>
                    <p className="text-[10px] text-gray-400">حد: {p.minThreshold}</p>
                  </td>
                  {/* Stock status */}
                  <td className="px-4 py-3 text-center">
                    <StockBadge status={p.stockStatus} />
                  </td>
                  {/* Barcode warning */}
                  <td className="px-4 py-3 text-center">
                    {p.barcodeWarning
                      ? (
                        <span title="لا يوجد باركود — مسح POS لن يعمل" className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                          <ScanBarcode size={10} />تحذير
                        </span>
                      )
                      : (
                        <CheckCircle size={14} className="mx-auto text-gray-200" />
                      )
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} من {total} منتج
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
              <span className="px-3 py-1 text-xs text-gray-700 font-medium">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
