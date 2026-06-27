import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  Clock,
  CreditCard,
  MapPin,
  Package,
  Shield,
  Star,
  TrendingUp,
  ExternalLink,
  Search,
  Sparkles,
  Filter as FilterIcon,
  X as XIcon,
  Wallet,
  Zap,
  Award,
  ChevronLeft,
} from 'lucide-react'
import clsx from 'clsx'
import { supplierApi, SupplierMarketplaceCard } from '../../api/supplier.api'

// ═════════════════════════════════════════════════════════════════════════════
// SUPPLIER MARKETPLACE PAGE
// ─────────────────────────────────────────────────────────────────────────────
// Aumet-class distributor browsing experience PLUS GX1 differentiators:
//   • AI procurement nudge — "let AI build your purchase plan"
//   • Credit-aware shopping — cash-risk banner that gates impulsive ordering
//   • Reliability ranking — derived from real fulfillment data, not stars only
//   • Single-click → distributor catalog (existing CatalogPage)
//
// Visual idiom matches the rest of the pharmacy console:
//   rounded-2xl cards, violet/emerald accents, Tailwind, RTL Arabic.
// ═════════════════════════════════════════════════════════════════════════════

// ─── Reliability badge ────────────────────────────────────────────────────────

function ReliabilityBadge({ label, score, size = 'md' }: { label: string | null; score: number | null; size?: 'sm' | 'md' }) {
  if (!label) return null
  const map: Record<string, { text: string; cls: string }> = {
    high:   { text: 'موثوق جداً',  cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    medium: { text: 'متوسط',       cls: 'bg-amber-100  text-amber-800  border-amber-200'  },
    low:    { text: 'ضعيف',        cls: 'bg-red-100    text-red-700    border-red-200'    },
  }
  const config = map[label] ?? map.medium
  const text = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
  // Postgres numeric columns arrive as strings via pg driver — coerce defensively.
  const numericScore = score == null ? null : Number(score)
  return (
    <span className={`inline-flex items-center gap-1 font-medium rounded-full border ${text} ${config.cls}`}>
      <Star className="w-3 h-3 fill-current" />
      {config.text}
      {numericScore !== null && Number.isFinite(numericScore) && (
        <span className="opacity-60 font-normal">({numericScore.toFixed(0)})</span>
      )}
    </span>
  )
}

// ─── Star rating bar (Aumet visual) ───────────────────────────────────────────

function RatingDisplay({ score, sample }: { score: number | null; sample?: number }) {
  if (score == null) return <span className="text-[11px] text-gray-400">جديد</span>
  const numericScore = Number(score)
  if (!Number.isFinite(numericScore)) return <span className="text-[11px] text-gray-400">جديد</span>
  const rating = (numericScore / 20).toFixed(1)  // 0–100 → 0–5
  return (
    <span className="inline-flex items-center gap-1 text-amber-600 text-[12px] font-semibold tabular-nums">
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      {rating}
      {sample != null && <span className="text-amber-500/70 font-normal">({sample})</span>}
    </span>
  )
}

// ─── Supplier logo (initials fallback) ────────────────────────────────────────

function SupplierLogo({ name }: { name: string }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || 'م'
  return (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
      {initials}
    </div>
  )
}

// ─── Supplier card (Aumet-style) ──────────────────────────────────────────────

function SupplierCard({
  supplier,
  featured,
}: { supplier: SupplierMarketplaceCard; featured?: boolean }) {
  const navigate = useNavigate()

  const onOpen = () => navigate(
    `/pharmacy/catalog?supplierId=${supplier.supplierTenantId}&supplierName=${encodeURIComponent(supplier.companyName)}`,
  )

  return (
    <div
      className={clsx(
        'group bg-white border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-all cursor-pointer',
        featured ? 'border-amber-300 ring-1 ring-amber-200/60' : 'border-gray-200 hover:border-emerald-400',
      )}
      onClick={onOpen}
    >
      {featured && (
        <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full self-start">
          <Award className="w-3 h-3" />
          موزع مميز
        </div>
      )}

      <div className="flex items-start gap-3">
        <SupplierLogo name={supplier.companyName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-gray-900 text-[15px] truncate">{supplier.companyName}</h3>
            {supplier.status === 'active' && (
              <Shield className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <RatingDisplay score={supplier.reliabilityScore} />
            <span className="text-[11px] text-gray-300">•</span>
            <span className="text-[11px] text-gray-500 truncate">
              الحد الأدنى:&nbsp;
              <span className="font-semibold text-gray-700 tabular-nums">
                {supplier.minOrderAmount?.toLocaleString('en-US') ?? '—'} ج.م
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
        {supplier.deliveryZones.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3 text-gray-400" />
            {supplier.deliveryZones.slice(0, 2).join(' · ')}
            {supplier.deliveryZones.length > 2 && (
              <span className="text-gray-400">+{supplier.deliveryZones.length - 2}</span>
            )}
          </span>
        )}
        {supplier.maxDeliveryDays != null && (
          <>
            <span className="text-gray-300">|</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3 text-gray-400" />
              {supplier.maxDeliveryDays} يوم
            </span>
          </>
        )}
        {supplier.paymentTerms && (
          <>
            <span className="text-gray-300">|</span>
            <span className="inline-flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-gray-400" />
              {supplier.paymentTerms}
            </span>
          </>
        )}
      </div>

      {/* Certifications & reliability */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ReliabilityBadge label={supplier.reliabilityLabel} score={supplier.reliabilityScore} size="sm" />
        {supplier.certifications.slice(0, 2).map((cert, i) => (
          <span key={i} className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
            {cert}
          </span>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={(e) => { e.stopPropagation(); onOpen() }}
        className="mt-auto w-full flex items-center justify-center gap-1.5 bg-white border border-emerald-500 text-emerald-700 hover:bg-emerald-50 text-[13px] font-semibold py-2 rounded-xl transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        استكشف الكتالوج
      </button>
    </div>
  )
}

// ─── Tabs (Aumet-style category strip) ────────────────────────────────────────

type TabKey = 'top' | 'all' | 'new' | 'offers' | 'high_trust' | 'fast_delivery'

const TABS: { key: TabKey; label: string; icon?: React.ElementType }[] = [
  { key: 'top',           label: 'الموزعون الأكثر طلباً', icon: TrendingUp },
  { key: 'all',           label: 'جميع الموزعين' },
  { key: 'high_trust',    label: 'الأعلى موثوقية',         icon: Shield     },
  { key: 'fast_delivery', label: 'توصيل سريع',             icon: Zap        },
  { key: 'new',           label: 'موزعون جدد'                                },
  { key: 'offers',        label: 'لديهم عروض'                                },
]

// ─── Sidebar filters ──────────────────────────────────────────────────────────

interface Filters {
  ratingMin: 0 | 4 | 4.5
  minOrderMax: number | null
  deliveryDaysMax: number | null
  payment: 'any' | 'cash' | 'credit'
}

const DEFAULT_FILTERS: Filters = {
  ratingMin: 0,
  minOrderMax: null,
  deliveryDaysMax: null,
  payment: 'any',
}

function FilterSidebar({
  filters, setFilters, maxMinOrder, onReset,
}: {
  filters: Filters
  setFilters: (f: Filters) => void
  maxMinOrder: number
  onReset: () => void
}) {
  return (
    <aside className="bg-white rounded-2xl border border-gray-200 p-4 space-y-5 lg:sticky lg:top-4 self-start">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
          <FilterIcon className="w-4 h-4 text-emerald-600" />
          عوامل التصفية
        </h3>
        <button
          onClick={onReset}
          className="text-[11px] text-emerald-700 hover:underline"
        >
          إعادة تعيين
        </button>
      </div>

      {/* Rating */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">التقييم</p>
        <div className="space-y-1.5">
          {([
            { v: 0,   label: 'الكل'      },
            { v: 4.5, label: '4.5+ نجوم' },
            { v: 4,   label: '4.0+ نجوم' },
          ] as const).map(opt => (
            <label key={opt.v} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
              <input
                type="radio"
                name="rating"
                checked={filters.ratingMin === opt.v}
                onChange={() => setFilters({ ...filters, ratingMin: opt.v })}
                className="accent-emerald-600"
              />
              <span className="text-gray-700">{opt.label}</span>
              {opt.v > 0 && (
                <Star className="w-3 h-3 fill-amber-400 text-amber-400 ms-auto" />
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Min order range */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">الحد الأدنى للطلب</p>
        <input
          type="range"
          min={0}
          max={maxMinOrder || 10000}
          step={500}
          value={filters.minOrderMax ?? maxMinOrder}
          onChange={e => setFilters({ ...filters, minOrderMax: Number(e.target.value) })}
          className="w-full accent-emerald-600"
        />
        <div className="flex justify-between text-[10px] text-gray-500 mt-1 tabular-nums">
          <span>{(filters.minOrderMax ?? maxMinOrder).toLocaleString('en-US')} ج.م</span>
          <span>0 ج.م</span>
        </div>
      </div>

      {/* Payment method */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">طريقة الدفع</p>
        <div className="space-y-1.5">
          {([
            { v: 'any',    label: 'الكل'        },
            { v: 'cash',   label: 'كاش'         },
            { v: 'credit', label: 'بطاقة/آجل'   },
          ] as const).map(opt => (
            <label key={opt.v} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
              <input
                type="radio"
                name="payment"
                checked={filters.payment === opt.v}
                onChange={() => setFilters({ ...filters, payment: opt.v })}
                className="accent-emerald-600"
              />
              <span className="text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Delivery time */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">سرعة التوصيل</p>
        <div className="space-y-1.5">
          {([
            { v: null, label: 'أي وقت'   },
            { v: 1,    label: '≤ 1 يوم'  },
            { v: 3,    label: '≤ 3 أيام' },
            { v: 7,    label: '≤ أسبوع'  },
          ] as const).map(opt => (
            <label key={String(opt.v)} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
              <input
                type="radio"
                name="delivery"
                checked={filters.deliveryDaysMax === opt.v}
                onChange={() => setFilters({ ...filters, deliveryDaysMax: opt.v })}
                className="accent-emerald-600"
              />
              <span className="text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    </aside>
  )
}

// ─── AI procurement nudge (GX1 differentiator) ────────────────────────────────

function AiProcurementNudge() {
  return (
    <Link
      to="/pharmacy/ai-center?tab=tasks&task=purchase"
      className="block bg-gradient-to-l from-emerald-600 via-emerald-700 to-teal-700 text-white rounded-2xl p-4 shadow-md hover:shadow-lg transition-shadow"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm">دع الذكاء الاصطناعي يبني خطة شراء لك</h3>
          <p className="text-[11px] text-white/80 mt-0.5">
            بدلاً من تصفح المستودعات يدوياً — نحلل مخزونك، نتوقع طلبك، نقارن الأسعار والائتمان وننشئ طلبات شراء جاهزة للموافقة.
          </p>
        </div>
        <ChevronLeft className="w-5 h-5 shrink-0" />
      </div>
    </Link>
  )
}

// ─── Financial-health banner (credit-aware shopping) ─────────────────────────

function FinancialHealthBanner() {
  const { data } = useQuery({
    queryKey: ['supplier-marketplace', 'finance-health'],
    queryFn: () => supplierApi.getFinancialHealthSnapshot().then(r => r.data),
    staleTime: 5 * 60_000,
    retry: false,
  })

  if (!data) return null
  const { cashRisk, utilizationRate, creditLimit, utilizedCredit, alerts } = data
  const remaining = Math.max(0, creditLimit - utilizedCredit)

  // Only show when there's something meaningful to communicate.
  if (!cashRisk && utilizationRate < 0.5 && alerts.length === 0) return null

  const tone = cashRisk
    ? 'border-red-200 bg-red-50 text-red-800'
    : utilizationRate >= 0.7
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800'

  return (
    <div className={`rounded-2xl border p-3.5 text-xs flex items-center gap-3 ${tone}`}>
      <Wallet className="w-5 h-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[13px]">
          {cashRisk
            ? 'تنبيه مالي — راجع وضعك قبل إضافة طلبات جديدة'
            : 'وضعك المالي'}
        </p>
        <p className="opacity-80 mt-0.5">
          الائتمان المتاح:&nbsp;
          <span className="font-semibold tabular-nums">{remaining.toLocaleString('en-US')} ج.م</span>
          &nbsp;من&nbsp;
          <span className="tabular-nums">{creditLimit.toLocaleString('en-US')}</span>
          &nbsp;ج.م — استخدام&nbsp;
          <span className="font-semibold tabular-nums">{(utilizationRate * 100).toFixed(0)}%</span>
          {alerts[0] && <> · {alerts[0]}</>}
        </p>
      </div>
      <Link
        to="/pharmacy/purchases/wishlist"
        className="text-[11px] font-semibold underline hover:no-underline shrink-0"
      >
        راجع قائمة الشراء
      </Link>
    </div>
  )
}

// ─── Tab filter logic ─────────────────────────────────────────────────────────

const NEW_SUPPLIER_DAYS = 30

function applyTab(cards: SupplierMarketplaceCard[], tab: TabKey): SupplierMarketplaceCard[] {
  switch (tab) {
    case 'top':
      return [...cards].sort((a, b) => (b.reliabilityScore ?? 0) - (a.reliabilityScore ?? 0))
    case 'high_trust':
      return cards.filter(c => c.reliabilityLabel === 'high')
    case 'fast_delivery':
      return cards.filter(c => (c.maxDeliveryDays ?? 999) <= 3)
    case 'new': {
      const cutoff = Date.now() - NEW_SUPPLIER_DAYS * 86_400_000
      return cards.filter(c => c.verifiedAt && new Date(c.verifiedAt).getTime() >= cutoff)
    }
    case 'offers':
      // Placeholder — no per-supplier offers signal yet. Will fill once
      // catalog discount aggregate endpoint lands.
      return []
    case 'all':
    default:
      return cards
  }
}

function applyFilters(cards: SupplierMarketplaceCard[], f: Filters): SupplierMarketplaceCard[] {
  return cards.filter(c => {
    if (f.ratingMin > 0) {
      const r = (c.reliabilityScore ?? 0) / 20
      if (r < f.ratingMin) return false
    }
    if (f.minOrderMax != null && (c.minOrderAmount ?? 0) > f.minOrderMax) return false
    if (f.deliveryDaysMax != null && (c.maxDeliveryDays ?? 999) > f.deliveryDaysMax) return false
    if (f.payment !== 'any' && c.paymentTerms) {
      const terms = c.paymentTerms.toLowerCase()
      if (f.payment === 'cash'   && !/cash|كاش|نقد/.test(terms)) return false
      if (f.payment === 'credit' && !/credit|آجل|بطاق/.test(terms)) return false
    }
    return true
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function SupplierMarketplacePage() {
  const [tab, setTab] = useState<TabKey>('top')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-marketplace'],
    queryFn: () => supplierApi.getMarketplace({ limit: 200 }).then(r => r.data),
    staleTime: 5 * 60_000,
  })

  const all = data?.data ?? []

  const maxMinOrder = useMemo(
    () => Math.max(10_000, ...all.map(s => s.minOrderAmount ?? 0)),
    [all],
  )

  const visible = useMemo(() => {
    let list = applyTab(all, tab)
    list = applyFilters(list, filters)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.companyName.toLowerCase().includes(q) ||
        c.deliveryZones.some(z => z.toLowerCase().includes(q)) ||
        c.certifications.some(z => z.toLowerCase().includes(q)),
      )
    }
    return list
  }, [all, tab, filters, search])

  // Featured = top 2 high-trust suppliers shown on the All/Top tabs.
  const featured = useMemo(() => {
    if (tab !== 'top' && tab !== 'all') return []
    return [...all]
      .filter(c => c.reliabilityLabel === 'high')
      .sort((a, b) => (b.reliabilityScore ?? 0) - (a.reliabilityScore ?? 0))
      .slice(0, 2)
  }, [all, tab])

  const activeFilterCount =
    (filters.ratingMin > 0 ? 1 : 0) +
    (filters.minOrderMax != null && filters.minOrderMax < maxMinOrder ? 1 : 0) +
    (filters.deliveryDaysMax != null ? 1 : 0) +
    (filters.payment !== 'any' ? 1 : 0)

  return (
    <div className="w-full" dir="rtl">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-600" />
            سوق الموزعين والمستودعات
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {isLoading
              ? 'جارٍ التحميل…'
              : `${all.length} موزع معتمد · يحدّث الذكاء ترتيبهم حسب موثوقيتهم وأسعار السوق.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/pharmacy/purchases/wishlist"
            className="px-3 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium flex items-center gap-2"
          >
            <Package className="w-4 h-4" />
            قائمة الشراء
          </Link>
        </div>
      </div>

      {/* ── AI nudge + financial banner (GX1 differentiators) ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        <AiProcurementNudge />
        <FinancialHealthBanner />
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="ابحث عن موزع أو منطقة أو شهادة…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white border border-gray-300 rounded-2xl pr-10 pl-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Tab strip ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border',
                active
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300',
              )}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Body: grid + sidebar (sidebar on visual LEFT in RTL → 2nd column) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-5">
        <div className="space-y-5 order-2 lg:order-1">
          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-gray-500">عوامل تصفية نشطة:</span>
              {filters.ratingMin > 0 && (
                <FilterChip onClear={() => setFilters({ ...filters, ratingMin: 0 })}>
                  {filters.ratingMin}+ ⭐
                </FilterChip>
              )}
              {filters.deliveryDaysMax != null && (
                <FilterChip onClear={() => setFilters({ ...filters, deliveryDaysMax: null })}>
                  ≤ {filters.deliveryDaysMax} يوم
                </FilterChip>
              )}
              {filters.payment !== 'any' && (
                <FilterChip onClear={() => setFilters({ ...filters, payment: 'any' })}>
                  {filters.payment === 'cash' ? 'كاش' : 'بطاقة/آجل'}
                </FilterChip>
              )}
              {filters.minOrderMax != null && filters.minOrderMax < maxMinOrder && (
                <FilterChip onClear={() => setFilters({ ...filters, minOrderMax: null })}>
                  حد أدنى ≤ {filters.minOrderMax.toLocaleString('en-US')}
                </FilterChip>
              )}
            </div>
          )}

          {/* Featured row (only on top/all tabs) */}
          {featured.length > 0 && !search && (
            <section>
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-amber-500" />
                موزعون مميزون لك
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {featured.map(s => (
                  <SupplierCard key={`f-${s.supplierTenantId}`} supplier={s} featured />
                ))}
              </div>
            </section>
          )}

          {/* Main grid */}
          <section>
            <h2 className="text-sm font-bold text-gray-900 mb-3">
              {TABS.find(t => t.key === tab)?.label ?? 'الكل'}
              <span className="text-gray-400 font-normal ms-2">
                ({visible.length})
              </span>
            </h2>

            {isLoading ? (
              <SupplierGridSkeleton />
            ) : visible.length === 0 ? (
              <EmptyState tab={tab} search={search} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                {visible.map(s => (
                  <SupplierCard key={s.supplierTenantId} supplier={s} />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="order-1 lg:order-2">
          <FilterSidebar
            filters={filters}
            setFilters={setFilters}
            maxMinOrder={maxMinOrder}
            onReset={() => setFilters(DEFAULT_FILTERS)}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FilterChip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
      {children}
      <button
        onClick={onClear}
        className="text-emerald-500 hover:text-emerald-900"
        aria-label="إزالة"
      >
        <XIcon className="w-3 h-3" />
      </button>
    </span>
  )
}

function SupplierGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 animate-pulse h-44">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-2/3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
          <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
          <div className="h-8 bg-gray-100 rounded-xl" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ tab, search }: { tab: TabKey; search: string }) {
  const isOffersTab = tab === 'offers'
  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 mx-auto mb-3 flex items-center justify-center">
        <Building2 className="w-6 h-6 text-gray-400" />
      </div>
      <h3 className="font-semibold text-gray-800 text-sm">
        {isOffersTab
          ? 'لا توجد عروض نشطة حالياً'
          : search
            ? 'لا توجد نتائج مطابقة'
            : 'لا يوجد موزعون يطابقون عوامل التصفية'}
      </h3>
      <p className="text-xs text-gray-500 mt-1">
        {isOffersTab
          ? 'سيظهر هنا الموزعون الذين يطلقون عروضاً سعرية على كتالوجهم.'
          : 'جرّب توسيع نطاق التصفية أو ابحث بكلمة أخرى.'}
      </p>
    </div>
  )
}
