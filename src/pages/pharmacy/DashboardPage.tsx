import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { useState } from 'react'
import {
  Package, AlertTriangle, ShoppingCart, Sparkles, Loader2, ArrowUpRight,
  TrendingUp, TrendingDown, Clock, ShieldCheck, ChevronLeft,
  Wallet, LineChart, Store, Tag, ArrowDownRight, Zap, Receipt, Users,
  PackageSearch, Boxes, BadgePercent, Building2, Truck, Network,
  Megaphone, Inbox, PackageX, Star, Award, CalendarClock,
  type LucideIcon,
} from 'lucide-react'
import { inventoryApi } from '../../api/inventory.api'
import { ordersApi } from '../../api/orders.api'
import { aiCenterApi } from '../../api/ai-center.api'
import { analyticsApi } from '../../api/analytics.api'
import { forecastingApi } from '../../api/forecasting.api'
import { procurementApi, type OrchestratorResult } from '../../api/procurement.api'
import { supplierApi, type FinancialHealthSnapshot, type SupplierMarketplaceCard } from '../../api/supplier.api'
import { p2pMarketplaceApi, p2pSellerApi } from '../../api/p2p.api'
import { ProcurementCartDrawer } from '../../components/pharmacy/ProcurementCartDrawer'
import type { ProcurementOpportunity, ExpiryAlert, MarketplaceResult } from '../../types/p2p'
import type { InventoryItem, Order } from '../../types'

interface QueueDraft {
  id: string
  supplierTenantId: string
  productId: string
  suggestedQuantity: number
  unitPrice: number
  currency: string
  urgencyLevel: 'critical' | 'high' | 'medium'
  status: string
  expiresAt: string
  sourceType: string
  planSnapshot: OrchestratorResult | null
}
interface QueueResponse {
  criticalDrafts: QueueDraft[]
  expiringStock: unknown[]
  pendingOrders: unknown[]
}

// shared react-query options — light caching keeps the dashboard snappy at scale
const CACHE = { staleTime: 60_000, gcTime: 5 * 60_000 } as const
const LIST = 10 // tables render up to 10 rows
const SCROLL =
  'max-h-[228px] overflow-y-auto pe-1 ' +
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 ' +
  'hover:[&::-webkit-scrollbar-thumb]:bg-emerald-300 [&::-webkit-scrollbar-thumb]:transition-colors ' +
  '[scrollbar-width:thin] [scrollbar-color:theme(colors.gray.200)_transparent]' // scrolls only when content overflows; no reserved gutter

const money = (n: number, c: string) =>
  `${Math.round(n).toLocaleString('en-US')} ${c}`

