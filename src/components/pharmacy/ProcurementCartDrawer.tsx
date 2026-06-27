import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Clock,
  Zap,
  CheckCircle,
  Loader2,
  PackageSearch,
  Info,
  FlaskConical,
  Play,
  SlidersHorizontal,
  ArrowLeftRight,
  Minus,
  Plus,
  Pencil,
  Check,
  Hourglass,
  Users,
  Store,
  ArrowRight,
} from 'lucide-react'
import {
  procurementApi,
  CartItem,
  CartSummary,
  ExplainabilityRecord,
  FinancialStatus,
  DelayRecommendation,
  OverpaymentRecommendation,
  OrchestratorResult,
  SimulationConstraints,
} from '../../api/procurement.api'

// ─── Risk badge ──────────────────────────────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
  const { label, cls } =
    score >= 70
      ? { label: 'خطر مرتفع', cls: 'bg-red-100 text-red-700 border-red-200' }
      : score >= 40
      ? { label: 'خطر متوسط', cls: 'bg-amber-100 text-amber-700 border-amber-200' }
      : { label: 'خطر منخفض', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label} {score}/100
    </span>
  )
}

// ─── Smart reason panel (human-readable "why?") ─────────────────────────────

interface StoryCard { icon: string; text: string; severity: 'ok' | 'warn' | 'danger' | 'info' }

function buildStory(ex: ExplainabilityRecord): StoryCard[] {
  const cards: StoryCard[] = []
  const stock        = ex.inputsSnapshot.currentStockUnits
  const forecast     = ex.inputsSnapshot.demandForecastUnits
  const urgency      = ex.computedSignals.urgencyScore
  const saved        = ex.financialImpact.savedVsHistoricalAvg
  const lastAvgPrice = ex.inputsSnapshot.lastAvgUnitPrice
  // Heuristic: zero stock + zero historical avg price = never purchased before
  const isFirstTimePurchase = stock === 0 && (!lastAvgPrice || lastAvgPrice === 0)

  // Stock situation
  if (isFirstTimePurchase) {
    cards.push({
      icon: '🆕',
      text: 'منتج جديد — لم يتم شراؤه من قبل، هذه ستكون أول دفعة في السجل',
      severity: 'info',
    })
  } else if (stock === 0) {
    cards.push({ icon: '📦', text: 'المخزون نفد تماماً — إعادة التوريد ضرورية', severity: 'danger' })
  } else if (stock > 0) {
    cards.push({ icon: '📦', text: `المخزون الحالي: ${stock.toLocaleString('en-US')} وحدة`, severity: 'info' })
  }

  // Demand forecast
  if (forecast > 0) {
    cards.push({ icon: '📊', text: `الطلب المتوقع: ${forecast.toLocaleString('en-US')} وحدة`, severity: 'info' })
  } else if (isFirstTimePurchase) {
    cards.push({
      icon: '📊',
      text: 'لا توجد بيانات طلب تاريخية بعد — الكمية مبنية على إدخالك اليدوي',
      severity: 'info',
    })
  }

  // Urgency translated — soften "buy now" message for first-time purchases
  if (urgency >= 70 && !isFirstTimePurchase) {
    cards.push({ icon: '⚡', text: `إلحاح عالٍ — اشترِ الآن لتجنب نفاد المخزون`, severity: 'danger' })
  } else if (urgency >= 40 && !isFirstTimePurchase) {
    cards.push({ icon: '⏰', text: `إلحاح متوسط — يُنصح بالشراء قريباً`, severity: 'warn' })
  } else if (!isFirstTimePurchase) {
    cards.push({ icon: '✅', text: 'الوضع مستقر — لا يوجد ضغط فوري', severity: 'ok' })
  }

  // Market shortage
  if (ex.computedSignals.marketShortageRisk) {
    cards.push({ icon: '🏪', text: 'شح في السوق — المعروض من الموردين منخفض (أقل من 50%)', severity: 'danger' })
  }

  // Fallback supplier warning
  const isFallback = ex.conflictResolutions.some(
    (r) => r.fired && r.rule.toLowerCase().includes('r4') && r.outcome.toLowerCase().includes('fallback')
  )
  if (isFallback) {
    cards.push({ icon: '⚠️', text: 'المورد المتاح الوحيد — لا يوجد بديل أعلى موثوقية في الكتالوج حالياً', severity: 'warn' })
  }

  // Financial cap
  const financialCapped = ex.conflictResolutions.some(
    (r) => r.fired && r.rule.toLowerCase().includes('r1')
  )
  if (financialCapped) {
    cards.push({ icon: '💳', text: 'تم تخفيض الكمية 30% بسبب مستوى الائتمان — حافظنا على سلامتك المالية', severity: 'warn' })
  }

  // Price vs historical avg
  if (saved > 50) {
    cards.push({ icon: '💰', text: `توفير ${saved.toFixed(0)} ج.م مقارنة بمتوسط ما تدفعه عادةً`, severity: 'ok' })
  } else if (saved < -50) {
    cards.push({ icon: '💸', text: `السعر أعلى من متوسطك بـ ${Math.abs(saved).toFixed(0)} ج.م — قد تجد سعراً أفضل لاحقاً`, severity: 'warn' })
  }

  // Positive "why this supplier" — surfaces the orchestrator's selectedPlanReason
  // in user-friendly form. Intentionally never names rejected suppliers.
  if (ex.selectedPlanReason && ex.selectedPlanReason.trim().length > 0) {
    cards.push({
      icon: '🎯',
      text: `لماذا هذا المورد: ${ex.selectedPlanReason}`,
      severity: 'ok',
    })
  }

  return cards
}

