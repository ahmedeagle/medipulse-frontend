import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, ShoppingBag, Truck, CheckCircle2, Clock,
  XCircle, AlertCircle, Sparkles, Building2, Mail, MessageCircle, Phone,
  TrendingUp, RefreshCw, ChevronLeft, Trash2, Loader2,
  MapPin, PauseCircle, Ban, AlertTriangle, PackageCheck, Send, Repeat,
} from 'lucide-react'
import clsx from 'clsx'
import { ordersApi } from '../../api/orders.api'
import { supplierApi } from '../../api/supplier.api'
import { Modal } from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { usePaginatedList } from '../../hooks/usePaginatedList'
import type { Order, SupplierCatalogItem } from '../../types'

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const fmtMoney = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const shortId = (id: string) => id.slice(0, 8).toUpperCase()

// Heuristic origin detection — backend stamps cart-built orders with notes
// containing "خطة شراء ذكية" and basket-executor with "Supplier basket".
type OrderOrigin = 'ai_smart' | 'ai_basket' | 'manual'
function detectOrigin(o: Order): OrderOrigin {
  const n = (o.notes ?? '').toString()
  if (n.includes('خطة شراء ذكية') || n.includes('Smart plan')) return 'ai_smart'
  if (n.includes('Supplier basket') || n.includes('سلة شراء'))  return 'ai_basket'
  return 'manual'
}

const ORIGIN_BADGE: Record<OrderOrigin, { label: string; cls: string; Icon: typeof Sparkles }> = {
  ai_smart:  { label: '⚡ خطة ذكية',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: Sparkles },
  ai_basket: { label: '🧺 سلة موردين',   cls: 'bg-violet-50 text-violet-700 border-violet-200',    Icon: Sparkles },
  manual:    { label: 'يدوي',           cls: 'bg-gray-50 text-gray-600 border-gray-200',          Icon: Building2 },
}

// Map backend statuses to a handful of UX buckets the user cares about.
type StatusBucket = 'awaiting_dispatch' | 'in_transit' | 'received' | 'cancelled' | 'other'
function bucketOf(status: string): StatusBucket {
  switch (status) {
    case 'draft':
    case 'pending':
    case 'pending_approval':
    case 'submitted':
    case 'accepted':
    case 'counter_offer':
    case 'back_ordered':
      return 'awaiting_dispatch'
    case 'shipped':
    case 'on_hold':
    case 'failed_delivery':
    case 'received_pending_qc':
      return 'in_transit'
    case 'delivered':
    case 'partially_delivered':
      return 'received'
    case 'cancelled':
    case 'disputed':
    case 'return_requested':
    case 'return_approved':
    case 'return_in_transit':
    case 'return_received':
    case 'credit_issued':
      return 'cancelled'
    default:
      return 'other'
  }
}

const STATUS_LABEL_AR: Record<string, string> = {
  draft: 'مسودة',
  pending: 'بانتظار الإرسال',
  pending_approval: 'بانتظار موافقة المدير',
  submitted: 'مُرسل للمورد',
  counter_offer: 'عرض مضاد',
  accepted: 'مقبول',
  back_ordered: 'طلب مؤجل',
  shipped: 'تم الشحن',
  on_hold: 'موقوف',
  failed_delivery: 'فشل التسليم',
  received_pending_qc: 'مستلم — فحص جودة',
  delivered: 'مكتمل',
  partially_delivered: 'مكتمل جزئياً',
  cancelled: 'ملغى',
  disputed: 'نزاع',
  return_requested: 'مرتجع — طلب',
  return_approved: 'مرتجع — معتمد',
  return_in_transit: 'مرتجع — في الطريق',
  return_received: 'مرتجع — مستلم',
  credit_issued: 'إشعار دائن',
}

const STATUS_CLS: Record<StatusBucket, string> = {
  awaiting_dispatch: 'bg-amber-50 text-amber-700 border-amber-200',
  in_transit:        'bg-sky-50 text-sky-700 border-sky-200',
  received:          'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:         'bg-red-50 text-red-600 border-red-200',
  other:             'bg-gray-50 text-gray-600 border-gray-200',
}

const STATUS_ICON: Record<StatusBucket, typeof Clock> = {
  awaiting_dispatch: Clock,
  in_transit:        Truck,
  received:          CheckCircle2,
  cancelled:         XCircle,
  other:             AlertCircle,
}

function StatusChip({ status }: { status: string }) {
  const b = bucketOf(status)
  const Icon = STATUS_ICON[b]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium', STATUS_CLS[b])}>
      <Icon size={11} />
      {STATUS_LABEL_AR[status] ?? status}
    </span>
  )
}