const REL: Record<string, { cls: string; key: string }> = {
  high:   { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', key: 'dashboard.rel_high' },
  medium: { cls: 'bg-teal-50 text-teal-700 ring-teal-200',          key: 'dashboard.rel_medium' },
  low:    { cls: 'bg-amber-50 text-amber-700 ring-amber-200',       key: 'dashboard.rel_low' },
}

// ── shared shells ───────────────────────────────────────────────────────────

function SectionCard({
  title, icon: Icon, iconClass = 'text-emerald-600', action, children, className = '',
}: {
  title: string
  icon: LucideIcon
  iconClass?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-200 p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Icon size={18} className={iconClass} />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Skeleton({ className = 'h-28' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-2xl ${className}`} />
}

// ── Seasonal demand radar ────────────────────────────────────────────────────
// Driven by the Hijri calendar, so it works from day one with zero sales history.
// Fails silent (retry:false) and only renders when an event is active/upcoming.
const SEASON_CATEGORY_AR: Record<string, string> = {
  analgesics: 'مسكنات', antibiotics: 'مضادات حيوية', antipyretics: 'خافضات حرارة',
  cold_flu: 'برد وإنفلونزا', vitamins: 'فيتامينات', supplements: 'مكملات',
  hydration: 'محاليل ومعالجة جفاف', dermatology: 'جلدية', sunscreen: 'واقيات شمس',
  antihistamines: 'مضادات حساسية', digestive: 'جهاز هضمي', first_aid: 'إسعافات أولية',
  chronic: 'أمراض مزمنة', pediatric: 'أطفال', respiratory: 'جهاز تنفسي',
}
const seasonCategoryAr = (k: string) =>
  SEASON_CATEGORY_AR[k] ?? k.replace(/_/g, ' ')

interface SeasonCat { category: string; multiplier: number; upliftPct: number }
interface SeasonInfo { event: string; arabicName: string; daysUntil?: number; categories: SeasonCat[] }

function SeasonalRadarBanner() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['dashboard-seasonality'],
    queryFn: () => forecastingApi.getSeasonality().then((r) => r.data as { active: SeasonInfo | null; upcoming: SeasonInfo | null }),
    staleTime: 6 * 60 * 60_000,
    retry: false,
  })
  if (!data) return null

  const active = data.active && data.active.categories.length > 0 ? data.active : null
  const upcoming = !active && data.upcoming && data.upcoming.categories.length > 0 ? data.upcoming : null
  const season = active ?? upcoming
  if (!season) return null

  const isUpcoming = !active
  const topCats = season.categories.slice(0, 4)

  return (
    <button
      onClick={() => navigate('/pharmacy/forecast')}
      className={`w-full text-start p-4 rounded-2xl border flex items-start gap-4 transition-all hover:shadow-md ${
        isUpcoming
          ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-white hover:border-amber-300'
          : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white hover:border-emerald-300'
      }`}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
        isUpcoming ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
      }`}>
        <CalendarClock size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${isUpcoming ? 'text-amber-900' : 'text-emerald-900'}`}>
          {isUpcoming
            ? `موسم ${season.arabicName} يبدأ خلال ${season.daysUntil} يوم — استعد الآن`
            : `موسم ${season.arabicName} نشط الآن — ارتفاع متوقع في الطلب`}
        </p>
        <p className={`text-[11px] mt-0.5 leading-relaxed ${isUpcoming ? 'text-amber-700/80' : 'text-emerald-700/80'}`}>
          {isUpcoming
            ? 'يُنصح برفع مخزون الفئات التالية مبكراً لتفادي النقص:'
            : 'تأكد من توفّر مخزون كافٍ من الفئات الأكثر طلباً هذا الموسم:'}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {topCats.map((c) => (
            <span
              key={c.category}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isUpcoming ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {seasonCategoryAr(c.category)} +{c.upliftPct}%
            </span>
          ))}
        </div>
      </div>
      <ChevronLeft size={14} className={`shrink-0 rtl:rotate-180 ${isUpcoming ? 'text-amber-300' : 'text-emerald-300'}`} />
    </button>
  )
}

// friendly empty state: muted icon in a circle + title + optional hint
function EmptyState({
  icon: Icon, title, hint,
}: {
  icon: LucideIcon
  title: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4">
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300 ring-1 ring-gray-100">
        <Icon size={22} />
      </span>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {hint && <p className="text-xs text-gray-400 mt-1 max-w-[36ch]">{hint}</p>}
    </div>
  )
}

// circular brand avatar — initials over a deterministic emerald/teal tint
const AVATAR_TINTS = [
  'bg-emerald-100 text-emerald-700',
  'bg-teal-100 text-teal-700',
  'bg-cyan-100 text-cyan-700',
  'bg-lime-100 text-lime-700',
  'bg-green-100 text-green-700',
]
function Avatar({ name }: { name: string }) {
  const clean = (name || '?').trim()
  const initials = clean
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?'
  let hash = 0
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0
  const tint = AVATAR_TINTS[hash % AVATAR_TINTS.length]
  return (
    <span
      className={`inline-flex h-20 w-20 items-center justify-center rounded-full ring-1 ring-gray-100 shadow-sm text-xl font-bold transition-transform group-hover:scale-105 ${tint}`}
    >
      {initials}
    </span>
  )
}

// ── page ────────────────────────────────────────────────────────────────────

export default function PharmacyDashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currency = t('common.currency')
  const [period, setPeriod] = useState<'month' | 'week' | 'year'>('month')

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['dashboard-overview', period],
    queryFn: () => analyticsApi.getDashboardOverview(period),
    ...CACHE,
  })
  const { data: queue } = useQuery({
    queryKey: ['procurement-queue'],
    queryFn: () => procurementApi.getQueue().then((r) => r.data as QueueResponse),
    ...CACHE,
  })
  const { data: finance, isLoading: financeLoading } = useQuery({
    queryKey: ['finance-health-snapshot'],
    queryFn: () => supplierApi.getFinancialHealthSnapshot().then((r) => r.data as FinancialHealthSnapshot),
    ...CACHE,
  })
  const { data: marketIntel } = useQuery({
    queryKey: ['p2p-market-intelligence'],
    queryFn: () => p2pMarketplaceApi.getIntelligence(),
    ...CACHE,
  })
  const { data: buyOpps } = useQuery({
    queryKey: ['p2p-procurement-opportunities'],
    queryFn: () => p2pMarketplaceApi.getProcurementOpportunities({ limit: LIST }),
    ...CACHE,
  })
  const { data: offersData } = useQuery({
    queryKey: ['p2p-offers'],
    queryFn: () => p2pMarketplaceApi.search({ limit: 24 }).then((r) => r.data),
    ...CACHE,
  })
  const { data: distributorsData } = useQuery({
    queryKey: ['supplier-marketplace', 'dashboard'],
    queryFn: () => supplierApi.getMarketplace({ limit: LIST }).then((r) => r.data?.data ?? []),
    ...CACHE,
  })
  const { data: expiryAlerts } = useQuery({
    queryKey: ['p2p-expiry-alerts'],
    queryFn: () => p2pSellerApi.getExpiryAlerts(),
    ...CACHE,
  })
  const { data: lowStockData } = useQuery({
    queryKey: ['inventory', 'low-stock', 'dashboard'],
    queryFn: () => inventoryApi.getLowStock({ limit: LIST }).then((r: any) => r.data?.data ?? r.data),
    ...CACHE,
  })
  const { data: ordersData } = useQuery({
    queryKey: ['orders', 'dashboard'],
    queryFn: () => ordersApi.getAll({ take: LIST }).then((r) => r.data),
    ...CACHE,
  })
  const { data: pendingApprovalsData } = useQuery({
    queryKey: ['ai-center', 'pending-approvals', 'dashboard'],
    queryFn: () => aiCenterApi.listApprovals({ status: 'pending', limit: LIST }),
    ...CACHE,
  })
  const { data: topSuppliersData } = useQuery({
    queryKey: ['procurement-summary', 'top-suppliers'],
    queryFn: () => {
      const to = new Date()
      const from = new Date()
      from.setMonth(from.getMonth() - 12)
      return analyticsApi.getProcurementSummary({
        dateFrom: from.toISOString().slice(0, 10),
        dateTo: to.toISOString().slice(0, 10),
      })
    },
    ...CACHE,
  })

  const generateMutation = useMutation({
    mutationFn: () => aiCenterApi.generate(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-center'] })
      qc.invalidateQueries({ queryKey: ['procurement-queue'] })
      qc.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
  })

  // Unified procurement cart: "reorder" / "add to cart" / "smart plan" all funnel
  // through the AI orchestrator, which picks the best source (supplier vs P2P),
  // then we open the cart drawer so the user reviews the plan and checks out.
  const [cartOpen, setCartOpen] = useState(false)
  const addToCartMutation = useMutation({
    mutationFn: ({ productId, qty }: { productId: string; qty: number }) =>
      procurementApi.addToCart(productId, qty),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-cart'] })
      setCartOpen(true)
    },
  })
  const reviewInCart = (productId: string, qty: number) =>
    addToCartMutation.mutate({ productId, qty: Math.max(1, Math.round(qty)) })

  const drafts = queue?.criticalDrafts ?? []
  const draftProductIds = new Set(drafts.map((d) => d.productId))
  const lowStock: InventoryItem[] = lowStockData || []
  const orders: Order[] = (ordersData as any)?.data ?? ordersData ?? []
  const distributors: SupplierMarketplaceCard[] = distributorsData ?? []
  const offers = ((offersData ?? []) as MarketplaceResult[])
    .filter((r) => r.listing?.offerType && r.listing.offerType !== 'none')
    .slice(0, LIST)

  const sellOps = (expiryAlerts ?? []).filter((a) => !a.alreadyListed).slice(0, LIST)
  const overpaying = drafts.filter((d) => d.planSnapshot?.overpaymentRecommendation).length
  const waitCount = drafts.filter((d) => d.planSnapshot?.delayRecommendation).length
  const topSuppliers = (topSuppliersData?.topSuppliers ?? []).filter((s) => s.orderCount > 0).slice(0, 12)
  const topProducts = (overview?.topProducts ?? [])
  const myCity = marketIntel?.resolvedCity ?? null
  const bestInCity = (marketIntel?.topProductsInCity ?? [])
  const pendingTasks = (pendingApprovalsData?.data ?? []).slice(0, LIST)

  const ai = overview?.aiImpact
  const sales = overview?.sales

  return (
    <div className="space-y-6 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{t('dashboard.subtitle')}</p>
        </div>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
        >
          {generateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {generateMutation.isPending ? t('dashboard.generating') : t('dashboard.generate_ai')}
        </button>
      </div>

      {/* A. AI savings hero */}
      {overviewLoading ? (
        <Skeleton className="h-36" />
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-600 via-emerald-600 to-teal-700 p-6 text-white shadow-lg">
          <Sparkles className="absolute -top-4 -left-4 opacity-10" size={140} />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <p className="text-emerald-100 text-sm font-medium">{t('dashboard.ai_saved_you')}</p>
              <p className="text-4xl font-extrabold mt-1 tracking-tight">
                {money(ai?.savingsThisPeriodEgp ?? 0, currency)}
              </p>
              <p className="text-emerald-200 text-xs mt-1">
                {t(`dashboard.period_${period}`)} · {t('dashboard.ai_saved_caption')}
              </p>
            </div>
            <div className="flex items-stretch gap-3">
              <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 min-w-[120px]">
                <div className="flex items-center gap-1.5 text-emerald-100 text-xs">
                  <Zap size={13} /> {t('dashboard.automated_actions')}
                </div>
                <p className="text-2xl font-bold mt-1">{ai?.actionsExecutedThisPeriod ?? 0}</p>
              </div>
              <button
                onClick={() => navigate('/pharmacy/ai-center')}
                className="bg-white/10 hover:bg-white/20 transition-colors backdrop-blur rounded-xl px-4 py-3 min-w-[120px] text-right"
              >
                <div className="flex items-center gap-1.5 text-emerald-100 text-xs">
                  <ShieldCheck size={13} /> {t('dashboard.pending_your_approval')}
                </div>
                <p className="text-2xl font-bold mt-1">{ai?.pendingApprovals ?? 0}</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seasonal demand radar — Hijri-driven, works from day one */}
      <SeasonalRadarBanner />

      {/* Near-expiry loss alert — actionable */}
      {finance && finance.nearExpiryValue > 0 && (
        <Link
          to="/pharmacy/p2p"
          className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100/70 transition-colors"
        >
          <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <AlertTriangle size={22} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              {t('dashboard.expiry_loss_banner', { value: money(finance.nearExpiryValue, currency) })}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">{t('dashboard.expiry_loss_hint')}</p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-600 text-white text-xs font-medium px-3 py-2">
            {t('dashboard.expiry_loss_cta')} <ChevronLeft size={14} />
          </span>
        </Link>
      )}

      {/* C. Business pulse KPIs */}
      <SectionCard
        title={t('dashboard.business_pulse')}
        icon={TrendingUp}
        iconClass="text-teal-600"
        action={
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
            {(['month', 'week', 'year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {t(`dashboard.period_${p}`)}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile icon={Receipt} label={t('dashboard.total_sales')} value={money(sales?.totalSales ?? 0, currency)}
            delta={sales?.deltaPct ?? null} loading={overviewLoading} />
          <KpiTile icon={Wallet} label={t('dashboard.net_profit')} value={money(sales?.netProfit ?? 0, currency)}
            loading={overviewLoading} accent="text-emerald-600" />
          <KpiTile icon={ShoppingCart} label={t('dashboard.invoices')} value={(sales?.invoiceCount ?? 0).toLocaleString('en-US')}
            loading={overviewLoading} />
          <KpiTile icon={Users} label={t('dashboard.customers')} value={(sales?.customerCount ?? 0).toLocaleString('en-US')}
            loading={overviewLoading} />
        </div>
      </SectionCard>

      {/* C2. Best sellers — my pharmacy + my city, side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My pharmacy best sellers */}
        <SectionCard title={t('dashboard.top_products_title')} icon={BadgePercent} iconClass="text-emerald-600">
          {overviewLoading ? (
            <Skeleton className="h-24" />
          ) : topProducts.length === 0 ? (
            <EmptyState icon={BadgePercent} title={t('dashboard.top_products_empty')} />
          ) : (
            <ul className={`space-y-2 ${SCROLL}`}>
              {topProducts.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3 text-sm">
                  <span className={`w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-full text-xs font-bold ${
                    i < 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
                  }`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-gray-800 font-medium">{p.productName || p.productId.slice(0, 8)}</p>
                    <p className="text-xs text-gray-400">
                      {t('dashboard.units_sold', { count: p.qtySold })} · <span className="text-emerald-700 font-semibold">{money(p.revenue, currency)}</span>
                    </p>
                  </div>
                  <Link
                    to={`/pharmacy/inventory?q=${encodeURIComponent(p.productName || '')}`}
                    className="shrink-0 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-medium px-3 py-1.5 transition-colors"
                  >
                    {t('dashboard.btn_view')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Best-selling in my city (other sellers) */}
        <SectionCard
          title={myCity ? t('dashboard.best_in_city_title', { city: myCity }) : t('dashboard.best_in_city_title_generic')}
          icon={Store}
          iconClass="text-teal-600"
        >
          {!myCity ? (
            <EmptyState icon={Store} title={t('dashboard.best_in_city_no_city')} hint={t('dashboard.best_in_city_subtitle')} />
          ) : bestInCity.length === 0 ? (
            <EmptyState icon={Store} title={t('dashboard.best_in_city_empty')} hint={t('dashboard.best_in_city_subtitle')} />
          ) : (
            <>
              <p className="text-xs text-gray-400 -mt-2 mb-3">{t('dashboard.best_in_city_subtitle')}</p>
              <ul className={`space-y-2 ${SCROLL}`}>
                {bestInCity.map((p, i) => (
                  <li key={p.productId} className="flex items-center gap-3 text-sm">
                    <span className={`w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-full text-xs font-bold ${
                      i < 3 ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'
                    }`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-gray-800 font-medium">{p.productNameAr || p.productName || p.productId.slice(0, 8)}</p>
                      <p className="text-xs text-gray-400">
                        {t('dashboard.units_sold', { count: p.unitsSold })} · {t('dashboard.in_pharmacies', { count: p.pharmacyCount })}
                      </p>
                    </div>
                    <Link
                      to="/pharmacy/p2p"
                      className="shrink-0 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 transition-colors"
                    >
                      {t('dashboard.btn_view_offers')}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      </div>

      {/* D. Price intel + Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title={t('dashboard.price_intel_title')}
          icon={LineChart}
          iconClass="text-teal-600"
          action={
            <Link to="/pharmacy/price-intelligence" className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              {t('dashboard.view_price_intel')}
            </Link>
          }
        >
          {overpaying === 0 && waitCount === 0 ? (
            <EmptyState icon={LineChart} title={t('dashboard.price_intel_empty')} />
          ) : (
            <ul className="space-y-2.5">
              {overpaying > 0 && (
                <li className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="p-1.5 rounded-lg bg-red-50 text-red-600"><ArrowUpRight size={14} /></span>
                  {t('dashboard.overpaying_count', { count: overpaying })}
                </li>
              )}
              {waitCount > 0 && (
                <li className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600"><Clock size={14} /></span>
                  {t('dashboard.wait_suggestions_count', { count: waitCount })}
                </li>
              )}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={t('dashboard.forecast_title')}
          icon={PackageSearch}
          iconClass="text-amber-600"
          action={
            <Link to="/pharmacy/ai-center?tab=tasks" className="text-xs text-amber-600 hover:text-amber-700 font-medium">
              {t('dashboard.view_forecast')}
            </Link>
          }
        >
          {!overview ? (
            <Skeleton className="h-20" />
          ) : overview.forecastRisk.items.length === 0 ? (
            <EmptyState icon={PackageSearch} title={t('dashboard.forecast_empty')} />
          ) : (
            <ul className={`space-y-2 ${SCROLL}`}>
              {overview.forecastRisk.items.slice(0, LIST).map((f) => (
                <li key={f.productId} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-700 truncate">{f.productName || f.productId.slice(0, 8)}</span>
                  <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                    {t('dashboard.days_to_reorder', { count: f.daysUntilReorderNeeded ?? 0 })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* E. Financial health + Quick actions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <SectionCard title={t('dashboard.financial_health')} icon={Wallet} iconClass="text-emerald-600">
          {financeLoading ? (
            <Skeleton className="h-24" />
          ) : !finance ? (
            <EmptyState icon={Wallet} title={t('dashboard.cash_risk_off')} />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label={t('dashboard.dead_stock')} value={money(finance.deadStockValue, currency)} sub={`${finance.deadStockPct?.toFixed(0) ?? 0}%`} tone="amber" />
                <MiniStat label={t('dashboard.near_expiry')} value={money(finance.nearExpiryValue, currency)} sub={`${finance.nearExpirySkus ?? 0}`} tone="rose" />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>{t('dashboard.credit_used')}</span>
                  <span>{Math.round(finance.utilizationRate ?? 0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${finance.cashRisk ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, Math.round(finance.utilizationRate ?? 0))}%` }}
                  />
                </div>
              </div>
              <div className={`flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 ${
                finance.cashRisk ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
              }`}>
                {finance.cashRisk ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                {finance.cashRisk ? t('dashboard.cash_risk_on') : t('dashboard.cash_risk_off')}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title={t('dashboard.quick_actions')} icon={Zap} className="xl:col-span-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <QuickAction icon={ShoppingCart} label={t('dashboard.qa_new_sale')}        to="/pharmacy/pos" />
            <QuickAction icon={Receipt}      label={t('dashboard.qa_purchase_invoice')} to="/pharmacy/purchases/invoices/create" />
            <QuickAction icon={Tag}          label={t('dashboard.qa_list_p2p')}         to="/pharmacy/p2p" />
            <QuickAction icon={Store}        label={t('dashboard.qa_distributor_market')} to="/pharmacy/marketplace" />
            <QuickAction icon={Boxes}        label={t('dashboard.qa_pharmacy_market')}  to="/pharmacy/p2p" />
            <QuickAction icon={Sparkles}     label={t('dashboard.qa_smart_plan')}       to="/pharmacy/ai-center?tab=tasks" />
          </div>
        </SectionCard>
      </div>

      {/* F. P2P network + AI agent tasks, side by side (equal height) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* AI agent tasks — detected & drafted for your review */}
        <SectionCard
          title={t('dashboard.ai_tasks_title')}
          icon={Sparkles}
          iconClass="text-emerald-600"
          className="h-full"
          action={
            <Link to="/pharmacy/ai-center?tab=approvals" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
              {t('dashboard.view_all')} <ChevronLeft size={15} />
            </Link>
          }
        >
          <p className="text-xs text-gray-400 -mt-2 mb-3 flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-emerald-500" /> {t('dashboard.ai_tasks_subtitle')}
          </p>
          {pendingTasks.length === 0 ? (
            <EmptyState icon={Sparkles} title={t('dashboard.ai_tasks_empty')} />
          ) : (
            <ul className="space-y-2">
              {pendingTasks.slice(0, 5).map((task) => {
                const tone =
                  task.priority === 'critical' ? 'bg-rose-500'
                  : task.priority === 'high' ? 'bg-amber-500'
                  : task.priority === 'medium' ? 'bg-emerald-500'
                  : 'bg-gray-300'
                return (
                  <li key={task.id} className="flex items-center gap-3 rounded-xl border border-gray-200 hover:border-emerald-300 transition-colors p-3">
                    <span className={`shrink-0 h-2.5 w-2.5 rounded-full ${tone}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">{task.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t(`dashboard.rel_${task.confidenceLabel === 'very_high' || task.confidenceLabel === 'high' ? 'high' : task.confidenceLabel === 'medium' ? 'medium' : 'low'}`)}
                        {' · '}{Math.round(task.confidence)}%
                      </p>
                    </div>
                    <Link
                      to={`/pharmacy/ai-center?tab=approvals&id=${task.id}`}
                      className="shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5 transition-colors"
                    >
                      {t('dashboard.review')}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        {/* P2P network — live numbers + offers */}
        <SectionCard
          title={t('dashboard.p2p_network')}
          icon={Network}
          className="h-full"
          action={
            <Link to="/pharmacy/p2p" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
              {t('dashboard.qa_pharmacy_market')} <ChevronLeft size={15} />
            </Link>
          }
        >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <MiniStat label={t('dashboard.p2p_listings')} value={(marketIntel?.activeListingsCount ?? 0).toLocaleString('en-US')} tone="emerald" />
          <MiniStat label={t('dashboard.p2p_sellers')} value={(marketIntel?.activeSellersCount ?? 0).toLocaleString('en-US')} tone="teal" />
          <MiniStat label={t('dashboard.distributors_available')} value={(distributors.length).toLocaleString('en-US')} tone="emerald" />
          <MiniStat
            label={t('dashboard.best_offer')}
            value={offers.length ? t('dashboard.off_badge', { pct: Math.max(...offers.map((o) => Math.round(o.listing.discountPct ?? 0))) }) : '—'}
            tone="teal"
          />
        </div>

        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Megaphone size={13} /> {t('dashboard.market_offers')}
        </h3>
        {offers.length === 0 ? (
          <EmptyState icon={Megaphone} title={t('dashboard.market_offers_empty')} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {offers.map((o) => {
              const l = o.listing
              const price = Number(l.price)
              const pct = l.offerType === 'discount' ? Math.round(Number(l.discountPct ?? 0)) : 0
              const wasPrice = pct > 0 ? price / (1 - pct / 100) : null
              return (
                <div
                  key={l.id}
                  className="group flex flex-col rounded-2xl border border-gray-200 overflow-hidden hover:border-emerald-300 hover:shadow-md transition-all"
                >
                  {/* product image */}
                  <div className="relative h-28 bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
                    <Package size={40} className="text-emerald-300" />
                    {l.offerType === 'discount' && pct > 0 ? (
                      <span className="absolute top-2 start-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-sm">
                        {t('dashboard.off_badge', { pct })}
                      </span>
                    ) : l.offerType === 'bonus' && l.bonusQty ? (
                      <span className="absolute top-2 start-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-600 text-white shadow-sm">
                        {t('dashboard.bonus_badge', { qty: l.bonusQty })}
                      </span>
                    ) : null}
                  </div>
                  {/* body */}
                  <div className="flex flex-col flex-1 p-4">
                    <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 min-h-[2.5rem]">
                      {l.productNameAr || l.productName || l.productId.slice(0, 8)}
                    </p>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-lg font-bold text-emerald-700">{money(price, currency)}</span>
                      {wasPrice && (
                        <span className="text-xs text-gray-400 line-through mb-0.5">{money(wasPrice, currency)}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 mt-0.5">{l.quantity} {t('dashboard.units')}</span>
                    {/* actions */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => reviewInCart(l.productId, l.minOrderQty || 1)}
                        disabled={addToCartMutation.isPending}
                        className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium py-2 transition-colors"
                      >
                        <ShoppingCart size={13} /> {t('dashboard.add_to_cart')}
                      </button>
                      <button
                        onClick={() => reviewInCart(l.productId, l.minOrderQty || 1)}
                        disabled={addToCartMutation.isPending}
                        className="flex items-center justify-center gap-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 text-xs font-medium py-2 transition-colors"
                      >
                        <Sparkles size={13} /> {t('dashboard.qa_smart_plan')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
      </div>

      {/* G. Verified distributors (Aumet-style avatars) */}
      <SectionCard
        title={t('dashboard.distributors_title')}
        icon={Building2}
        action={
          <Link to="/pharmacy/marketplace" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
            {t('dashboard.view_all')} <ChevronLeft size={15} />
          </Link>
        }
      >
        {distributors.length === 0 ? (
          <EmptyState icon={Building2} title={t('dashboard.distributors_empty')} />
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-6">
            {distributors.map((d) => {
              const rel = d.reliabilityLabel ? REL[d.reliabilityLabel] : null
              return (
                <Link
                  key={d.id}
                  to={`/pharmacy/catalog?supplierId=${d.supplierTenantId}&supplierName=${encodeURIComponent(d.companyName)}`}
                  className="group flex w-[104px] flex-col items-center text-center"
                  title={d.companyName}
                >
                  <span className="relative">
                    <Avatar name={d.companyName} />
                    {rel && (
                      <span
                        className={`absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white ${
                          d.reliabilityLabel === 'high' ? 'bg-emerald-500' : d.reliabilityLabel === 'medium' ? 'bg-teal-500' : 'bg-amber-500'
                        }`}
                        title={t(rel.key)}
                      />
                    )}
                  </span>
                  <span className="mt-2 text-xs font-medium text-gray-700 leading-snug line-clamp-2 group-hover:text-emerald-700">
                    {d.companyName}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* G2. Most-ordered distributors (suppliers you deal with most) */}
      <SectionCard
        title={t('dashboard.top_suppliers_title')}
        icon={Award}
        iconClass="text-teal-600"
        action={
          <Link to="/pharmacy/reports/procurement-spend" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
            {t('dashboard.view_all')} <ChevronLeft size={15} />
          </Link>
        }
      >
        {topSuppliers.length === 0 ? (
          <EmptyState icon={Award} title={t('dashboard.top_suppliers_empty')} hint={t('dashboard.top_suppliers_subtitle')} />
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-6">
            {topSuppliers.map((s, i) => (
              <Link
                key={s.supplierId}
                to="/pharmacy/marketplace"
                className="group flex w-[104px] flex-col items-center text-center"
                title={s.supplierName}
              >
                <span className="relative">
                  <Avatar name={s.supplierName} />
                  {i < 3 && (
                    <span className="absolute -top-1 -end-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white ring-2 ring-white">
                      <Star size={11} className="fill-white" />
                    </span>
                  )}
                </span>
                <span className="mt-2 text-xs font-medium text-gray-700 leading-snug line-clamp-2 group-hover:text-emerald-700">
                  {s.supplierName}
                </span>
                <span className="text-[11px] text-gray-400">{t('dashboard.orders_count', { count: s.orderCount })}</span>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      {/* H. Market & sales-growth opportunities */}
      <SectionCard title={t('dashboard.market_growth')} icon={Store}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <TrendingUp size={13} /> {t('dashboard.top_market_products')}
            </h3>
            {(marketIntel?.topTradedProducts?.length ?? 0) === 0 ? (
              <EmptyState icon={TrendingUp} title={t('dashboard.top_market_products')} />
            ) : (
              <ul className={`space-y-2 ${SCROLL}`}>
                {marketIntel!.topTradedProducts.slice(0, LIST).map((p, i) => (
                  <li key={p.productId} className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-gray-300 font-bold">{i + 1}</span>
                    <span className="flex-1 truncate text-gray-700">{p.productNameAr || p.productName || p.productId.slice(0, 8)}</span>
                    <span className="text-xs text-gray-400">{t('dashboard.orders_count', { count: p.orderCount })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <ArrowDownRight size={13} /> {t('dashboard.buy_cheaper')}
            </h3>
            {(buyOpps?.length ?? 0) === 0 ? (
              <EmptyState icon={ArrowDownRight} title={t('dashboard.buy_cheaper')} />
            ) : (
              <ul className={`space-y-2 ${SCROLL}`}>
                {buyOpps!.slice(0, LIST).map((o: ProcurementOpportunity) => (
                  <li key={o.inventoryItemId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-gray-700">{o.productNameAr || o.productName || o.sku || '—'}</span>
                    {o.savingsPct != null && o.savingsPct > 0 && (
                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {t('dashboard.save_pct', { pct: Math.round(o.savingsPct) })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <BadgePercent size={13} /> {t('dashboard.grow_sales')}
            </h3>
            {sellOps.length === 0 ? (
              <EmptyState icon={BadgePercent} title={t('dashboard.grow_sales')} hint={t('dashboard.grow_sales_hint')} />
            ) : (
              <ul className={`space-y-2 ${SCROLL}`}>
                {sellOps.map((a: ExpiryAlert) => (
                  <li key={a.inventoryItemId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-gray-700">{a.productNameAr || a.productName || '—'}</span>
                    <Link
                      to="/pharmacy/p2p"
                      className="shrink-0 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg"
                    >
                      {t('dashboard.list_for_sale')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <Link to="/pharmacy/marketplace" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
            {t('dashboard.view_marketplace')} <ChevronLeft size={15} />
          </Link>
        </div>
      </SectionCard>

      {/* J. Low stock + recent orders */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SectionCard
          title={t('dashboard.low_stock_section')}
          icon={AlertTriangle}
          iconClass="text-amber-500"
          action={
            <Link to="/pharmacy/inventory" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              {t('dashboard.total_products')}
            </Link>
          }
        >
          {lowStock.length === 0 ? (
            <EmptyState icon={PackageX} title={t('dashboard.no_low_stock')} />
          ) : (
            <ul className={`divide-y divide-gray-100 ${SCROLL}`}>
              {lowStock.slice(0, LIST).map((it) => {
                const hasAiPlan = draftProductIds.has(it.productId)
                const reorderQty = Math.max((it.minThreshold || 10) * 2 - it.quantity, 1)
                return (
                  <li key={it.id} className="flex items-center gap-3 py-2.5">
                    <Package size={16} className="text-gray-300 shrink-0" />
                    <span className="flex-1 truncate text-sm text-gray-700">{it.product?.name || '—'}</span>
                    <span className="text-sm font-semibold text-red-600">{it.quantity}</span>
                    {hasAiPlan ? (
                      <button
                        onClick={() => reviewInCart(it.productId, reorderQty)}
                        disabled={addToCartMutation.isPending}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 text-xs font-medium px-2.5 py-1 transition-colors"
                      >
                        <Sparkles size={12} /> {t('dashboard.qa_smart_plan')}
                      </button>
                    ) : (
                      <button
                        onClick={() => reviewInCart(it.productId, reorderQty)}
                        disabled={addToCartMutation.isPending}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 text-xs font-medium px-2.5 py-1 transition-colors"
                      >
                        <ShoppingCart size={12} /> {t('dashboard.reorder')}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={t('dashboard.recent_orders_section')}
          icon={ShoppingCart}
          iconClass="text-emerald-500"
          action={
            <Link to="/pharmacy/orders" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              {t('order.title')}
            </Link>
          }
        >
          {orders.length === 0 ? (
            <EmptyState icon={Inbox} title={t('dashboard.no_orders')} />
          ) : (
            <ul className={`divide-y divide-gray-100 ${SCROLL}`}>
              {orders.slice(0, LIST).map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5">
                  <span className="font-mono text-xs text-gray-400">{o.id.slice(0, 8)}</span>
                  <span className="flex-1 truncate text-sm text-gray-700">{o.supplierTenant?.name || '—'}</span>
                  <span className="text-sm font-medium text-gray-900">{money(Number(o.totalAmount), currency)}</span>
                  <Link to={`/pharmacy/orders/${o.id}`} className="text-gray-300 hover:text-emerald-600">
                    <ChevronLeft size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <ProcurementCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  )
}

// ── small presentational helpers ────────────────────────────────────────────

function KpiTile({
  icon: Icon, label, value, delta, loading, accent = 'text-gray-900',
}: {
  icon: LucideIcon
  label: string
  value: string
  delta?: number | null
  loading?: boolean
  accent?: string
}) {
  if (loading) return <Skeleton className="h-24" />
  const up = (delta ?? 0) >= 0
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <Icon size={14} /> {label}
      </div>
      <p className={`text-xl font-bold mt-1.5 ${accent}`}>{value}</p>
      {delta != null && (
        <p className={`text-xs mt-1 flex items-center gap-0.5 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(delta)}%
        </p>
      )}
    </div>
  )
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'amber' | 'rose' | 'emerald' | 'teal' }) {
  const tones = {
    amber:   'bg-amber-50 text-amber-700',
    rose:    'bg-rose-50 text-rose-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    teal:    'bg-teal-50 text-teal-700',
  }
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-base font-bold text-gray-900 mt-0.5">{value}</p>
      {sub && <span className={`inline-block mt-1 text-[11px] px-1.5 py-0.5 rounded ${tones[tone]}`}>{sub}</span>}
    </div>
  )
}

function QuickAction({
  icon: Icon, label, to,
}: {
  icon: LucideIcon
  label: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all p-4 text-center"
    >
      <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><Icon size={18} /></span>
      <span className="text-xs font-medium text-gray-700">{label}</span>
    </Link>
  )
}
