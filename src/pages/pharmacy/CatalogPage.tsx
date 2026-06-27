import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, CheckCircle, ShoppingCart, Plus, Minus, Loader2, Zap, Star, Store, Info,
  Package, ShieldCheck, PackageX, LayoutGrid, Users, SlidersHorizontal, X,
  TrendingDown, ArrowRight, MapPin, Truck, BadgeCheck,
} from 'lucide-react'
import { VoiceMicButton } from '../../components/ui/VoiceMicButton'
import { supplierApi, type SupplierMarketplaceCard } from '../../api/supplier.api'
import { procurementApi } from '../../api/procurement.api'
import Pagination from '../../components/ui/Pagination'
import { FullPageSpinner } from '../../components/ui/Spinner'
import { usePaginatedList } from '../../hooks/usePaginatedList'
import { ProcurementCartDrawer } from '../../components/pharmacy/ProcurementCartDrawer'
import { ManualCartDrawer } from '../../components/pharmacy/ManualCartDrawer'
import { CompareSourcesModal } from '../../components/pharmacy/CompareSourcesModal'
import { useManualCart, manualCartItemCount } from '../../store/manualCart.store'
import type { SupplierCatalogItem } from '../../types'

type ViewMode = 'products' | 'distributors'
type SortKey = 'relevance' | 'price_asc' | 'price_desc' | 'reliability'

interface CatalogFilters {
  category: string | null
  manufacturer: string | null
  inStockOnly: boolean
  maxPrice: number | null
  sort: SortKey
}

const EMPTY_FILTERS: CatalogFilters = {
  category: null,
  manufacturer: null,
  inStockOnly: false,
  maxPrice: null,
  sort: 'relevance',
}