const severityStyle: Record<StoryCard['severity'], string> = {
  danger: 'bg-red-50   border-red-200   text-red-800',
  warn:   'bg-amber-50 border-amber-200 text-amber-800',
  ok:     'bg-emerald-50 border-emerald-200 text-emerald-800',
  info:   'bg-gray-50  border-gray-200  text-gray-700',
}

function SmartReasonPanel({ ex }: { ex: ExplainabilityRecord }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const cards = buildStory(ex)
  const firedRules = ex.conflictResolutions.filter((r) => r.fired)

  return (
    <div className="mt-2 space-y-2">
      {/* Plain-language story cards */}
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
        <Info size={10} /> لماذا هذا الاقتراح؟
      </p>
      <div className="space-y-1.5">
        {cards.map((card, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border text-xs leading-snug ${severityStyle[card.severity]}`}
          >
            <span className="shrink-0 text-sm leading-tight">{card.icon}</span>
            <span>{card.text}</span>
          </div>
        ))}
      </div>

      {/* Advanced details (collapsed by default) */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50"
      >
        <span className="flex items-center gap-1">
          <Zap size={10} />
          تفاصيل تقنية
          {firedRules.length > 0 && (
            <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{firedRules.length} قاعدة</span>
          )}
        </span>
        {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {showAdvanced && (
        <div className="px-2 pb-2 space-y-2 text-[11px] text-gray-600 border border-gray-100 rounded-xl bg-gray-50/60 pt-2">
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: 'درجة الإلحاح', value: `${ex.computedSignals.urgencyScore}/100` },
              { label: 'تقلب الأسعار', value: `${ex.computedSignals.priceVolatility.toFixed(1)}%` },
              { label: 'توافر السوق', value: `${(ex.inputsSnapshot.marketAvailabilityRate * 100).toFixed(0)}%` },
              { label: 'خيارات P2P', value: `${ex.inputsSnapshot.p2pListingsCount}` },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-lg px-2 py-1.5 border border-gray-100">
                <p className="text-[9px] text-gray-400">{item.label}</p>
                <p className="font-bold text-gray-800 mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>

          {firedRules.length > 0 && (
            <div className="space-y-1">
              {firedRules.map((r) => (
                <div key={r.rule} className="flex items-start gap-1.5 text-gray-500">
                  <Zap size={9} className="text-amber-500 mt-0.5 shrink-0" />
                  <span className="leading-snug">{r.outcome}</span>
                </div>
              ))}
            </div>
          )}

          {ex.rejectedOptions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">موردون مستبعدون</p>
              {ex.rejectedOptions.map((o, i) => (
                <div key={i} className="flex items-start gap-1.5 text-gray-400">
                  <X size={9} className="mt-0.5 shrink-0" />
                  <span className="leading-snug">{o.name} — {o.rejectedReason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Financial status bar ────────────────────────────────────────────────────

function FinancialStatusBar({ fs }: { fs: FinancialStatus }) {
  const recMap = {
    approve_now:           { text: 'وضعك المالي جيد — يمكنك الموافقة الآن', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    approve_with_caution:  { text: 'وضعك المالي متوسط — الموافقة مقبولة مع الحذر', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    delay_recommended:     { text: 'الائتمان مرتفع — ننصح بتأجيل الشراء أو تخفيض الكمية', cls: 'text-red-700 bg-red-50 border-red-200' },
  }
  const rec = recMap[fs.recommendation]
  const barBefore = Math.min(100, fs.utilizationBeforePurchase)
  const barAfter  = Math.min(100, fs.utilizationAfterPurchase)

  if (fs.creditLimit === 0) return null

  return (
    <div className={`rounded-xl border p-3 text-xs space-y-2 ${rec.cls}`}>
      <p className="font-semibold">{rec.text}</p>
      <div className="flex items-center gap-3 text-[11px] opacity-80">
        <span>الائتمان المتاح: {fs.creditAvailable.toLocaleString('en-US')} ج.م</span>
        <span>·</span>
        <span>الاستخدام بعد الشراء: {barAfter.toFixed(0)}%</span>
      </div>
      {/* Progress bar */}
      <div className="relative h-2 rounded-full bg-black/10 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full bg-current opacity-40 transition-all" style={{ width: `${barBefore}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-current opacity-80 transition-all" style={{ width: `${barAfter}%` }} />
      </div>
    </div>
  )
}

// ─── Delay counter-recommendation ────────────────────────────────────────────
// Visual idiom mirrors FinancialStatusBar (rounded-xl, soft bg, RTL Arabic
// copy, lucide icon) so it slots into the same vertical rhythm as the rest
// of the cart card. Renders only when the orchestrator emitted a delay
// signal — otherwise the card is hidden entirely.

function DelayRecommendationCard({ dr }: { dr: DelayRecommendation }) {
  const confidenceCls =
    dr.confidence === 'high'
      ? 'text-sky-700 bg-sky-50 border-sky-200'
      : dr.confidence === 'medium'
      ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
      : 'text-gray-700 bg-gray-50 border-gray-200'

  return (
    <div className={`mt-2 rounded-xl border p-3 text-xs space-y-2 ${confidenceCls}`}>
      <div className="flex items-center gap-1.5 font-semibold">
        <Hourglass size={12} className="opacity-80" />
        <span>اقتراح بديل: التأجيل {dr.recommendedDelayDays} أيام</span>
      </div>
      <p className="text-[11px] opacity-90 leading-relaxed">{dr.humanReason}</p>
      <div className="flex flex-wrap items-center gap-2 text-[10px] opacity-75">
        <span>تدفق متوقع: {dr.projectedInflow.toLocaleString('en-US')} ج.م</span>
        {dr.daysToCoverCost !== null && (
          <>
            <span>·</span>
            <span>يغطي التكلفة خلال {dr.daysToCoverCost} يوم</span>
          </>
        )}
        <span>·</span>
        <span>ثقة: {dr.confidence === 'high' ? 'عالية' : dr.confidence === 'medium' ? 'متوسطة' : 'منخفضة'}</span>
      </div>
    </div>
  )
}

// Overpayment counter-recommendation — same visual idiom as DelayRecommendationCard
// but in a red/rose palette. Surfaces *only* when the orchestrator confirms a
// cheaper alternative is actually available (no noisy "you're overpaying but
// nothing else exists" warnings).
function OverpaymentRecommendationCard({ op }: { op: OverpaymentRecommendation }) {
  const confidenceCls =
    op.confidence === 'high'
      ? 'text-red-700 bg-red-50 border-red-200'
      : 'text-rose-700 bg-rose-50 border-rose-200'

  return (
    <div className={`mt-2 rounded-xl border p-3 text-xs space-y-2 ${confidenceCls}`}>
      <div className="flex items-center gap-1.5 font-semibold">
        <TrendingUp size={12} className="opacity-80" />
        <span>
          تنبيه دفع زائد: +{op.overpaymentPct}% فوق متوسط السوق
          <span className="opacity-60 font-normal ms-1">(الحد: {op.thresholdPct}%)</span>
        </span>
      </div>
      <p className="text-[11px] opacity-90 leading-relaxed">{op.humanReason}</p>
      <div className="flex flex-wrap items-center gap-2 text-[10px] opacity-75">
        <span>سعرك: {op.effectiveUnitPrice.toFixed(2)} ج.م/وحدة</span>
        <span>·</span>
        <span>متوسط السوق: {op.marketAvgUnitPrice.toFixed(2)} ج.م</span>
        {op.bestAlternativeUnitPrice !== null && (
          <>
            <span>·</span>
            <span className="font-semibold">
              أرخص بديل: {op.bestAlternativeUnitPrice.toFixed(2)} ج.م
              {op.bestAlternativeIsMarketplace ? ' (سوق مفتوح)' : ''}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Cart Item Card ──────────────────────────────────────────────────────────

function CartItemCard({
  item,
  onRemove,
  onUpdate,
  updating,
}: {
  item: CartItem
  onRemove: (draftId: string) => void
  onUpdate: (draftId: string, patch: { qty?: number; unitPrice?: number }) => void
  updating: boolean
}) {
  const [editingPrice, setEditingPrice] = useState(false)
  const [priceDraft, setPriceDraft] = useState<string>(Number(item.unitPrice).toFixed(2))

  const commitPrice = () => {
    const next = Number(priceDraft)
    if (Number.isFinite(next) && next >= 0 && next !== Number(item.unitPrice)) {
      onUpdate(item.draftId, { unitPrice: next })
    }
    setEditingPrice(false)
  }

  const bumpQty = (delta: number) => {
    const next = item.qty + delta
    if (next >= 1) onUpdate(item.draftId, { qty: next })
  }

  return (
    <div className={`rounded-2xl border p-3 ${item.stale ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100 bg-white'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${item.source === 'p2p' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'}`}>
              {item.source === 'p2p' ? '🔁 P2P' : '🏭 مورد'}
            </span>
            {item.stale && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                <Clock size={9} />
                قديم
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-800 truncate">{item.sourceName}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-gray-900">{item.totalCost.toFixed(2)} ج.م</p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.draftId)}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="حذف من السلة"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Inline qty + price editor */}
      <div className="flex items-center justify-between gap-2 mb-2 px-2 py-1.5 rounded-xl bg-gray-50 border border-gray-100">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => bumpQty(-1)}
            disabled={updating || item.qty <= 1}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="−1"
          >
            <Minus size={11} />
          </button>
          <span className="text-xs font-semibold text-gray-800 min-w-[2.5rem] text-center tabular-nums">
            {item.qty.toLocaleString('en-US')}
          </span>
          <button
            type="button"
            onClick={() => bumpQty(+1)}
            disabled={updating}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="+1"
          >
            <Plus size={11} />
          </button>
          <span className="text-[11px] text-gray-400">وحدة</span>
        </div>
        <div className="flex items-center gap-1.5">
          {editingPrice ? (
            <>
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitPrice()
                  if (e.key === 'Escape') {
                    setPriceDraft(Number(item.unitPrice).toFixed(2))
                    setEditingPrice(false)
                  }
                }}
                autoFocus
                className="w-20 px-2 py-0.5 text-xs font-semibold text-gray-800 bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 tabular-nums"
              />
              <button
                type="button"
                onClick={commitPrice}
                disabled={updating}
                className="w-6 h-6 flex items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                title="حفظ السعر"
              >
                <Check size={11} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPriceDraft(Number(item.unitPrice).toFixed(2))
                setEditingPrice(true)
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs text-gray-600 hover:bg-white hover:text-emerald-700 transition-colors"
              title="تعديل سعر الوحدة (يدوياً)"
            >
              <span className="font-semibold tabular-nums">{Number(item.unitPrice).toFixed(2)}</span>
              <span className="text-[10px] text-gray-400">ج.م</span>
              <Pencil size={10} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <RiskBadge score={item.riskScore} />
        <span className="text-[11px] text-gray-400">ثقة {item.confidence}%</span>
      </div>

      {item.financialStatus && <FinancialStatusBar fs={item.financialStatus} />}
      {item.delayRecommendation && <DelayRecommendationCard dr={item.delayRecommendation} />}
      {item.overpaymentRecommendation && (
        <OverpaymentRecommendationCard op={item.overpaymentRecommendation} />
      )}
      <SmartReasonPanel ex={item.explainability} />
    </div>
  )
}

// ─── Stale warning banner ────────────────────────────────────────────────────

function StaleBanner({ onRecompute, isPending, lastResult }: { onRecompute: () => void; isPending: boolean; lastResult?: { recomputedProducts: number } | null }) {
  return (
    <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-center gap-2.5">
      <AlertTriangle size={14} className="text-amber-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-amber-800">قد تكون الأسعار تغيرت</p>
        <p className="text-[11px] text-amber-600">
          {lastResult
            ? (lastResult.recomputedProducts > 0
                ? `تم تحديث ${lastResult.recomputedProducts} منتج بالأسعار والمخزون الحالي`
                : 'الخطة محدَّثة بالفعل')
            : 'آخر تحديث أكثر من 30 دقيقة'}
        </p>
      </div>
      <button
        type="button"
        onClick={onRecompute}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-lg transition-colors shrink-0"
      >
        {isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        أعد الحساب
      </button>
    </div>
  )
}

// ─── Plan comparison card (used inside SimulationModal) ──────────────────────

function PlanComparisonCard({
  label,
  plan,
  accent,
}: {
  label: string
  plan: OrchestratorResult
  accent: 'gray' | 'emerald'
}) {
  return (
    <div className={`rounded-xl border p-3 ${accent === 'emerald' ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-white'}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${accent === 'emerald' ? 'text-emerald-600' : 'text-gray-400'}`}>
        {label}
      </p>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{plan.totalCost.toFixed(2)} ج.م</p>
      <div className="flex items-center gap-2 mt-1.5 mb-2">
        <RiskBadge score={plan.riskScore} />
        <span className="text-[11px] text-gray-400">ثقة {plan.confidence}%</span>
      </div>
      <div className="space-y-1 border-t border-gray-100 pt-2">
        {plan.splits.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-1 text-[11px]">
            <span className="flex items-center gap-1 text-gray-600 truncate">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.source === 'p2p' ? 'bg-emerald-500' : 'bg-teal-500'}`} />
              <span className="truncate">{s.sourceName}</span>
            </span>
            <span className="text-gray-500 tabular-nums shrink-0">{s.qty} × {Number(s.unitPrice).toFixed(1)}</span>
          </div>
        ))}
        {plan.insufficientSupply && (
          <p className="text-[10px] text-amber-600 mt-1">⚠ كمية غير متوفرة بالكامل</p>
        )}
      </div>
    </div>
  )
}

// ─── Simulation modal ────────────────────────────────────────────────────────

interface SimProductState {
  productId: string
  productName: string
  totalQty: number
}

function SimulationModal({
  simProduct,
  onClose,
  onApply,
  isApplying,
}: {
  simProduct: SimProductState
  onClose: () => void
  onApply: (plan: OrchestratorResult) => void
  isApplying: boolean
}) {
  const [delayDays, setDelayDays]       = useState(0)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'p2p_only' | 'supplier_only'>('all')
  const [maxBudget, setMaxBudget]       = useState('')

  const simulateMutation = useMutation({
    mutationFn: (constraints: SimulationConstraints) =>
      procurementApi
        .simulate(simProduct.productId, simProduct.totalQty, constraints)
        .then((r) => r.data),
  })

  const result = simulateMutation.data

  const handleRun = () => {
    const constraints: SimulationConstraints = {}
    if (delayDays > 0) constraints.delayDays = delayDays
    if (sourceFilter !== 'all') constraints.sourceFilter = sourceFilter
    if (maxBudget) constraints.maxBudget = Number(maxBudget)
    simulateMutation.mutate(constraints)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <FlaskConical size={16} className="text-emerald-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">محاكاة السيناريو</h3>
              <p className="text-[11px] text-gray-500">
                {simProduct.productName || simProduct.productId.slice(0, 8) + '…'} · {simProduct.totalQty} وحدة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* What & Why explainer */}
        <div className="mx-5 mt-4 px-3 py-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 text-[11px] text-emerald-900 leading-relaxed space-y-1">
          <p className="flex items-center gap-1.5 font-semibold text-emerald-800">
            <Info size={12} />
            ما هي المحاكاة ولماذا تستخدمها؟
          </p>
          <p>
            جرّب <strong>سيناريوهات بديلة</strong> لشراء هذا المنتج (مثل تأجيل الشراء بضعة أيام، أو الاكتفاء بـ P2P،
            أو فرض حد للميزانية) ثم قارن نتيجتها مع الخطة الحالية <strong>قبل</strong> أي التزام. مفيد عند:
          </p>
          <ul className="ps-4 list-disc space-y-0.5 text-emerald-800/90">
            <li>الشك في وجود سعر أفضل لو انتظرت قليلاً</li>
            <li>الرغبة في خفض المخاطر أو تجنّب مورد بعينه</li>
            <li>ضيق السيولة وحاجتك لحدّ أقصى للميزانية</li>
          </ul>
        </div>

        {/* Constraint controls */}
        <div className="px-5 py-4 space-y-4 border-b border-gray-100">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            <SlidersHorizontal size={12} />
            قيود السيناريو
          </p>

          {/* Delay slider */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-600">تأخير الشراء</label>
              <span className="text-xs font-semibold text-gray-800">
                {delayDays === 0 ? 'لا تأخير' : `${delayDays} يوم`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={14}
              value={delayDays}
              onChange={(e) => setDelayDays(Number(e.target.value))}
              className="w-full h-1.5 accent-emerald-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>الآن</span>
              <span>14 يوم</span>
            </div>
          </div>

          {/* Source filter */}
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">مصدر التوريد</label>
            <div className="flex gap-2">
              {([
                { value: 'all', label: 'الكل' },
                { value: 'p2p_only', label: 'P2P فقط' },
                { value: 'supplier_only', label: 'موردين فقط' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSourceFilter(opt.value)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    sourceFilter === opt.value
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Max budget */}
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">حد الميزانية القصوى (ج.م)</label>
            <input
              type="number"
              placeholder="بدون حد"
              value={maxBudget}
              min={1}
              onChange={(e) => setMaxBudget(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            type="button"
            onClick={handleRun}
            disabled={simulateMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {simulateMutation.isPending
              ? <><Loader2 size={14} className="animate-spin" />جارٍ المحاكاة…</>
              : <><Play size={14} />تشغيل المحاكاة</>
            }
          </button>
        </div>

        {/* Error */}
        {simulateMutation.isError && (
          <div className="px-5 py-4 flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle size={14} className="shrink-0" />
            فشل في تشغيل المحاكاة — يرجى المحاولة مرة أخرى
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="px-5 py-4 space-y-4">
            {/* Delta summary */}
            <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
              result.costDelta < -1
                ? 'border-emerald-200 bg-emerald-50'
                : result.costDelta > 1
                ? 'border-red-200 bg-red-50'
                : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center gap-2">
                {result.costDelta < -1
                  ? <TrendingDown size={14} className="text-emerald-600" />
                  : result.costDelta > 1
                  ? <TrendingUp size={14} className="text-red-600" />
                  : <Minus size={14} className="text-gray-400" />
                }
                <span className="text-sm font-semibold text-gray-800">
                  {result.costDelta < -1
                    ? `توفير ${Math.abs(result.costDelta).toFixed(2)} ج.م`
                    : result.costDelta > 1
                    ? `تكلفة إضافية ${result.costDelta.toFixed(2)} ج.م`
                    : 'نفس التكلفة تقريباً'
                  }
                </span>
              </div>
              <span className={`text-[11px] font-semibold ${
                result.riskDelta < 0 ? 'text-emerald-700' : result.riskDelta > 0 ? 'text-red-700' : 'text-gray-500'
              }`}>
                {result.riskDelta < 0
                  ? `خطر أقل بـ ${Math.abs(result.riskDelta)} ↓`
                  : result.riskDelta > 0
                  ? `خطر أعلى بـ ${result.riskDelta} ↑`
                  : 'نفس درجة الخطر'
                }
              </span>
            </div>

            {/* 2-column plan comparison */}
            <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-500">
              <ArrowLeftRight size={12} />
              مقارنة الخطتين
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PlanComparisonCard label="الخطة الحالية" plan={result.baseline} accent="gray" />
              <PlanComparisonCard label="السيناريو" plan={result.simulated} accent="emerald" />
            </div>

            {/* AI recommendation */}
            {result.recommendation && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-600 leading-relaxed">
                <Zap size={12} className="text-amber-500 shrink-0 mt-0.5" />
                <span className="italic">{result.recommendation}</span>
              </div>
            )}

            {/* Apply CTA */}
            <button
              type="button"
              onClick={() => onApply(result.simulated)}
              disabled={isApplying}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {isApplying
                ? <><Loader2 size={14} className="animate-spin" />جارٍ التطبيق…</>
                : <><CheckCircle size={14} />تطبيق هذا السيناريو وتحديث الخطة</>
              }
            </button>
            <p className="text-center text-[11px] text-gray-400 -mt-2">
              سيتم استبدال الخطة الحالية لهذا المنتج بالسيناريو المحاكى
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main drawer ─────────────────────────────────────────────────────────────

interface ProcurementCartDrawerProps {
  open: boolean
  onClose: () => void
}

export function ProcurementCartDrawer({ open, onClose }: ProcurementCartDrawerProps) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [simProduct, setSimProduct] = useState<SimProductState | null>(null)

  const cartQuery = useQuery({
    queryKey: ['procurement-cart'],
    queryFn: () => procurementApi.getCart().then((r) => r.data),
    staleTime: 0,
    refetchInterval: open ? 60_000 : false,
    enabled: open,
  })

  const cart: CartSummary | undefined = cartQuery.data

  const recomputeMutation = useMutation({
    mutationFn: () => procurementApi.recomputeCart().then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procurement-cart'] }),
  })

  const removeMutation = useMutation({
    mutationFn: (draftId: string) => procurementApi.removeCartItem(draftId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procurement-cart'] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ draftId, patch }: { draftId: string; patch: { qty?: number; unitPrice?: number } }) =>
      procurementApi.updateCartItem(draftId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procurement-cart'] }),
  })

  const applyPlanMutation = useMutation({
    mutationFn: (plan: OrchestratorResult) => procurementApi.applyPlan(plan).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-cart'] })
      setSimProduct(null)
    },
  })

  const checkoutMutation = useMutation({
    mutationFn: () => procurementApi.checkoutCart().then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-cart'] })
      qc.invalidateQueries({ queryKey: ['procurement-drafts'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      // Do NOT auto-close — show the success summary so the pharmacist sees
      // how the plan split into supplier orders vs P2P requests and where to
      // track each.
    },
  })

  if (!open) return null

  const isEmpty = !cart || cart.items.length === 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 end-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-100 rounded-xl">
              <ShoppingCart size={18} className="text-teal-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">خطة الشراء</h2>
              <p className="text-xs text-gray-500">
                {cart
                  ? `خطة موحّدة · ${cart.productCount} منتج من ${cart.items.length} مصدر`
                  : 'جارٍ التحميل…'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Principle banner */}
        <div className="mx-4 mt-3 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 flex items-start gap-2 text-xs text-gray-600">
          <ShieldCheck size={13} className="text-emerald-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <strong className="text-gray-800">خطة موحّدة لجميع المنتجات</strong> — كل ما تضغط عليه "خطّط للشراء" من أي مورد يُضاف هنا. راجعها ثم وافِق دفعة واحدة، أو جرّب <strong className="text-emerald-700">المحاكاة</strong> لمنتج معيّن لمقارنة سيناريوهات بديلة قبل التأكيد.
          </span>
        </div>

        {/* Stale warning */}
        {(cart?.hasStaleItems || recomputeMutation.data) && (
          <div className="mt-3">
            <StaleBanner
              onRecompute={() => recomputeMutation.mutate()}
              isPending={recomputeMutation.isPending}
              lastResult={recomputeMutation.data as any}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-3">
          {checkoutMutation.isSuccess && checkoutMutation.data && (
            <CheckoutSuccessPanel
              result={checkoutMutation.data}
              onContinue={() => {
                checkoutMutation.reset()
                onClose()
              }}
              onViewOrders={() => {
                checkoutMutation.reset()
                onClose()
                navigate('/pharmacy/orders')
              }}
              onViewP2P={() => {
                checkoutMutation.reset()
                onClose()
                navigate('/pharmacy/p2p?tab=orders')
              }}
            />
          )}

          {!checkoutMutation.isSuccess && cartQuery.isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-teal-600 animate-spin" />
            </div>
          )}

          {!checkoutMutation.isSuccess && !cartQuery.isLoading && isEmpty && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 bg-gray-100 rounded-2xl mb-4">
                <PackageSearch size={28} className="text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600 mb-1">الخطة فارغة</p>
              <p className="text-xs text-gray-400">
                اضغط "خطط للشراء" على أي منتج في الكتالوج لإضافته
              </p>
            </div>
          )}

          {!checkoutMutation.isSuccess && cart && cart.items.length > 0 && (() => {
            // Group items by productId
            const byProduct = new Map<string, CartItem[]>()
            for (const item of cart.items) {
              if (!byProduct.has(item.productId)) byProduct.set(item.productId, [])
              byProduct.get(item.productId)!.push(item)
            }

            return [...byProduct.entries()].map(([productId, items]) => {
              const totalQty   = items.reduce((s, i) => s + i.qty, 0)
              const displayName = items[0]?.productName ?? `المنتج · ${productId.slice(0, 8)}…`

              return (
                <div key={productId}>
                  {/* Product group header with simulate button */}
                  <div className="flex items-center justify-between mb-2 px-0.5">
                    <p className="text-[11px] font-semibold text-gray-500 truncate max-w-[55%]">
                      {displayName}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setSimProduct({ productId, productName: displayName, totalQty })
                      }
                      title="جرّب سيناريو بديل (تأخير، P2P، حد ميزانية) وقارن أثره على التكلفة والمخاطر قبل التأكيد — بدون أي التزام"
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors"
                    >
                      <FlaskConical size={10} />
                      جرّب سيناريو بديل
                    </button>
                  </div>

                  {items.map((item) => (
                    <CartItemCard
                      key={item.draftId}
                      item={item}
                      onRemove={(id) => removeMutation.mutate(id)}
                      onUpdate={(draftId, patch) => updateMutation.mutate({ draftId, patch })}
                      updating={updateMutation.isPending}
                    />
                  ))}
                </div>
              )
            })
          })()}
        </div>

        {/* Footer */}
        {!isEmpty && cart && (
          <div className="border-t border-gray-100 px-4 pt-3 pb-4">
            {/* Financial warnings */}
            {cart.items.some((i) => i.explainability?.financialImpact?.financialWarning) && (
              <div className="mb-3 px-3 py-2 rounded-xl border border-red-200 bg-red-50 flex items-center gap-2 text-xs text-red-700">
                <AlertTriangle size={12} className="shrink-0" />
                <span>تحذير مالي: نسبة الائتمان المستخدمة مرتفعة — راجع المبلغ قبل التأكيد</span>
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-600">الإجمالي</p>
              <p className="text-lg font-bold text-gray-900">{cart.totalCost.toFixed(2)} ج.م</p>
            </div>

            {/* Insufficient supply warning */}
            {cart.items.some((i) => (i.explainability as any)?.insufficientSupply) && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
                <AlertTriangle size={12} className="shrink-0" />
                بعض الكميات غير متوفرة بالكامل — قد يُنشئ النظام طلبات جزئية
              </div>
            )}

            <button
              type="button"
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending || cart.hasStaleItems}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              {checkoutMutation.isPending
                ? <><Loader2 size={16} className="animate-spin" />جارٍ إنشاء الطلبات…</>
                : cart.hasStaleItems
                ? <><AlertTriangle size={16} />أعد الحساب أولاً</>
                : <><CheckCircle size={16} />تأكيد الخطة وإنشاء الطلبات</>
              }
            </button>

            {checkoutMutation.isError && (
              <p className="mt-2 text-xs text-red-600 text-center">
                فشل في إنشاء الطلبات — {(checkoutMutation.error as Error).message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Simulation modal — rendered above the drawer */}
      {simProduct && (
        <SimulationModal
          simProduct={simProduct}
          onClose={() => setSimProduct(null)}
          onApply={(plan) => applyPlanMutation.mutate(plan)}
          isApplying={applyPlanMutation.isPending}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout success summary — shows how the smart plan split into supplier
// orders (standard order lifecycle) vs P2P requests (separate marketplace
// lifecycle), so the pharmacist knows where to track each.
// ─────────────────────────────────────────────────────────────────────────────
function CheckoutSuccessPanel({
  result,
  onContinue,
  onViewOrders,
  onViewP2P,
}: {
  result: { supplierOrderIds: string[]; p2pOrderIds: string[]; checkedOutDraftIds: string[] }
  onContinue: () => void
  onViewOrders: () => void
  onViewP2P: () => void
}) {
  const supplierCount = result.supplierOrderIds?.length ?? 0
  const p2pCount = result.p2pOrderIds?.length ?? 0
  const total = supplierCount + p2pCount

  return (
    <div className="flex flex-col items-center text-center py-6 px-1">
      <div className="p-3 bg-emerald-100 rounded-2xl mb-3">
        <CheckCircle size={30} className="text-emerald-600" />
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1">تم تنفيذ الخطة بنجاح</h3>
      <p className="text-xs text-gray-500 mb-4">
        أُنشئ {total} طلب من خطة الشراء الذكية. تابع حالة كل طلب من مكانه المناسب.
      </p>

      <div className="w-full space-y-2 mb-4">
        {supplierCount > 0 && (
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-start">
            <div className="p-1.5 rounded-lg bg-gray-100 shrink-0">
              <Store size={14} className="text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-800">
                {supplierCount} طلب موزّع
              </p>
              <p className="text-[11px] text-gray-500">يُتابع من صفحة الطلبات — بانتظار قبول الموزّع</p>
            </div>
          </div>
        )}
        {p2pCount > 0 && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-start">
            <div className="p-1.5 rounded-lg bg-emerald-100 shrink-0">
              <Users size={14} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-emerald-800">
                {p2pCount} طلب P2P
                <span className="ms-1 text-[9px] font-bold text-emerald-600 bg-white px-1.5 py-0.5 rounded-full">
                  سوق الأدوية
                </span>
              </p>
              <p className="text-[11px] text-emerald-700">يُتابع من سوق الأدوية — بانتظار قبول الصيدلية البائعة</p>
            </div>
          </div>
        )}
      </div>

      <div className="w-full space-y-2">
        {supplierCount > 0 && (
          <button
            type="button"
            onClick={onViewOrders}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-colors"
          >
            عرض طلبات الموزّعين
            <ArrowRight size={14} />
          </button>
        )}
        {p2pCount > 0 && (
          <button
            type="button"
            onClick={onViewP2P}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold text-xs rounded-xl transition-colors"
          >
            عرض طلبات P2P في سوق الأدوية
            <ArrowRight size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="w-full py-2.5 px-3 text-gray-600 hover:bg-gray-100 font-semibold text-xs rounded-xl transition-colors"
        >
          متابعة التسوّق
        </button>
      </div>
    </div>
  )
}
