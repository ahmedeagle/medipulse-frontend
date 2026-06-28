import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  X,
  ChevronDown,
  ChevronUp,
  Store,
  Trash2,
  Plus,
  Minus,
  Loader2,
  CheckCircle,
  CheckCircle2,
  PackageX,
  AlertTriangle,
  PartyPopper,
  ClipboardList,
  ArrowRight,
} from 'lucide-react'
import { ordersApi } from '../../api/orders.api'
import {
  useManualCart,
  manualCartItemCount,
  manualCartTotal,
  groupSubtotal,
  type ManualCartGroup,
} from '../../store/manualCart.store'

interface CreatedOrder {
  id: string
  status: string
  totalAmount: number | string
  currency?: string
  supplierName: string
  itemCount: number
}

interface BulkResult {
  orders: CreatedOrder[]
  failed: { supplierName: string; error: string }[]
}

interface ManualCartDrawerProps {
  open: boolean
  onClose: () => void
}

export function ManualCartDrawer({ open, onClose }: ManualCartDrawerProps) {
  const groups = useManualCart((s) => s.groups)
  const setQty = useManualCart((s) => s.setQty)
  const removeItem = useManualCart((s) => s.removeItem)
  const clearSupplier = useManualCart((s) => s.clearSupplier)

  const qc = useQueryClient()
  const [successOrder, setSuccessOrder] = useState<CreatedOrder | null>(null)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkDone, setBulkDone] = useState(0)

  const groupList = Object.values(groups)
  const totalItems = manualCartItemCount(groups)
  const grandTotal = manualCartTotal(groups)

  // Full-cart checkout — creates one independent order per supplier group in a
  // single action. Runs sequentially so each supplier's success/failure is
  // attributed cleanly and successful groups are cleared as they complete.
  const runBulkCheckout = async () => {
    if (bulkRunning) return
    setBulkRunning(true)
    setBulkDone(0)
    const snapshot = Object.values(groups)
    const orders: CreatedOrder[] = []
    const failed: { supplierName: string; error: string }[] = []
    for (const group of snapshot) {
      try {
        const res = await ordersApi.create({
          supplierTenantId: group.supplierTenantId,
          items: group.items.map((i) => ({
            productId: i.productId,
            quantity: i.qty,
            unitPrice: i.unitPrice,
          })),
          allowDuplicate: true,
        })
        const order = res?.data ?? {}
        orders.push({
          id: order.id,
          status: order.status ?? 'pending',
          totalAmount: order.totalAmount ?? groupSubtotal(group),
          currency: order.currency,
          supplierName: group.supplierName,
          itemCount: group.items.length,
        })
        clearSupplier(group.supplierTenantId)
      } catch (err: any) {
        failed.push({
          supplierName: group.supplierName,
          error: err?.response?.data?.message ?? err?.message ?? 'خطأ غير معروف',
        })
      }
      setBulkDone((n) => n + 1)
    }
    qc.invalidateQueries({ queryKey: ['orders'] })
    setBulkRunning(false)
    setBulkResult({ orders, failed })
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed top-0 end-0 h-full w-full max-w-md bg-gray-50 z-50 shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <ShoppingCart size={18} className="text-emerald-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">سلة الشراء المباشر</h2>
              <p className="text-xs text-gray-500">
                {totalItems > 0
                  ? `${totalItems} صنف · ${groupList.length} موزّع`
                  : 'فارغة'}
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

        {/* Info banner */}
        <div className="mx-4 mt-3 px-3 py-2 rounded-xl border border-emerald-100 bg-emerald-50 flex items-start gap-2 text-xs text-emerald-700">
          <Store size={13} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            شراء مباشر من موزّعين محددين — كل موزّع يصبح طلباً مستقلاً. للأرخص تلقائياً
            استخدم <strong>«الخطة الذكية»</strong> بدلاً من ذلك.
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-3">
          {groupList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 bg-gray-100 rounded-2xl mb-4">
                <PackageX size={28} className="text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600 mb-1">السلة فارغة</p>
              <p className="text-xs text-gray-400">
                اضغط «أضف للسلة» على أي منتج لإضافته من موزّعه.
              </p>
            </div>
          ) : (
            groupList.map((group) => (
              <StoreGroup
                key={group.supplierTenantId}
                group={group}
                onSetQty={setQty}
                onRemove={removeItem}
                onClearSupplier={clearSupplier}
                onOrderSuccess={setSuccessOrder}
              />
            ))
          )}
        </div>

        {/* Footer grand total */}
        {groupList.length > 0 && (
          <div className="border-t border-gray-200 bg-white px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">الإجمالي الكلي</span>
              <span className="text-lg font-bold text-gray-900 tabular-nums">
                {grandTotal.toFixed(2)} ج.م
              </span>
            </div>
            {groupList.length >= 2 ? (
              <>
                <button
                  type="button"
                  onClick={runBulkCheckout}
                  disabled={bulkRunning}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-colors"
                >
                  {bulkRunning ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      جارٍ إنشاء الطلبات… ({bulkDone}/{groupList.length})
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      أكّد كل الطلبات ({groupList.length} موزّع)
                    </>
                  )}
                </button>
                <p className="text-[11px] text-gray-400 text-center">
                  سيُنشأ طلب مستقل لكل موزّع — أو أكّد موزّعاً واحداً من الزر بداخله
                </p>
              </>
            ) : (
              <p className="text-[11px] text-gray-400 text-center">
                أكّد الموزّع من الزر بداخله
              </p>
            )}
          </div>
        )}
      </div>

      {/* Success dialog */}
      {successOrder && (
        <OrderSuccessDialog
          order={successOrder}
          onContinue={() => setSuccessOrder(null)}
          onClose={() => {
            setSuccessOrder(null)
            onClose()
          }}
        />
      )}

      {/* Bulk (full-cart) success summary */}
      {bulkResult && (
        <MultiOrderSuccessDialog
          result={bulkResult}
          onClose={() => {
            const hadFailures = bulkResult.failed.length > 0
            setBulkResult(null)
            if (!hadFailures) onClose()
          }}
        />
      )}
    </>
  )
}