// ─── Reliability mini-badge ───────────────────────────────────────────────────
function ReliabilityPill({ score, label }: { score: number | null; label: string | null }) {
  if (score === null) return null
  const tone = label === 'high'
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : label === 'medium'
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-gray-600 bg-gray-50 border-gray-200'
  const text = label === 'high' ? 'موثوق' : label === 'medium' ? 'متوسط' : 'ضعيف'
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${tone}`}>
      <Star size={9} className="fill-current" />
      {score.toFixed(0)} · {text}
    </span>
  )
}

// ─── Product card ──────────────────────────────────────────────────────────────
function ProductCard({
  row,
  qty,
  setQty,
  onSmartPlan,
  onAddManual,
  onCompare,
  smartLoading,
  inSmartPlan,
  inManualCart,
}: {
  row: any
  qty: number
  setQty: (v: number) => void
  onSmartPlan: () => void
  onAddManual: () => void
  onCompare: () => void
  smartLoading: boolean
  inSmartPlan: boolean
  inManualCart: boolean
}) {
  const outOfStock = row.stock <= 0 || !row.isAvailable
  const score: number | null = row.reliabilityScore ?? null
  const label: string | null = row.reliabilityLabel ?? null
  const imageUrl: string | undefined = row.product?.imageUrl ?? row.imageUrl

  return (
    <div className="group bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col hover:shadow-lg hover:border-emerald-300 transition-all">
      {/* Image / placeholder */}
      <div className="relative h-36 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={row.product?.name} className="h-full w-full object-contain p-3" loading="lazy" />
        ) : (
          <Package size={40} className="text-gray-300" />
        )}
        {/* Stock chip */}
        <span className={`absolute top-2 ${'start-2'} inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur
          ${outOfStock ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white'}`}>
          {outOfStock
            ? <><PackageX size={10} /> نفد</>
            : <><CheckCircle size={10} /> {row.stock.toLocaleString('en-US')} متاح</>
          }
        </span>
        <div className="absolute top-2 end-2 flex flex-col items-end gap-1">
          {inSmartPlan && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
              <Zap size={10} /> في الخطة
            </span>
          )}
          {inManualCart && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-700 text-white">
              <ShoppingCart size={10} /> في السلة
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-3.5 gap-2">
        <div className="min-h-[2.5rem]">
          <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{row.product?.name}</h3>
          {row.product?.genericName && (
            <p className="text-[11px] text-gray-400 truncate mt-0.5">{row.product.genericName}</p>
          )}
        </div>

        {/* Supplier + category */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full max-w-full truncate">
            <Store size={10} className="shrink-0" />
            <span className="truncate">{row.supplierTenant?.name || 'مورد'}</span>
          </span>
          {row.product?.category && (
            <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-full truncate">
              {row.product.category}
            </span>
          )}
        </div>

        <ReliabilityPill score={score} label={label} />

        {/* Price */}
        <div className="mt-auto pt-1">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-extrabold text-gray-900 tabular-nums">{Number(row.price).toFixed(2)}</span>
            <span className="text-xs font-medium text-gray-500">{row.currency || 'ج.م'}</span>
          </div>
        </div>

        {/* Qty stepper */}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setQty(qty - 1)}
              disabled={qty <= 1}
              className="px-2 py-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >
              <Minus size={12} />
            </button>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              className="w-9 text-center text-sm font-semibold text-gray-800 border-0 focus:outline-none py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => setQty(qty + 1)}
              className="px-2 py-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Manual: direct buy from THIS supplier */}
          <button
            type="button"
            disabled={outOfStock}
            onClick={onAddManual}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap
              bg-emerald-600 hover:bg-emerald-700 text-white
              disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
            title="شراء مباشر من هذا الموزّع"
          >
            <ShoppingCart size={13} /> أضف للسلة
          </button>
        </div>

        {/* Smart plan + compare */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={outOfStock || smartLoading}
            onClick={onSmartPlan}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap
              bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200
              disabled:opacity-50 disabled:cursor-not-allowed"
            title="دع الذكاء الاصطناعي يختار أوفر مصدر"
          >
            {smartLoading
              ? <><Loader2 size={12} className="animate-spin" /> جارٍ…</>
              : <><Zap size={12} /> خطة ذكية</>
            }
          </button>
          <button
            type="button"
            disabled={outOfStock}
            onClick={onCompare}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap
              text-gray-600 hover:bg-gray-50 hover:text-emerald-700 border border-gray-300 disabled:opacity-50"
            title="قارن السعر مع كل المصادر"
          >
            <TrendingDown size={12} /> قارن
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Distributor card (lightweight) ───────────────────────────────────────────
function DistributorCard({ card, onOpen }: { card: SupplierMarketplaceCard; onOpen: () => void }) {
  const initials = card.companyName.trim().slice(0, 2).toUpperCase() || 'مو'
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 text-start hover:shadow-lg hover:border-emerald-300 transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-bold text-gray-900 text-sm truncate">{card.companyName}</p>
            {card.verifiedAt && <BadgeCheck size={14} className="text-emerald-500 shrink-0" />}
          </div>
          <ReliabilityPill score={card.reliabilityScore} label={card.reliabilityLabel} />
        </div>
      </div>

      <div className="space-y-1 text-[11px] text-gray-500">
        {card.address && (
          <p className="flex items-center gap-1.5 truncate"><MapPin size={11} className="shrink-0" /> {card.address}</p>
        )}
        {card.maxDeliveryDays != null && (
          <p className="flex items-center gap-1.5"><Truck size={11} className="shrink-0" /> توصيل خلال {card.maxDeliveryDays} يوم</p>
        )}
        {card.paymentTerms && (
          <p className="flex items-center gap-1.5 truncate"><Info size={11} className="shrink-0" /> {card.paymentTerms}</p>
        )}
      </div>

      <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 group-hover:gap-2 transition-all">
        تصفح منتجاته <ArrowRight size={13} className="rtl:rotate-180" />
      </span>
    </button>
  )
}


export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const supplierIdFilter   = searchParams.get('supplierId') ?? undefined
  const supplierNameFilter = searchParams.get('supplierName') ?? undefined

  const [view, setView]                 = useState<ViewMode>('products')
  const [search, setSearch]             = useState('')
  const [drawerOpen, setDrawerOpen]     = useState(false)        // smart-plan cart
  const [manualOpen, setManualOpen]     = useState(false)        // manual cart
  const [filtersOpen, setFiltersOpen]   = useState(false)        // mobile filter sheet
  const [filters, setFilters]           = useState<CatalogFilters>(EMPTY_FILTERS)
  const [qtys, setQtys]                 = useState<Record<string, number>>({})
  const [addingId, setAddingId]         = useState<string | null>(null)
  const [compareFor, setCompareFor]     = useState<any | null>(null) // row under comparison
  const qc = useQueryClient()

  const debouncedSearch = useDebounce(search, 300)

  // Manual cart store
  const manualGroups = useManualCart((s) => s.groups)
  const addManualItem = useManualCart((s) => s.addItem)
  const manualCount = manualCartItemCount(manualGroups)
  const manualProductIds = useMemo(() => {
    const ids = new Set<string>()
    Object.values(manualGroups).forEach((g) => g.items.forEach((i) => ids.add(i.productId)))
    return ids
  }, [manualGroups])

  const list = usePaginatedList<SupplierCatalogItem>({
    queryKey: ['supplier-catalog-all', debouncedSearch, supplierIdFilter],
    initialPageSize: 48,
    fetchPage: ({ limit, offset }) =>
      supplierApi.getCatalog({ limit, offset, search: debouncedSearch || undefined, supplierId: supplierIdFilter }).then((r) => r.data),
  })

  // Distributors directory (loaded only when toggled, lightweight)
  const distributorsQuery = useQuery({
    queryKey: ['supplier-marketplace-directory'],
    queryFn: () => supplierApi.getMarketplace({ limit: 200 }).then((r) => r.data.data),
    enabled: view === 'distributors',
    staleTime: 60_000,
  })

  // Reset to page 1 whenever search filter changes
  const prevSearch = useRef(debouncedSearch)
  useEffect(() => {
    if (prevSearch.current !== debouncedSearch) {
      list.setPage(1)
      prevSearch.current = debouncedSearch
    }
  }, [debouncedSearch])

  const cartQuery = useQuery({
    queryKey: ['procurement-cart'],
    queryFn: () => procurementApi.getCart().then((r) => r.data),
    staleTime: 30_000,
  })
  const cartCount = cartQuery.data?.items.length ?? 0
  // Set of productIds already in the active plan — prevents accidental re-adds
  const productsInCart = useMemo(
    () => new Set((cartQuery.data?.items ?? []).map((i: any) => i.productId).filter(Boolean)),
    [cartQuery.data],
  )

  const addToCartMutation = useMutation({
    mutationFn: ({ productId, qty }: { productId: string; qty: number }) =>
      procurementApi.addToCart(productId, qty),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-cart'] })
      setDrawerOpen(true)
    },
    onSettled: () => setAddingId(null),
  })

  const getQty = (itemId: string) => qtys[itemId] ?? 1
  const setQty = (itemId: string, val: number) =>
    setQtys((prev) => ({ ...prev, [itemId]: Math.max(1, val) }))

  // ── Client-side filter + sort over the loaded page ──────────────────────────
  const rawCatalog = list.items

  const { categoryOptions, manufacturerOptions } = useMemo(() => {
    const cats = new Set<string>()
    const mans = new Set<string>()
    rawCatalog.forEach((r: any) => {
      if (r.product?.category) cats.add(r.product.category)
      if (r.product?.manufacturer) mans.add(r.product.manufacturer)
    })
    return {
      categoryOptions: [...cats].sort(),
      manufacturerOptions: [...mans].sort(),
    }
  }, [rawCatalog])

  const catalog = useMemo(() => {
    let rows = rawCatalog.filter((r: any) => {
      if (filters.category && r.product?.category !== filters.category) return false
      if (filters.manufacturer && r.product?.manufacturer !== filters.manufacturer) return false
      if (filters.inStockOnly && (r.stock <= 0 || !r.isAvailable)) return false
      if (filters.maxPrice != null && Number(r.price) > filters.maxPrice) return false
      return true
    })
    if (filters.sort === 'price_asc') rows = [...rows].sort((a: any, b: any) => Number(a.price) - Number(b.price))
    else if (filters.sort === 'price_desc') rows = [...rows].sort((a: any, b: any) => Number(b.price) - Number(a.price))
    else if (filters.sort === 'reliability') rows = [...rows].sort((a: any, b: any) => (b.reliabilityScore ?? 0) - (a.reliabilityScore ?? 0))
    return rows
  }, [rawCatalog, filters])

  const activeFilterCount =
    (filters.category ? 1 : 0) +
    (filters.manufacturer ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0) +
    (filters.maxPrice != null ? 1 : 0) +
    (filters.sort !== 'relevance' ? 1 : 0)

  const openDistributor = (card: SupplierMarketplaceCard) => {
    setSearchParams({ supplierId: card.supplierTenantId, supplierName: card.companyName })
    setView('products')
    setFilters(EMPTY_FILTERS)
    list.setPage(1)
  }

  const clearSupplierFilter = () => {
    setSearchParams({})
    list.setPage(1)
  }

  if (list.isLoading && view === 'products') return <FullPageSpinner />


  return (
    <div className="space-y-5">
      {/* Hero card — reports-hub style */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-start justify-between gap-5 p-6">
          <div className="flex items-start gap-5 min-w-0">
            <div className="p-4 rounded-2xl shrink-0 bg-emerald-50">
              <Store size={26} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">
                {supplierNameFilter ? `كتالوج: ${supplierNameFilter}` : 'سوق الأدوية'}
              </p>
              <h1 className="text-2xl font-bold text-gray-900">اشترِ بذكاء ووفّر فلوسك</h1>
              <p className="text-gray-500 mt-1.5 text-sm leading-relaxed max-w-xl">
                قوّتنا ليست مجرد الشراء — بل توفير أموالك. اشترِ <strong className="text-emerald-700">مباشرة</strong> من
                الموزّع الذي تثق به، أو دع <strong className="text-emerald-700">الخطة الذكية</strong> تختار أوفر مصدر
                تلقائياً عبر كل الموزّعين و P2P، أو اضغط <strong className="text-emerald-700">قارن</strong> لترى كم ستوفّر.
              </p>
              <div className="flex flex-wrap gap-4 mt-3">
                {[
                  { icon: TrendingDown, text: 'مقارنة فورية توفّر فلوسك' },
                  { icon: Zap, text: 'خطة ذكية تختار الأوفر تلقائياً' },
                  { icon: ShieldCheck, text: 'تقييم وموثوقية كل موزّع' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Icon size={12} className="text-emerald-500 shrink-0" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cart buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Manual cart */}
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="relative flex items-center gap-2 px-4 py-2.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              <ShoppingCart size={16} />
              سلة الشراء
              {manualCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center
                  rounded-full bg-gray-700 text-white text-[10px] font-bold px-1">
                  {manualCount}
                </span>
              )}
            </button>
            {/* Smart plan cart */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="relative flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              <Zap size={16} />
              الخطة الذكية
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center
                  rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar: view toggle + supplier filter chip + search */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div className="inline-flex bg-gray-100 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => setView('products')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors
                ${view === 'products' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutGrid size={14} /> عرض المنتجات
            </button>
            <button
              type="button"
              onClick={() => setView('distributors')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors
                ${view === 'distributors' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Users size={14} /> عرض الموزّعين
            </button>
          </div>

          {/* Active supplier filter chip */}
          {supplierNameFilter && view === 'products' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
              <Store size={13} /> {supplierNameFilter}
              <button type="button" onClick={clearSupplierFilter} className="hover:text-emerald-900">
                <X size={13} />
              </button>
            </span>
          )}

          {/* Filters toggle (products only) */}
          {view === 'products' && (
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors
                ${filtersOpen || activeFilterCount > 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              <SlidersHorizontal size={14} /> تصفية
              {activeFilterCount > 0 && (
                <span className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-emerald-600 text-white text-[9px] font-bold px-1">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xl">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={view === 'distributors' ? 'ابحث عن موزّع…' : 'ابحث بالمنتج أو المورد…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9 py-2.5 w-full text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {!search && <VoiceMicButton onResult={setSearch} className="absolute right-3 top-1/2 -translate-y-1/2" />}
          </div>
        </div>
      </div>

      {/* ── DISTRIBUTORS MODE ─────────────────────────────────────────────────── */}
      {view === 'distributors' ? (
        distributorsQuery.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-44 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : distributorsQuery.isError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            فشل تحميل قائمة الموزّعين — يرجى المحاولة مرة أخرى.
          </div>
        ) : (
          (() => {
            const q = debouncedSearch.trim().toLowerCase()
            const distributors = (distributorsQuery.data ?? []).filter(
              (d) => !q || d.companyName.toLowerCase().includes(q) || (d.address ?? '').toLowerCase().includes(q),
            )
            if (distributors.length === 0) {
              return (
                <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 mx-auto mb-3 flex items-center justify-center">
                    <Users size={26} className="text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-gray-800 text-sm">لا يوجد موزّعون مطابقون</h3>
                  <p className="text-xs text-gray-500 mt-1">جرّب كلمة بحث أخرى.</p>
                </div>
              )
            }
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                {distributors.map((card) => (
                  <DistributorCard key={card.id} card={card} onOpen={() => openDistributor(card)} />
                ))}
              </div>
            )
          })()
        )
      ) : (
        /* ── PRODUCTS MODE ──────────────────────────────────────────────────── */
        <div className="flex gap-5 items-start">
          {/* Filters sidebar */}
          {filtersOpen && (
            <aside className="w-64 shrink-0 bg-white border border-gray-200 rounded-2xl p-4 space-y-4 sticky top-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">تصفية</h3>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="text-[11px] font-semibold text-emerald-600 hover:underline"
                  >
                    مسح الكل
                  </button>
                )}
              </div>

              {/* Sort */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">الترتيب</label>
                <select
                  value={filters.sort}
                  onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}
                  className="w-full text-xs border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="relevance">الأكثر صلة</option>
                  <option value="price_asc">السعر: من الأقل</option>
                  <option value="price_desc">السعر: من الأعلى</option>
                  <option value="reliability">الموثوقية</option>
                </select>
              </div>

              {/* Category */}
              {categoryOptions.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-1 block">الفئة</label>
                  <select
                    value={filters.category ?? ''}
                    onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value || null }))}
                    className="w-full text-xs border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">الكل</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Manufacturer */}
              {manufacturerOptions.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-1 block">الشركة المصنّعة</label>
                  <select
                    value={filters.manufacturer ?? ''}
                    onChange={(e) => setFilters((f) => ({ ...f, manufacturer: e.target.value || null }))}
                    className="w-full text-xs border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">الكل</option>
                    {manufacturerOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Max price */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">السعر الأقصى (ج.م)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="بلا حد"
                  value={filters.maxPrice ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full text-xs border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* In stock only */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.inStockOnly}
                  onChange={(e) => setFilters((f) => ({ ...f, inStockOnly: e.target.checked }))}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs text-gray-700">المتوفر فقط</span>
              </label>
            </aside>
          )}

          {/* Product grid */}
          <div className="flex-1 min-w-0 space-y-4">
            {list.isError ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                فشل تحميل الكتالوج — يرجى المحاولة مرة أخرى.
              </div>
            ) : catalog.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 mx-auto mb-3 flex items-center justify-center">
                  <Package size={26} className="text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-800 text-sm">لا توجد منتجات مطابقة</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {activeFilterCount > 0 ? 'جرّب تخفيف عوامل التصفية.' : 'جرّب البحث بكلمة أخرى أو وسّع نطاق التصفية.'}
                </p>
              </div>
            ) : (
              <>
                <div className={`grid grid-cols-2 sm:grid-cols-3 ${filtersOpen ? 'lg:grid-cols-3 2xl:grid-cols-4' : 'lg:grid-cols-4 2xl:grid-cols-5'} gap-4`}>
                  {catalog.map((row: any) => (
                    <ProductCard
                      key={row.id}
                      row={row}
                      qty={getQty(row.id)}
                      setQty={(v) => setQty(row.id, v)}
                      smartLoading={addingId === row.product.id}
                      inSmartPlan={productsInCart.has(row.product?.id)}
                      inManualCart={manualProductIds.has(row.product?.id)}
                      onSmartPlan={() => {
                        setAddingId(row.product.id)
                        addToCartMutation.mutate({ productId: row.product.id, qty: getQty(row.id) })
                      }}
                      onAddManual={() => {
                        addManualItem(
                          {
                            supplierTenantId: row.supplierTenantId,
                            supplierName: row.supplierTenant?.name || 'موزّع',
                          },
                          {
                            productId: row.product.id,
                            productName: row.product?.name || 'منتج',
                            unitPrice: Number(row.price),
                            currency: row.currency || 'ج.م',
                            qty: getQty(row.id),
                            maxStock: row.stock ?? 9999,
                            imageUrl: row.product?.imageUrl ?? row.imageUrl ?? null,
                          },
                        )
                        setManualOpen(true)
                      }}
                      onCompare={() => setCompareFor(row)}
                    />
                  ))}
                </div>
                <Pagination
                  page={list.page}
                  pageSize={list.pageSize}
                  total={list.total}
                  totalPages={list.totalPages}
                  onPageChange={list.setPage}
                  onPageSizeChange={list.setPageSize}
                  isLoading={list.isFetching}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Smart-plan cart drawer */}
      <ProcurementCartDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Manual cart drawer */}
      <ManualCartDrawer open={manualOpen} onClose={() => setManualOpen(false)} />

      {/* Compare sources modal */}
      {compareFor && (
        <CompareSourcesModal
          productId={compareFor.product.id}
          productName={compareFor.product?.name || 'منتج'}
          qty={getQty(compareFor.id)}
          currentSupplierName={compareFor.supplierTenant?.name || 'الموزّع'}
          currentUnitPrice={Number(compareFor.price)}
          currency={compareFor.currency || 'ج.م'}
          onClose={() => setCompareFor(null)}
          onTakeSmart={() => {
            setAddingId(compareFor.product.id)
            addToCartMutation.mutate({ productId: compareFor.product.id, qty: getQty(compareFor.id) })
            setCompareFor(null)
          }}
          onKeepManual={() => {
            addManualItem(
              {
                supplierTenantId: compareFor.supplierTenantId,
                supplierName: compareFor.supplierTenant?.name || 'موزّع',
              },
              {
                productId: compareFor.product.id,
                productName: compareFor.product?.name || 'منتج',
                unitPrice: Number(compareFor.price),
                currency: compareFor.currency || 'ج.م',
                qty: getQty(compareFor.id),
                maxStock: compareFor.stock ?? 9999,
                imageUrl: compareFor.product?.imageUrl ?? compareFor.imageUrl ?? null,
              },
            )
            setCompareFor(null)
            setManualOpen(true)
          }}
        />
      )}
    </div>
  )
}

