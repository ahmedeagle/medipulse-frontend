import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  X,
  Loader2,
  Zap,
  Store,
  Users,
  TrendingDown,
  ShieldCheck,
  Clock,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { procurementApi, type OrchestratorResult, type PlanSplit } from '../../api/procurement.api'

// ─────────────────────────────────────────────────────────────────────────────
// Compare-sources modal — THE differentiator.
//
// When a pharmacist is about to buy a product from a specific distributor, this
// runs the Decision Engine (generatePlan) and shows whether a cheaper / faster /
// closer source exists — across ALL suppliers and P2P. Two outcomes:
//   • "خذ الأوفر"     → delegate to the smart plan (procurement cart)
//   • "كمّل من الموزّع" → proceed with the manual purchase the pharmacist chose
// ─────────────────────────────────────────────────────────────────────────────

interface CompareSourcesModalProps {
  productId: string
  productName: string
  qty: number
  /** The supplier + price the pharmacist is currently looking at. */
  currentSupplierName: string
  currentUnitPrice: number
  currency: string
  onClose: () => void
  /** Take the engine's recommendation → add to the smart procurement plan. */
  onTakeSmart: () => void
  /** Stick with the manual choice → add to manual cart. */
  onKeepManual: () => void
}

export function CompareSourcesModal({
  productId,
  productName,
  qty,
  currentSupplierName,
  currentUnitPrice,
  currency,
  onClose,
  onTakeSmart,
  onKeepManual,
}: CompareSourcesModalProps) {
  const planMutation = useMutation({
    mutationFn: () => procurementApi.generatePlan(productId, qty).then((r) => r.data),
  })

  useEffect(() => {
    planMutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, qty])

  const plan = planMutation.data as OrchestratorResult | undefined

  // Best engine unit price (weighted across splits).
  const engineUnit = plan && plan.qtyRequired > 0 ? plan.totalCost / plan.qtyRequired : null
  const manualTotal = currentUnitPrice * qty
  const savingsTotal = engineUnit !== null ? manualTotal - plan!.totalCost : 0
  const hasSavings = savingsTotal > 0.5

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <Sparkles size={18} className="text-emerald-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">مقارنة المصادر</h2>
              <p className="text-xs text-gray-500 truncate">{productName} · {qty} وحدة</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {planMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={28} className="text-emerald-600 animate-spin" />
              <p className="text-sm text-gray-500">يحلل محرك القرار كل الموزّعين و P2P…</p>
            </div>
          )}

          {planMutation.isError && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <AlertTriangle size={24} className="text-amber-500" />
              <p className="text-sm text-gray-600">تعذّر تحليل المصادر الآن.</p>
              <button
                onClick={() => planMutation.mutate()}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {plan && (
            <>
              {/* Verdict banner */}
              <div
                className={`rounded-2xl border p-4 ${
                  hasSavings
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                {hasSavings ? (
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-100 rounded-xl shrink-0">
                      <TrendingDown size={18} className="text-emerald-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-emerald-800 text-sm">
                        وفّر {savingsTotal.toFixed(2)} {currency} مع الخطة الذكية
                      </p>
                      <p className="text-xs text-emerald-700/80 mt-0.5 leading-relaxed">
                        بدل {manualTotal.toFixed(2)} من {currentSupplierName}، محرك القرار
                        يقترح مصدراً أوفر بإجمالي {plan.totalCost.toFixed(2)} {currency}.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-200 rounded-xl shrink-0">
                      <CheckCircle2 size={18} className="text-gray-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-sm">سعرك عادل</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        لا يوجد مصدر أوفر بفارق يُذكر الآن — يمكنك الشراء من
                        {' '}{currentSupplierName} بثقة.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Recommended split(s) */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">الخطة المقترحة</p>
                <div className="space-y-2">
                  {plan.splits.map((split, i) => (
                    <SplitRow key={i} split={split} currency={currency} />
                  ))}
                </div>
              </div>

              {/* Delay / overpayment nudges */}
              {plan.delayRecommendation && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 text-xs text-amber-800">
                  <Clock size={13} className="shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{plan.delayRecommendation.humanReason}</span>
                </div>
              )}
              {plan.overpaymentRecommendation && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2 text-xs text-red-700">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{plan.overpaymentRecommendation.humanReason}</span>
                </div>
              )}

              {/* Rejected alternatives */}
              {plan.explainability?.rejectedOptions?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">مصادر أخرى دُرست</p>
                  <div className="space-y-1.5">
                    {plan.explainability.rejectedOptions.slice(0, 4).map((opt, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5"
                      >
                        {opt.type === 'p2p' ? (
                          <Users size={11} className="text-emerald-400 shrink-0" />
                        ) : (
                          <Store size={11} className="text-gray-400 shrink-0" />
                        )}
                        <span className="font-medium text-gray-600 truncate">{opt.name}</span>
                        <span className="text-gray-300">·</span>
                        <span className="truncate">{opt.rejectedReason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        {plan && (
          <div className="border-t border-gray-100 px-5 py-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onKeepManual}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold text-xs rounded-xl transition-colors"
            >
              <Store size={14} />
              كمّل من {currentSupplierName}
            </button>
            <button
              type="button"
              onClick={onTakeSmart}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 font-semibold text-xs rounded-xl transition-colors text-white ${
                hasSavings ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <Zap size={14} />
              {hasSavings ? `خذ الأوفر · وفّر ${savingsTotal.toFixed(0)}` : 'استخدم الخطة الذكية'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SplitRow({ split, currency }: { split: PlanSplit; currency: string }) {
  const isP2P = split.source === 'p2p'
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <div className={`p-1.5 rounded-lg shrink-0 ${isP2P ? 'bg-emerald-50' : 'bg-gray-100'}`}>
        {isP2P ? (
          <Users size={14} className="text-emerald-600" />
        ) : (
          <Store size={14} className="text-gray-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold text-gray-800 truncate">{split.sourceName}</p>
          {isP2P && (
            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
              P2P
            </span>
          )}
          {split.reliabilityScore != null && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-600">
              <ShieldCheck size={9} />
              {Number(split.reliabilityScore).toFixed(0)}
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-500 truncate">{split.reason}</p>
      </div>
      <div className="text-end shrink-0">
        <p className="text-xs font-bold text-gray-900 tabular-nums">
          {(split.unitPrice * split.qty).toFixed(2)} {currency}
        </p>
        <p className="text-[10px] text-gray-400 tabular-nums">
          {split.qty} × {split.unitPrice.toFixed(2)}
        </p>
      </div>
    </div>
  )
}