// ─── Order success dialog ─────────────────────────────────────────────────────

const STATUS_AR: Record<string, string> = {
  pending: 'بانتظار قبول الموزّع',
  pending_approval: 'بانتظار موافقة المدير',
  accepted: 'مقبول',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
}

function OrderSuccessDialog({
  order,
  onContinue,
  onClose,
}: {
  order: CreatedOrder
  onContinue: () => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const shortId = order.id.slice(0, 8).toUpperCase()
  const statusText = STATUS_AR[order.status] ?? order.status

  const goToOrder = () => {
    onClose()
    navigate(`/pharmacy/orders/${order.id}`)
  }
  const goToOrders = () => {
    onClose()
    navigate('/pharmacy/orders')
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 animate-in fade-in duration-200" onClick={onContinue} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Banner */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 px-6 pt-7 pb-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-3">
            <PartyPopper size={30} className="text-white" />
          </div>
          <h2 className="text-lg font-bold text-white">تم إنشاء طلبك بنجاح!</h2>
          <p className="text-emerald-50 text-xs mt-1">
            أُرسل طلبك إلى <strong>{order.supplierName}</strong>
          </p>
        </div>

        {/* Details */}
        <div className="px-6 py-4 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">رقم الطلب</span>
            <span className="font-bold text-gray-900 tabular-nums">#{shortId}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">عدد الأصناف</span>
            <span className="font-semibold text-gray-800">{order.itemCount}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">الإجمالي</span>
            <span className="font-bold text-gray-900 tabular-nums">
              {Number(order.totalAmount).toFixed(2)} {order.currency || 'ج.م'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">الحالة</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
              <CheckCircle2 size={12} />
              {statusText}
            </span>
          </div>

          <div className="mt-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 flex items-start gap-2 text-[11px] text-gray-500">
            <ClipboardList size={13} className="shrink-0 mt-0.5 text-emerald-600" />
            <span className="leading-relaxed">
              تابِع حالة الطلب وتفاصيله في أي وقت من صفحة <strong className="text-gray-700">الطلبات</strong>.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 pt-1 space-y-2">
          <button
            type="button"
            onClick={goToOrder}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition-colors"
          >
            <ClipboardList size={16} />
            عرض الطلب وتتبّع الحالة
            <ArrowRight size={14} className="rtl:rotate-180" />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToOrders}
              className="flex-1 py-2.5 px-3 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold text-xs rounded-xl transition-colors"
            >
              كل الطلبات
            </button>
            <button
              type="button"
              onClick={onContinue}
              className="flex-1 py-2.5 px-3 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold text-xs rounded-xl transition-colors"
            >
              متابعة التسوّق
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Multi-order (full-cart) success summary ──────────────────────────────────

function MultiOrderSuccessDialog({
  result,
  onClose,
}: {
  result: BulkResult
  onClose: () => void
}) {
  const navigate = useNavigate()
  const total = result.orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0)
  const allOk = result.failed.length === 0

  const goToOrders = () => {
    onClose()
    navigate('/pharmacy/orders')
  }
  const openOrder = (id: string) => {
    onClose()
    navigate(`/pharmacy/orders/${id}`)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 animate-in fade-in duration-200" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Banner */}
        <div
          className={
            allOk
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 px-6 pt-7 pb-6 text-center'
              : 'bg-gradient-to-br from-amber-500 to-amber-600 px-6 pt-7 pb-6 text-center'
          }
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-3">
            {allOk ? (
              <PartyPopper size={30} className="text-white" />
            ) : (
              <AlertTriangle size={30} className="text-white" />
            )}
          </div>
          <h2 className="text-lg font-bold text-white">
            {result.orders.length > 0
              ? `تم إنشاء ${result.orders.length} طلب بنجاح!`
              : 'لم يتم إنشاء أي طلب'}
          </h2>
          <p className="text-white/90 text-xs mt-1">
            {result.orders.length > 0 && `الإجمالي ${total.toFixed(2)} ج.م`}
            {!allOk && ` · فشل ${result.failed.length} موزّع`}
          </p>
        </div>

        {/* List */}
        <div className="px-5 py-4 max-h-60 overflow-y-auto space-y-2">
          {result.orders.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => openOrder(o.id)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors text-right"
            >
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                <CheckCircle2 size={14} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-gray-800 truncate">{o.supplierName}</span>
                <span className="block text-[11px] text-gray-500 tabular-nums">
                  {o.itemCount} صنف · {Number(o.totalAmount).toFixed(2)} ج.م · #{o.id.slice(0, 8).toUpperCase()}
                </span>
              </span>
              <ArrowRight size={13} className="text-gray-400 rtl:rotate-180 shrink-0" />
            </button>
          ))}
          {result.failed.map((f, idx) => (
            <div
              key={`fail-${idx}`}
              className="flex items-center gap-3 p-2.5 rounded-xl border border-red-100 bg-red-50"
            >
              <span className="p-1.5 rounded-lg bg-red-100 text-red-600 shrink-0">
                <AlertTriangle size={14} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-gray-800 truncate">{f.supplierName}</span>
                <span className="block text-[11px] text-red-600">{f.error}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            type="button"
            onClick={goToOrders}
            className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition-colors"
          >
            كل الطلبات
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-3 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold text-sm rounded-xl transition-colors"
          >
            {allOk ? 'إغلاق' : 'إغلاق والمحاولة لاحقاً'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Per-store collapsible group ──────────────────────────────────────────────

function StoreGroup({
  group,
  onSetQty,
  onRemove,
  onClearSupplier,
  onOrderSuccess,
}: {
  group: ManualCartGroup
  onSetQty: (s: string, p: string, q: number) => void
  onRemove: (s: string, p: string) => void
  onClearSupplier: (s: string) => void
  onOrderSuccess: (order: CreatedOrder) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const qc = useQueryClient()
  const subtotal = groupSubtotal(group)

  const checkoutMutation = useMutation({
    mutationFn: () =>
      ordersApi.create({
        supplierTenantId: group.supplierTenantId,
        items: group.items.map((i) => ({
          productId: i.productId,
          quantity: i.qty,
          unitPrice: i.unitPrice,
        })),
        allowDuplicate: true,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      const order = res?.data ?? {}
      const itemCount = group.items.length
      const supplierName = group.supplierName
      onClearSupplier(group.supplierTenantId)
      onOrderSuccess({
        id: order.id,
        status: order.status ?? 'pending',
        totalAmount: order.totalAmount ?? subtotal,
        currency: order.currency,
        supplierName,
        itemCount,
      })
    },
  })

  const initials = group.supplierName.trim().slice(0, 2).toUpperCase() || 'م'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Store header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-gray-50 transition-colors text-start"
      >
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{group.supplierName}</p>
          <p className="text-[11px] text-gray-500">
            {group.items.length} صنف · {subtotal.toFixed(2)} ج.م
          </p>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {group.items.map((item) => (
            <div
              key={item.productId}
              className="flex items-center gap-3 px-3.5 py-2.5 border-b border-gray-50 last:border-0"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-contain" />
                ) : (
                  <Store size={16} className="text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{item.productName}</p>
                <p className="text-[11px] text-gray-500 tabular-nums">
                  {item.unitPrice.toFixed(2)} {item.currency} ×{' '}
                  <span className="font-semibold text-gray-700">
                    {(item.unitPrice * item.qty).toFixed(2)} ج.م
                  </span>
                </p>
              </div>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => onSetQty(group.supplierTenantId, item.productId, item.qty - 1)}
                  disabled={item.qty <= 1}
                  className="px-1.5 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                >
                  <Minus size={11} />
                </button>
                <span className="w-7 text-center text-xs font-semibold text-gray-800 tabular-nums">
                  {item.qty}
                </span>
                <button
                  type="button"
                  onClick={() => onSetQty(group.supplierTenantId, item.productId, item.qty + 1)}
                  className="px-1.5 py-1 text-gray-500 hover:bg-gray-100"
                >
                  <Plus size={11} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onRemove(group.supplierTenantId, item.productId)}
                className="p-1.5 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                title="حذف"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {/* Store footer */}
          <div className="px-3.5 py-3 bg-gray-50/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600">إجمالي هذا الموزّع</span>
              <span className="text-sm font-bold text-gray-900 tabular-nums">
                {subtotal.toFixed(2)} ج.م
              </span>
            </div>

            {checkoutMutation.isError && (
              <p className="mb-2 text-[11px] text-red-600 flex items-center gap-1">
                <AlertTriangle size={11} />
                فشل إنشاء الطلب — {(checkoutMutation.error as Error).message}
              </p>
            )}

            <button
              type="button"
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors"
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  جارٍ إنشاء الطلب…
                </>
              ) : (
                <>
                  <CheckCircle size={14} />
                  أكّد الطلب من {group.supplierName}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