function OriginBadge({ origin }: { origin: OrderOrigin }) {
  const { label, cls } = ORIGIN_BADGE[origin]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold', cls)}>
      {label}
    </span>
  )
}

// ── Supplier contact CTAs ───────────────────────────────────────────────────
// Until the full supplier-onboarding portal ships, suppliers maintain their
// reachability through `supplier_profiles` (phone / email / whatsapp). These
// buttons let the pharmacy buyer open WhatsApp / email / phone directly from
// the orders table to confirm dispatch, send invoice corrections, or chase a
// late delivery without leaving the platform.
function digitsOnly(s?: string | null): string | null {
  if (!s) return null
  const d = s.replace(/[^\d]/g, '')
  return d.length >= 6 ? d : null
}
function SupplierContactActions({ contact, supplierName }: {
  contact?: { phone: string | null; email: string | null; whatsapp: string | null } | null
  supplierName?: string | null
}) {
  if (!contact) return null
  const wa = digitsOnly(contact.whatsapp ?? contact.phone)
  const tel = digitsOnly(contact.phone)
  const greeting = encodeURIComponent(`مرحباً ${supplierName ?? ''}، بخصوص طلب الشراء...`)
  if (!wa && !contact.email && !tel) return null
  return (
    <div className="inline-flex items-center gap-1 ms-2" onClick={(e) => e.stopPropagation()}>
      {wa && (
        <a
          href={`https://wa.me/${wa}?text=${greeting}`}
          target="_blank" rel="noreferrer"
          title="فتح WhatsApp مع المورد"
          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          <MessageCircle size={12} />
        </a>
      )}
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          title={`إرسال بريد إلى ${contact.email}`}
          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <Mail size={12} />
        </a>
      )}
      {tel && (
        <a
          href={`tel:+${tel}`}
          title={`اتصال هاتفي ${tel}`}
          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Phone size={12} />
        </a>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface CartItem {
  productId: string
  productName: string
  quantity: number
}

const PAGE_SIZE = 20

export default function PharmacyOrdersPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [showCreate, setShowCreate] = useState(false)
  const [viewOrder, setViewOrder] = useState<Order | null>(null)

  // Filters
  const [qInput, setQInput] = useState('')
  const [activeBucket, setActiveBucket] = useState<StatusBucket | 'all'>('all')
  const [activeOrigin, setActiveOrigin] = useState<OrderOrigin | 'all'>('all')

  // Create form state
  const [supplierTenantId, setSupplierTenantId] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const ordersList = usePaginatedList<Order>({
    queryKey: ['orders'],
    fetchPage: ({ limit, offset }) =>
      ordersApi.getAll({ take: limit, skip: offset } as any).then((r) => r.data),
  })

  const { data: catalogData } = useQuery({
    queryKey: ['supplier-catalog-all'],
    queryFn: () => supplierApi.getCatalog({ limit: 200 }).then((r) => r.data?.data ?? r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => ordersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      setShowCreate(false)
      resetCreateForm()
    },
    onError: (err: any) => setFormError(err?.response?.data?.message || 'تعذر إنشاء الطلب'),
  })

  // ── One-click reorder ─────────────────────────────────────────────────────
  // Clones an existing order's supplier + items into a brand-new draft order.
  // Passes allowDuplicate so the backend's "same product+supplier within
  // recent window" guard doesn't reject the explicit reorder intent.
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const reorderMutation = useMutation({
    mutationFn: async (source: Order) => {
      const supplierId = (source as any).supplierTenantId ?? source.supplierTenant?.id
      if (!supplierId) throw new Error('لا يمكن إعادة الطلب — بيانات المورد ناقصة')
      const items = (source.items ?? []).map((i) => ({
        productId: (i as any).productId ?? i.product?.id,
        quantity:  i.quantity,
        unitPrice: Number(i.unitPrice),
      })).filter((i) => i.productId && i.quantity > 0)
      if (!items.length) throw new Error('لا يمكن إعادة الطلب — لا توجد أصناف صالحة')
      return ordersApi.create({
        supplierTenantId: supplierId,
        items,
        notes: `إعادة طلب من #${shortId(source.id)}`,
        allowDuplicate: true,
      } as any)
    },
    onMutate: (source) => { setReorderError(null); setReorderingId(source.id) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      setReorderingId(null)
    },
    onError: (err: any) => {
      setReorderError(err?.response?.data?.message || err?.message || 'تعذر إعادة الطلب')
      setReorderingId(null)
    },
  })

  const orders: Order[] = ordersList.items
  const catalog: SupplierCatalogItem[] = catalogData || []

  const supplierIds = [...new Set(catalog.map((c) => c.supplierTenantId))]
  const supplierMap = catalog.reduce<Record<string, string>>((acc, c) => {
    if (c.supplierTenant) acc[c.supplierTenantId] = c.supplierTenant.name
    return acc
  }, {})
  const filteredCatalog = supplierTenantId
    ? catalog.filter((c) => c.supplierTenantId === supplierTenantId && c.isAvailable)
    : []

  // Stats — derived in-memory from the page slice. For an at-a-glance hero
  // this is "good enough"; an analytics endpoint can replace it later
  // without changing the layout.
  const stats = useMemo(() => {
    const s = { awaiting: 0, transit: 0, received: 0, smartCount: 0, smartTotal: 0, manualTotal: 0 }
    for (const o of orders) {
      const b = bucketOf(o.status)
      if (b === 'awaiting_dispatch') s.awaiting++
      else if (b === 'in_transit')    s.transit++
      else if (b === 'received')      s.received++
      const origin = detectOrigin(o)
      const total = Number(o.totalAmount ?? 0)
      if (origin === 'ai_smart' || origin === 'ai_basket') {
        s.smartCount++
        s.smartTotal += total
      } else {
        s.manualTotal += total
      }
    }
    return s
  }, [orders])

  const visibleOrders = useMemo(() => {
    const q = qInput.trim().toLowerCase()
    return orders.filter((o) => {
      if (activeBucket !== 'all' && bucketOf(o.status) !== activeBucket) return false
      if (activeOrigin !== 'all' && detectOrigin(o) !== activeOrigin)    return false
      if (!q) return true
      const hay =
        `${o.id} ${o.supplierTenant?.name ?? ''} ${o.notes ?? ''} ` +
        (o.items ?? []).map(i => i.product?.name ?? '').join(' ')
      return hay.toLowerCase().includes(q)
    })
  }, [orders, qInput, activeBucket, activeOrigin])

  function resetCreateForm() {
    setSupplierTenantId('')
    setCart([])
    setNotes('')
    setFormError(null)
  }
  function addToCart(item: SupplierCatalogItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === item.product.id)
      if (existing) return prev.map((c) => c.productId === item.product.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { productId: item.product.id, productName: item.product.name, quantity: 1 }]
    })
  }
  function updateCartQty(productId: string, qty: number) {
    if (qty <= 0) setCart((prev) => prev.filter((c) => c.productId !== productId))
    else setCart((prev) => prev.map((c) => c.productId === productId ? { ...c, quantity: qty } : c))
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5" dir="rtl">
      {/* Hero card — white surface, emerald accents */}
      <div className="relative overflow-hidden rounded-3xl bg-white border border-gray-200 shadow-sm">
        <div className="absolute -top-16 -end-16 w-72 h-72 rounded-full bg-emerald-50/60 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -start-12 w-56 h-56 rounded-full bg-emerald-50/40 blur-3xl pointer-events-none" />
        <div className="relative px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold mb-1">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600">
                  <ShoppingBag size={14} />
                </span>
                <span>أوامر الشراء</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
                أوامر الشراء من الموردين
              </h1>
              <p className="text-gray-500 text-sm mt-1.5 max-w-xl">
                كل أمر تم إنشاؤه من <strong className="text-emerald-700">مركز الذكاء</strong> أو <strong className="text-emerald-700">خطة الشراء</strong> أو يدوياً يظهر هنا — مع شارة المصدر، حالة التسليم، وأدوات إرسال للمورد.
              </p>
            </div>
            <button
              onClick={() => { setShowCreate(true); resetCreateForm() }}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold rounded-xl shadow-sm transition-colors"
            >
              <Plus size={16} />
              إنشاء أمر يدوي
            </button>
          </div>

          {/* Stats strip */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <HeroStat icon={<Clock size={14} />}        label="بانتظار الإرسال" value={stats.awaiting} />
            <HeroStat icon={<Truck size={14} />}        label="في الطريق"       value={stats.transit} />
            <HeroStat icon={<CheckCircle2 size={14} />} label="استُلم"          value={stats.received} />
            <HeroStat icon={<Sparkles size={14} />}     label="من الذكاء"        value={`${stats.smartCount}`} sub={`${fmtMoney(stats.smartTotal)} ج.م`} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3.5 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400" />
            <input
              type="text"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="ابحث برقم الطلب، المورد، أو المنتج…"
              className="w-full ps-9 pe-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <button
            onClick={() => ordersList.refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
          >
            <RefreshCw size={13} />
            تحديث
          </button>
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-gray-400 font-medium me-1">الحالة:</span>
          <FilterPill active={activeBucket === 'all'}                onClick={() => setActiveBucket('all')}                label="الكل" count={orders.length} />
          <FilterPill active={activeBucket === 'awaiting_dispatch'}  onClick={() => setActiveBucket('awaiting_dispatch')}  label="بانتظار الإرسال" count={stats.awaiting} tone="amber" />
          <FilterPill active={activeBucket === 'in_transit'}         onClick={() => setActiveBucket('in_transit')}         label="في الطريق" count={stats.transit} tone="sky" />
          <FilterPill active={activeBucket === 'received'}           onClick={() => setActiveBucket('received')}           label="مستلم" count={stats.received} tone="emerald" />
          <FilterPill active={activeBucket === 'cancelled'}          onClick={() => setActiveBucket('cancelled')}          label="ملغى/مرتجع" count={orders.filter(o => bucketOf(o.status) === 'cancelled').length} tone="red" />

          <span className="mx-2 h-4 w-px bg-gray-200" />
          <span className="text-[11px] text-gray-400 font-medium me-1">المصدر:</span>
          <FilterPill active={activeOrigin === 'all'}       onClick={() => setActiveOrigin('all')}       label="جميع المصادر" />
          <FilterPill active={activeOrigin === 'ai_smart'}  onClick={() => setActiveOrigin('ai_smart')}  label="⚡ خطة ذكية"   tone="emerald" />
          <FilterPill active={activeOrigin === 'ai_basket'} onClick={() => setActiveOrigin('ai_basket')} label="🧺 سلة موردين" tone="violet" />
          <FilterPill active={activeOrigin === 'manual'}    onClick={() => setActiveOrigin('manual')}    label="يدوي" />
        </div>
      </div>

      {/* Table */}
      {reorderError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={14} />
          <span className="flex-1">{reorderError}</span>
          <button onClick={() => setReorderError(null)} className="text-red-500 hover:text-red-700">
            <XCircle size={14} />
          </button>
        </div>
      )}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {ordersList.isLoading ? (
          <div className="py-16 flex items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : visibleOrders.length === 0 ? (
          <EmptyState onCreate={() => { setShowCreate(true); resetCreateForm() }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  <th className="text-start px-4 py-3">رقم الطلب</th>
                  <th className="text-start px-4 py-3">المصدر</th>
                  <th className="text-start px-4 py-3">المورد</th>
                  <th className="text-end   px-4 py-3">الأصناف</th>
                  <th className="text-end   px-4 py-3">الإجمالي</th>
                  <th className="text-start px-4 py-3">الحالة</th>
                  <th className="text-start px-4 py-3">التاريخ</th>
                  <th className="text-end   px-4 py-3 w-1">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleOrders.map((o) => {
                  const origin = detectOrigin(o)
                  const itemCount = o.items?.length ?? 0
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setViewOrder(o)}
                      className="hover:bg-emerald-50/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{shortId(o.id)}</td>
                      <td className="px-4 py-3"><OriginBadge origin={origin} /></td>
                      <td className="px-4 py-3 text-gray-800">
                        <span className="inline-flex items-center">
                          {o.supplierTenant?.name ?? '—'}
                          <SupplierContactActions contact={o.supplierContact} supplierName={o.supplierTenant?.name} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end text-gray-700">{itemCount}</td>
                      <td className="px-4 py-3 text-end font-semibold text-gray-900">
                        {fmtMoney(o.totalAmount)} <span className="text-[11px] text-gray-400">ج.م</span>
                      </td>
                      <td className="px-4 py-3"><StatusChip status={o.status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(o.createdAt)}</td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); reorderMutation.mutate(o) }}
                            disabled={reorderingId === o.id}
                            title="إعادة طلب نفس الأصناف من نفس المورد"
                            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-60"
                          >
                            {reorderingId === o.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Repeat size={12} />}
                            إعادة
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewOrder(o) }}
                            className="text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            تفاصيل
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={ordersList.page}
          pageSize={ordersList.pageSize}
          total={ordersList.total}
          totalPages={ordersList.totalPages}
          onPageChange={ordersList.setPage}
          onPageSizeChange={ordersList.setPageSize}
          isLoading={ordersList.isFetching}
        />
      </div>

      {/* Order details drawer */}
      {viewOrder && (
        <OrderDetailDrawer
          order={viewOrder}
          onClose={() => setViewOrder(null)}
          onReorder={(o) => reorderMutation.mutate(o)}
          reordering={reorderingId === viewOrder.id}
        />
      )}

      {/* Create modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="إنشاء أمر شراء يدوي" size="lg">
        <div className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {formError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">المورد</label>
            <select
              value={supplierTenantId}
              onChange={(e) => { setSupplierTenantId(e.target.value); setCart([]) }}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">اختر مورداً…</option>
              {supplierIds.map((id) => (
                <option key={id} value={id}>{supplierMap[id] || id}</option>
              ))}
            </select>
          </div>
          {supplierTenantId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">المنتجات المتاحة</label>
              <div className="space-y-1.5 max-h-56 overflow-y-auto border border-gray-200 rounded-xl p-2">
                {filteredCatalog.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">لا توجد منتجات متاحة لهذا المورد</p>
                ) : (
                  filteredCatalog.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-3 py-2 hover:bg-emerald-50/40 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item.product?.name}</p>
                        <p className="text-xs text-gray-400">
                          {fmtMoney(item.price)} ج.م · متاح {item.stock}
                        </p>
                      </div>
                      <button
                        onClick={() => addToCart(item)}
                        className="text-xs px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors"
                      >
                        إضافة
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {cart.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">عربة الإنشاء</label>
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-800">{item.productName}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1} value={item.quantity}
                        onChange={(e) => updateCartQty(item.productId, Number(e.target.value))}
                        className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded-lg"
                      />
                      <button onClick={() => updateCartQty(item.productId, 0)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ملاحظات</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="ملاحظات اختيارية للمورد…"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">
              إلغاء
            </button>
            <button
              onClick={() => {
                if (!supplierTenantId || cart.length === 0) { setFormError('اختر مورداً وأضف منتجاً واحداً على الأقل'); return }
                createMutation.mutate({
                  supplierTenantId,
                  items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
                  notes: notes || undefined,
                })
              }}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl"
            >
              {createMutation.isPending ? 'جارٍ الإنشاء…' : 'إنشاء أمر الشراء'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Hero stat card ──────────────────────────────────────────────────────────

function HeroStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 border border-gray-100 px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 text-gray-500 text-[11px] font-medium">
        <span className="text-emerald-600">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-xl sm:text-2xl font-bold mt-1 leading-none text-emerald-700">{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

// ─── Filter pill ─────────────────────────────────────────────────────────────

function FilterPill({
  active, onClick, label, count, tone = 'gray',
}: {
  active: boolean; onClick: () => void; label: string; count?: number;
  tone?: 'gray' | 'amber' | 'sky' | 'emerald' | 'red' | 'violet';
}) {
  const cls = active
    ? {
        gray:    'bg-gray-900 text-white border-gray-900',
        amber:   'bg-amber-600 text-white border-amber-600',
        sky:     'bg-sky-600 text-white border-sky-600',
        emerald: 'bg-emerald-600 text-white border-emerald-600',
        red:     'bg-red-600 text-white border-red-600',
        violet:  'bg-violet-600 text-white border-violet-600',
      }[tone]
    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors', cls)}
    >
      {label}
      {count !== undefined && (
        <span className={clsx('inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold',
          active ? 'bg-white/20' : 'bg-gray-100 text-gray-600')}>
          {count}
        </span>
      )}
    </button>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-400">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
        <ShoppingBag size={22} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700">لا توجد أوامر شراء مطابقة</p>
        <p className="text-xs text-gray-400 mt-0.5">جرّب تغيير الفلترة، أو ابدأ بأمر يدوي.</p>
      </div>
      <button
        onClick={onCreate}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
      >
        <Plus size={13} />
        إنشاء أمر يدوي
      </button>
    </div>
  )
}

// ─── Detail drawer ───────────────────────────────────────────────────────────

// Status → which pharmacy-side lifecycle actions are available. Drives the
// drawer footer so admins always see the *correct* next step for an order
// instead of a blanket "send by email" button regardless of state.
type LifecycleAction = {
  key: string
  label: string
  tone: 'emerald' | 'red' | 'amber' | 'sky' | 'gray'
  icon: typeof CheckCircle2
  requiresReason?: boolean
}
function pharmacyActionsFor(status: string): LifecycleAction[] {
  switch (status) {
    case 'pending_approval':
      return [
        { key: 'approve', label: 'موافقة المدير', tone: 'emerald', icon: CheckCircle2 },
        { key: 'cancel',  label: 'إلغاء',         tone: 'red',     icon: Ban, requiresReason: true },
      ]
    case 'draft':
      return [
        { key: 'submit', label: 'إرسال للمورد', tone: 'emerald', icon: Send },
        { key: 'cancel', label: 'إلغاء',         tone: 'red',     icon: Ban, requiresReason: true },
      ]
    case 'submitted':
    case 'accepted':
    case 'back_ordered':
    case 'on_hold':
      return [
        { key: 'cancel', label: 'إلغاء الأمر', tone: 'red',   icon: Ban,          requiresReason: true },
        { key: 'hold',   label: 'تعليق',        tone: 'amber', icon: PauseCircle,  requiresReason: true },
      ]
    case 'counter_offer':
      return [
        { key: 'accept-counter', label: 'قبول العرض المضاد', tone: 'emerald', icon: CheckCircle2 },
        { key: 'cancel',         label: 'رفض وإلغاء',        tone: 'red',     icon: Ban, requiresReason: true },
      ]
    case 'shipped':
    case 'received_pending_qc':
      return [
        { key: 'receive', label: 'تأكيد الاستلام', tone: 'emerald', icon: PackageCheck },
        { key: 'dispute', label: 'فتح نزاع',        tone: 'red',     icon: AlertTriangle, requiresReason: true },
      ]
    case 'failed_delivery':
      return [
        { key: 'dispute', label: 'فتح نزاع',  tone: 'red',   icon: AlertTriangle, requiresReason: true },
        { key: 'cancel',  label: 'إلغاء الأمر', tone: 'red', icon: Ban,           requiresReason: true },
      ]
    case 'delivered':
    case 'partially_delivered':
      return [
        { key: 'return',  label: 'بدء مرتجع', tone: 'sky', icon: RefreshCw },
        { key: 'dispute', label: 'فتح نزاع',   tone: 'red', icon: AlertTriangle, requiresReason: true },
      ]
    case 'disputed':
      return [
        { key: 'return', label: 'بدء مرتجع', tone: 'sky', icon: RefreshCw },
      ]
    default:
      return []
  }
}
const ACTION_TONE_CLS: Record<LifecycleAction['tone'], string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600',
  red:     'bg-white hover:bg-red-50 text-red-700 border-red-200',
  amber:   'bg-white hover:bg-amber-50 text-amber-700 border-amber-200',
  sky:     'bg-white hover:bg-sky-50 text-sky-700 border-sky-200',
  gray:    'bg-white hover:bg-gray-50 text-gray-700 border-gray-200',
}

function OrderDetailDrawer({ order, onClose, onReorder, reordering }: {
  order: Order;
  onClose: () => void;
  onReorder?: (o: Order) => void;
  reordering?: boolean;
}) {
  const qc = useQueryClient()
  const origin = detectOrigin(order)
  const subtotal = (order.items ?? []).reduce((s, i) => s + Number(i.totalPrice ?? 0), 0)
  const supplierName = order.supplierTenant?.name ?? 'المورد'

  // ── Real AI plan-context (replaces hardcoded generic explainability) ─────
  // Backend resolves the upstream ProcurementDraft (if any) and returns the
  // planSnapshot, splitSource, supplier/buyer city, sameCity flag. For
  // manual orders all fields are null and we render an honest fallback.
  const aiCtx = useQuery({
    queryKey: ['order-ai-context', order.id],
    queryFn:  () => ordersApi.getAiContext(order.id).then(r => r.data),
    staleTime: 60_000,
  })

  // ── Lifecycle action handling ────────────────────────────────────────────
  const actions = pharmacyActionsFor(order.status)
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['order-ai-context', order.id] })
  }

  const runAction = async (a: LifecycleAction) => {
    setActionError(null)
    if (a.requiresReason && reason.trim().length < 3) {
      setActionError('من فضلك اكتب السبب أولاً (3 أحرف على الأقل).')
      return
    }
    setPendingKey(a.key)
    try {
      switch (a.key) {
        case 'approve':
          await ordersApi.approve(order.id); break
        case 'submit':
          await ordersApi.updateStatus(order.id, 'submitted'); break
        case 'cancel':
          await ordersApi.updateStatus(order.id, 'cancelled', reason); break
        case 'hold':
          await ordersApi.hold(order.id, reason); break
        case 'accept-counter':
          await ordersApi.updateStatus(order.id, 'accepted'); break
        case 'dispute':
          await ordersApi.dispute(order.id, reason); break
        case 'receive': {
          // Default "accept everything ordered" receipt — for v1.
          // Future: open a sub-modal for per-item QC quantities.
          const items = (order.items ?? []).map(i => ({
            orderItemId:      i.id!,
            quantityAccepted: i.quantity,
          }))
          await ordersApi.confirmReceipt(order.id, { items })
          break
        }
        case 'return': {
          const items = (order.items ?? []).map(i => ({
            orderItemId: i.id!,
            productId:   i.product?.id ?? (i as any).productId,
            quantity:    i.quantity,
            returnReason: reason || 'بدون سبب محدد',
          }))
          await ordersApi.initiateReturn(order.id, items as any)
          break
        }
      }
      refresh()
      onClose()
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'تعذر تنفيذ الإجراء')
    } finally {
      setPendingKey(null)
    }
  }

  // Manual dispatch payloads (kept available for early-stage orders that
  // need to be physically emailed/WhatsApp'd to the supplier).
  const dispatchBody = useMemo(() => {
    const lines = [
      `طلب شراء جديد — رقم ${shortId(order.id)}`,
      `التاريخ: ${fmtDate(order.createdAt)}`,
      '',
      'الأصناف:',
      ...(order.items ?? []).map((i, idx) =>
        `${idx + 1}. ${i.product?.name ?? ''} × ${i.quantity} @ ${fmtMoney(i.unitPrice)} ج.م`,
      ),
      '',
      `الإجمالي: ${fmtMoney(order.totalAmount)} ج.م`,
      order.notes ? `\nملاحظات: ${order.notes}` : '',
    ].filter(Boolean)
    return lines.join('\n')
  }, [order])

  const mailtoHref =
    `mailto:?subject=${encodeURIComponent(`أمر شراء ${shortId(order.id)} من ${supplierName}`)}` +
    `&body=${encodeURIComponent(dispatchBody)}`
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(dispatchBody)}`

  // ── AI explainability content (pulled from real planSnapshot) ────────────
  const ctx = aiCtx.data
  const plan = (ctx?.planSnapshot ?? null) as any
  const reasonText: string | null = plan?.explainability?.selectedPlanReason ?? null
  const computed   = plan?.explainability?.computedSignals ?? null
  const finImpact  = plan?.explainability?.financialImpact ?? null
  const splits     = (plan?.splits ?? []) as Array<{ source: string; sourceName: string; qty: number; unitPrice: number; reason: string }>
  const overpay    = plan?.overpaymentRecommendation ?? null
  const reasonsRequired = actions.some(a => a.requiresReason)

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-0 end-0 w-full max-w-xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold text-gray-900 text-base">طلب #{shortId(order.id)}</h2>
              <OriginBadge origin={origin} />
            </div>
            <p className="text-xs text-gray-500">{supplierName} · {fmtDate(order.createdAt)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <ChevronLeft size={18} />
          </button>
        </div>

        {/* Status */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/40 flex items-center justify-between">
          <StatusChip status={order.status} />
          <span className="text-xs text-gray-500">المبلغ <strong className="text-gray-900">{fmtMoney(order.totalAmount)} ج.م</strong></span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Geography / city context — always shown (whether AI or manual) */}
          {ctx && (ctx.supplierCity || ctx.buyerCity) && (
            <div className={clsx(
              'rounded-2xl border p-3 flex items-start gap-2 text-xs',
              ctx.sameCity
                ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                : 'border-amber-200 bg-amber-50/60 text-amber-900'
            )}>
              <MapPin size={14} className="mt-0.5 shrink-0" />
              <div className="leading-relaxed">
                {ctx.sameCity ? (
                  <>
                    <strong>نفس مدينتك</strong> — المورد في <strong>{ctx.supplierCity}</strong>،
                    وأنت في <strong>{ctx.buyerCity}</strong>. توصيل أسرع وتكاليف شحن أقل.
                  </>
                ) : (
                  <>
                    <strong>مدينة مختلفة</strong> — المورد في <strong>{ctx.supplierCity ?? '—'}</strong>،
                    وأنت في <strong>{ctx.buyerCity ?? '—'}</strong>. قد يستغرق التوصيل وقتاً أطول.
                  </>
                )}
              </div>
            </div>
          )}

          {/* AI explainability — real data only */}
          {origin !== 'manual' && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-emerald-600" />
                <h3 className="text-sm font-semibold text-emerald-900">لماذا اقترح الذكاء هذا الطلب؟</h3>
              </div>

              {aiCtx.isLoading ? (
                <div className="text-xs text-emerald-900/70 flex items-center gap-2 py-1">
                  <Loader2 size={12} className="animate-spin" /> جارٍ تحميل سياق القرار…
                </div>
              ) : reasonText ? (
                <>
                  <p className="text-xs text-emerald-900 leading-relaxed mb-2">{reasonText}</p>
                  <ul className="text-xs text-emerald-900/90 leading-relaxed space-y-1.5 list-disc ps-4">
                    {splits.map((s, idx) => (
                      <li key={idx}>
                        <strong>{s.source === 'p2p' ? 'بورصة' : 'مورد'}: {s.sourceName}</strong> — {s.qty} وحدة @ {fmtMoney(s.unitPrice)} ج.م. <span className="text-emerald-800/80">{s.reason}</span>
                      </li>
                    ))}
                    {computed && (
                      <li>
                        <strong>الإشارات:</strong>
                        {' '}إلحاحية {Math.round(computed.urgencyScore)}/100،
                        {' '}مخاطر مالية: {computed.financialRisk === 'high' ? 'مرتفعة' : computed.financialRisk === 'medium' ? 'متوسطة' : 'منخفضة'}
                        {computed.marketShortageRisk ? '، شُحّ بالسوق' : ''}
                      </li>
                    )}
                    {finImpact && (
                      <li>
                        <strong>التأثير المالي:</strong> الإجمالي {fmtMoney(finImpact.totalCost)} ج.م
                        {finImpact.savedVsHistoricalAvg > 0 && (
                          <> — وفّر <strong>{fmtMoney(finImpact.savedVsHistoricalAvg)} ج.م</strong> مقابل المتوسط التاريخي.</>
                        )}
                      </li>
                    )}
                  </ul>
                  {overpay && (
                    <div className="mt-3 pt-3 border-t border-amber-200/60 text-[11px] text-amber-800 flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5" />
                      <span><strong>تنبيه دفع زائد:</strong> {overpay.humanReason}</span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-emerald-900/70 leading-relaxed">
                  لم نعثر على لقطة قرار محفوظة لهذا الطلب — قد يكون أُنشئ قبل تفعيل تسجيل خطط الشراء.
                </p>
              )}

              {order.notes && (
                <div className="mt-3 pt-3 border-t border-emerald-200/60 text-[11px] text-emerald-900/70">
                  <strong>ملاحظة النظام:</strong> {order.notes}
                </div>
              )}
            </div>
          )}

          {origin === 'manual' && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-3 text-xs text-gray-700">
              <strong className="text-gray-900">طلب يدوي:</strong> أنشأه فريقك مباشرة — لم يمر بخطة الذكاء الاصطناعي.
            </div>
          )}

          {/* Items */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">الأصناف ({order.items?.length ?? 0})</h3>
            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] text-gray-500 font-medium uppercase">
                  <tr>
                    <th className="text-start px-4 py-2.5">المنتج</th>
                    <th className="text-end   px-4 py-2.5">الكمية</th>
                    <th className="text-end   px-4 py-2.5">سعر الوحدة</th>
                    <th className="text-end   px-4 py-2.5">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(order.items ?? []).map((i, idx) => (
                    <tr key={i.id ?? idx}>
                      <td className="px-4 py-2.5 text-gray-800">{i.product?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-end text-gray-700">{i.quantity}</td>
                      <td className="px-4 py-2.5 text-end text-gray-700">{fmtMoney(i.unitPrice)}</td>
                      <td className="px-4 py-2.5 text-end font-semibold text-gray-900">{fmtMoney(i.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-100">
                  <tr>
                    <td colSpan={3} className="px-4 py-2.5 text-end font-semibold text-gray-600">المجموع قبل الضريبة</td>
                    <td className="px-4 py-2.5 text-end font-semibold text-gray-900">{fmtMoney(subtotal)} ج.م</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td colSpan={3} className="px-4 py-2.5 text-end font-bold text-gray-700">الإجمالي</td>
                    <td className="px-4 py-2.5 text-end font-bold text-emerald-700 text-base">{fmtMoney(order.totalAmount)} ج.م</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          {origin === 'manual' && order.notes && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-700">
              <strong className="text-gray-900">ملاحظات:</strong> {order.notes}
            </div>
          )}

          {/* Reason field — shown only when an available action requires it */}
          {reasonsRequired && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                السبب <span className="text-gray-400">(مطلوب لإجراءات الإلغاء/التعليق/النزاع)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="مثال: المورد تأخر في الشحن…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>
          )}

          {actionError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {actionError}
            </div>
          )}
        </div>

        {/* Footer — lifecycle action buttons + manual dispatch */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center gap-2 flex-wrap">
          {/* Manual dispatch links only useful for early stages (draft/submitted) */}
          {(['draft', 'submitted', 'pending_approval'] as string[]).includes(order.status) && (
            <>
              <a
                href={mailtoHref}
                target="_blank"
                rel="noopener noreferrer"
                title="إرسال بالإيميل"
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl transition-colors"
              >
                <Mail size={13} className="text-emerald-600" />
              </a>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                title="إرسال WhatsApp"
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl transition-colors"
              >
                <MessageCircle size={13} className="text-emerald-600" />
              </a>
              <span className="h-5 w-px bg-gray-200 mx-1" />
            </>
          )}

          {actions.map((a) => {
            const Icon = a.icon
            const busy = pendingKey === a.key
            return (
              <button
                key={a.key}
                onClick={() => runAction(a)}
                disabled={busy || !!pendingKey}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
                  ACTION_TONE_CLS[a.tone],
                )}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                {a.label}
              </button>
            )
          })}

          <div className="flex-1" />
          {onReorder && (
            <button
              onClick={() => onReorder(order)}
              disabled={reordering}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700 rounded-xl disabled:opacity-60"
              title="إعادة طلب نفس الأصناف من نفس المورد"
            >
              {reordering ? <Loader2 size={13} className="animate-spin" /> : <Repeat size={13} />}
              إعادة الطلب
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}
