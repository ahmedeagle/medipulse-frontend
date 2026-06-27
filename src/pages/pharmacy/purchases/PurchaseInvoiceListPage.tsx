import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, FileText, TrendingUp, CreditCard, AlertCircle,
  CheckCircle2, Clock, XCircle, Download, Printer,
  Building2, RefreshCw, ShoppingBag, ListChecks,
  MoreVertical, Pencil, History, Bot, User,
  ChevronLeft, Calendar,
} from 'lucide-react'
import clsx from 'clsx'
import { purchasesApi, type PurchaseInvoice, type InvoiceChangelogEntry } from '../../../api/purchases.api'
import Pagination from '../../../components/ui/Pagination'
import { buildInvoicePrintHtml } from './buildInvoicePrintHtml'
import PurchaseAnalyticsStrip from './PurchaseAnalyticsStrip'

const PAGE_SIZE = 20

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const fmtMoney = (n: number | string) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function StatusChip({ status }: { status: PurchaseInvoice['status'] }) {
  const map = {
    draft:     { label: 'مسودة',   cls: 'bg-gray-100 text-gray-600',       Icon: Clock },
    received:  { label: 'مستلمة', cls: 'bg-emerald-50 text-emerald-700',   Icon: CheckCircle2 },
    paid:      { label: 'مدفوعة', cls: 'bg-emerald-50 text-emerald-700',   Icon: CheckCircle2 },
    cancelled: { label: 'ملغاة',  cls: 'bg-red-50 text-red-600',           Icon: XCircle },
  }
  const { label, cls, Icon } = map[status] ?? map.draft
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cls)}>
      <Icon size={11} /> {label}
    </span>
  )
}

function PaymentChip({ status }: { status: 'pending' | 'paid' }) {
  if (status === 'paid') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
      <CheckCircle2 size={11} /> مدفوع
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
      <AlertCircle size={11} /> معلق
    </span>
  )
}

// ── Action labels for changelog ──────────────────────────────────────────────
const ACTION_LABELS: Record<InvoiceChangelogEntry['action'], { label: string; cls: string }> = {
  created:   { label: 'تم الإنشاء',    cls: 'bg-emerald-100 text-emerald-700' },
  updated:   { label: 'تم التعديل',    cls: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'تم الاستلام',   cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'تم الإلغاء',    cls: 'bg-red-100 text-red-600' },
  paid:      { label: 'تم الدفع',      cls: 'bg-violet-100 text-violet-700' },
}

// ── Row ⋮ dropdown ───────────────────────────────────────────────────────────
interface RowMenuProps {
  inv: PurchaseInvoice
  onConfirm: () => void
  onPay: () => void
  onCancel: () => void
  onPrint: () => void
  onExport: () => void
  onChangelog: () => void
  confirmPending: boolean
  payPending: boolean
  cancelPending: boolean
  printingId: string | null
}
function RowMenu({
  inv, onConfirm, onPay, onCancel, onPrint, onExport, onChangelog,
  confirmPending, payPending, cancelPending, printingId,
}: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const btn = (label: string, icon: React.ReactNode, onClick: () => void, cls = '') => (
    <button
      className={clsx('w-full flex items-center gap-2 px-3 py-2 text-sm text-right hover:bg-gray-50 transition-colors', cls)}
      onClick={() => { setOpen(false); onClick() }}
    >
      {icon}
      {label}
    </button>
  )

  const rect = btnRef.current?.getBoundingClientRect()
  const MENU_HEIGHT = 260
  const openUpward = rect ? (window.innerHeight - rect.bottom) < MENU_HEIGHT : false
  const menuStyle: React.CSSProperties = rect ? {
    position: 'fixed',
    ...(openUpward
      ? { bottom: window.innerHeight - rect.top + 4 }
      : { top: rect.bottom + 4 }),
    left: Math.min(rect.left, window.innerWidth - 210),
    zIndex: 9999,
  } : { position: 'fixed', zIndex: 9999 }

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={menuStyle}
          className="w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 overflow-hidden"
        >
          {inv.status === 'draft' && btn('استلام الفاتورة', <CheckCircle2 size={14} className="text-emerald-600" />, onConfirm, confirmPending ? 'opacity-60 pointer-events-none' : '')}
          {inv.status === 'received' && inv.paymentStatus === 'pending' && btn('تسجيل الدفع', <CreditCard size={14} className="text-emerald-600" />, onPay, payPending ? 'opacity-60 pointer-events-none' : '')}
          {inv.status === 'draft' && btn('تعديل الفاتورة', <Pencil size={14} className="text-gray-500" />, () => navigate(`/pharmacy/purchases/invoices/${inv.id}/edit`))}
          <div className="border-t border-gray-100 my-1" />
          {btn('طباعة / PDF', <Printer size={14} className="text-gray-500" />, onPrint, printingId === inv.id ? 'opacity-60 pointer-events-none' : '')}
          {btn('تصدير إكسل', <Download size={14} className="text-emerald-600" />, onExport)}
          {btn('سجل التغييرات', <History size={14} className="text-violet-500" />, onChangelog)}
          {inv.status === 'draft' && (
            <>
              <div className="border-t border-gray-100 my-1" />
              {btn('إلغاء الفاتورة', <XCircle size={14} className="text-red-500" />, onCancel, clsx('text-red-600', cancelPending ? 'opacity-60 pointer-events-none' : ''))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Changelog Drawer ─────────────────────────────────────────────────────────
function ChangelogDrawer({ invoiceId, poNumber, onClose }: { invoiceId: string; poNumber: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-changelog', invoiceId],
    queryFn: () => purchasesApi.getInvoiceChangelog(invoiceId),
    staleTime: 30_000,
  })

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-base">سجل التغييرات</h2>
            <p className="text-xs text-gray-500 mt-0.5">{poNumber}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <ChevronLeft size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-600 border-t-transparent" />
              <p className="text-sm">جارٍ التحميل…</p>
            </div>
          )}
          {!isLoading && !data?.length && (
            <div className="flex flex-col items-center gap-2 py-16 text-gray-300">
              <History size={36} />
              <p className="text-sm text-gray-400">لا توجد تغييرات مسجلة</p>
            </div>
          )}
          {data && data.length > 0 && (
            <div className="space-y-4">
              {data.map((entry, idx) => {
                const { label, cls } = ACTION_LABELS[entry.action] ?? ACTION_LABELS.updated
                return (
                  <div key={entry.id} className="flex gap-3">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                      <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0', cls)}>
                        {idx + 1}
                      </div>
                      {idx < data.length - 1 && <div className="w-px flex-1 bg-gray-100 min-h-[16px]" />}
                    </div>

                    {/* Entry card */}
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', cls)}>
                          {label}
                        </span>
                        <span className="text-[11px] text-gray-400">{fmtDateTime(entry.createdAt)}</span>
                      </div>

                      {/* User */}
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                          <User size={11} className="text-gray-500" />
                        </div>
                        <span className="text-xs text-gray-500">
                          {entry.userName || entry.userEmail || 'مستخدم النظام'}
                        </span>
                      </div>

                      {/* Changes */}
                      {entry.changes && entry.changes.length > 0 && (
                        <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-100/60">
                                <th className="text-right px-3 py-2 font-medium text-gray-500">الحقل</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-500">القيمة القديمة</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-500">القيمة الجديدة</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {entry.changes.map((ch, ci) => (
                                <tr key={ci}>
                                  <td className="px-3 py-2 text-gray-700 font-medium">
                                    {ch.fieldLabel}
                                    {ch.productName && <span className="text-gray-400 font-normal"> — {ch.productName}</span>}
                                  </td>
                                  <td className="px-3 py-2 text-red-500">{ch.oldValue ?? <span className="text-gray-300">—</span>}</td>
                                  <td className="px-3 py-2 text-emerald-600">{ch.newValue ?? <span className="text-gray-300">—</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PurchaseInvoiceListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [payStatus, setPayStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [changelogInv, setChangelogInv] = useState<PurchaseInvoice | null>(null)
  const [supplier, setSupplier] = useState('')

  useEffect(() => {
    const id = setTimeout(() => { setQ(qInput); setPage(1) }, 300)
    return () => clearTimeout(id)
  }, [qInput])

  const activeFilters = {
    q: q || undefined,
    status: status || undefined,
    paymentStatus: payStatus || undefined,
    supplierId: supplier || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await purchasesApi.exportInvoices({ ...activeFilters, limit: 100000 })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `purchases_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const handleExportSingle = async (inv: PurchaseInvoice) => {
    setExportingId(inv.id)
    try {
      const blob = await purchasesApi.exportSingleInvoice(inv.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${inv.poNumber}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingId(null)
    }
  }

  const handlePrint = async (id: string) => {
    setPrintingId(id)
    try {
      const inv = await purchasesApi.getInvoice(id)
      const html = buildInvoicePrintHtml(inv)
      const win = window.open('', '_blank', 'width=960,height=700')
      if (!win) return
      win.document.write(html)
      win.document.close()
    } finally {
      setPrintingId(null)
    }
  }

  const { data: stats } = useQuery({
    queryKey: ['purchase-stats'],
    queryFn: purchasesApi.getStats,
    staleTime: 30_000,
  })

  const { data: suppliers } = useQuery({
    queryKey: ['purchase-suppliers'],
    queryFn: purchasesApi.getSuppliers,
    staleTime: 60_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-invoices', page, q, status, payStatus, dateFrom, dateTo, supplier],
    queryFn: () => purchasesApi.getInvoices({ page, limit: PAGE_SIZE, ...activeFilters }),
    staleTime: 15_000,
  })

  const confirmMut = useMutation({
    mutationFn: purchasesApi.confirmInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] })
      qc.invalidateQueries({ queryKey: ['purchase-stats'] })
    },
  })
  const payMut = useMutation({
    mutationFn: purchasesApi.markPaid,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] })
      qc.invalidateQueries({ queryKey: ['purchase-stats'] })
    },
  })
  const cancelMut = useMutation({
    mutationFn: purchasesApi.cancelInvoice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-invoices'] }),
  })

  const tiles = [
    {
      label: 'فواتير هذا الشهر',
      hint: 'عدد الفواتير المنشأة هذا الشهر',
      value: stats ? Number(stats.thisMonthCount).toLocaleString('en-US') : '—',
      icon: FileText,
      color: 'bg-emerald-50 text-emerald-700',
      border: 'border-emerald-200',
    },
    {
      label: 'مشتريات هذا الشهر',
      hint: 'إجمالي قيمة الفواتير المستلمة',
      value: stats ? fmtMoney(stats.thisMonthValue) + ' ر.س' : '—',
      icon: TrendingUp,
      color: 'bg-emerald-50 text-emerald-700',
      border: 'border-emerald-200',
    },
    {
      label: 'مستحقات الدفع',
      hint: 'فواتير مستلمة ولم يُسجَّل دفعها بعد',
      value: stats ? fmtMoney(stats.totalPending) + ' ر.س' : '—',
      icon: CreditCard,
      color: 'bg-amber-50 text-amber-700',
      border: 'border-amber-200',
    },
    {
      label: 'قائمة الأمنيات',
      hint: 'الأصناف المقترحة للشراء',
      value: stats ? String(stats.wishListCount) : '—',
      icon: ListChecks,
      color: 'bg-pink-50 text-pink-700',
      border: 'border-pink-200',
      to: '/pharmacy/purchases/wishlist',
    },
  ]

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة المشتريات</h1>
          <p className="text-sm text-gray-500 mt-0.5">سجل الفواتير والمرتجعات وإدارة المخزون</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-60"
          >
            <Download size={15} />
            {exporting ? 'جارٍ التصدير…' : 'تصدير Excel'}
          </button>
          <Link
            to="/pharmacy/purchases/returns"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={15} />
            المرتجعات
          </Link>
          <Link
            to="/pharmacy/purchases/wishlist"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ListChecks size={15} />
            قائمة الأمنيات
          </Link>
          <Link
            to="/pharmacy/purchases/invoices/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium shadow-sm"
          >
            <Plus size={15} />
            فاتورة جديدة
          </Link>
        </div>
      </div>

      {/* Stats tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((tile) => {
          const Icon = tile.icon
          const card = (
            <div className={clsx('bg-white rounded-2xl border p-4 flex items-center gap-3', tile.border)}>
              <div className={clsx('p-2.5 rounded-xl shrink-0', tile.color)}>
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700">{tile.label}</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">{tile.value}</p>
                {tile.hint && <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{tile.hint}</p>}
              </div>
            </div>
          )
          return tile.to
            ? <Link key={tile.label} to={tile.to}>{card}</Link>
            : <div key={tile.label}>{card}</div>
        })}
      </div>

      {/* Analytics strip — spend trend, payment mix, top suppliers */}
      <PurchaseAnalyticsStrip filters={activeFilters} />

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
        {/* Row 1: Search + Status + Payment */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="بحث برقم الفاتورة أو رقم فاتورة المورد…"
              value={qInput}
              onChange={e => setQInput(e.target.value)}
              className="w-full pr-9 pl-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[130px]"
          >
            <option value="">كل الحالات</option>
            <option value="draft">مسودة</option>
            <option value="received">مستلمة</option>
            <option value="paid">مدفوعة</option>
            <option value="cancelled">ملغاة</option>
          </select>
          <select
            value={payStatus}
            onChange={e => { setPayStatus(e.target.value); setPage(1) }}
            className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[140px]"
          >
            <option value="">كل حالات الدفع</option>
            <option value="pending">معلقة</option>
            <option value="paid">مدفوعة</option>
          </select>
        </div>

        {/* Row 2: Supplier + Date range */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Supplier filter */}
          <select
            value={supplier}
            onChange={e => { setSupplier(e.target.value); setPage(1) }}
            className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[160px]"
          >
            <option value="">كل الموردين</option>
            {suppliers?.map(s => (
              <option key={s.id} value={s.supplierTenantId ?? s.id}>{s.name}</option>
            ))}
          </select>

          {/* Date range — beautiful pill design */}
          <div className={clsx(
            'flex items-center gap-0 rounded-xl border overflow-hidden transition-colors flex-1',
            (dateFrom || dateTo) ? 'border-emerald-400 bg-emerald-50/30' : 'border-gray-200 bg-white'
          )}>
            <div className="flex items-center gap-2 px-3 py-2 flex-1 border-l border-gray-200">
              <Calendar size={14} className={dateFrom ? 'text-emerald-600' : 'text-gray-400'} />
              <label className="text-xs text-gray-400 shrink-0">من</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 min-w-0"
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 flex-1">
              <Calendar size={14} className={dateTo ? 'text-emerald-600' : 'text-gray-400'} />
              <label className="text-xs text-gray-400 shrink-0">إلى</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1) }}
                className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 min-w-0"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
                className="px-3 py-2 text-gray-400 hover:text-red-500 transition-colors border-r border-gray-200"
                title="مسح التواريخ"
              >
                <XCircle size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {(status || payStatus || supplier || dateFrom || dateTo) && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-xs text-gray-400">التصفية النشطة:</span>
            {status && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                {status === 'draft' ? 'مسودة' : status === 'received' ? 'مستلمة' : status === 'paid' ? 'مدفوعة' : 'ملغاة'}
                <button onClick={() => { setStatus(''); setPage(1) }} className="hover:text-red-500"><XCircle size={11} /></button>
              </span>
            )}
            {payStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                {payStatus === 'pending' ? 'دفع معلق' : 'مدفوع'}
                <button onClick={() => { setPayStatus(''); setPage(1) }} className="hover:text-red-500"><XCircle size={11} /></button>
              </span>
            )}
            {supplier && suppliers && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                {suppliers.find(s => (s.supplierTenantId ?? s.id) === supplier)?.name ?? 'مورد'}
                <button onClick={() => { setSupplier(''); setPage(1) }} className="hover:text-red-500"><XCircle size={11} /></button>
              </span>
            )}
            {(dateFrom || dateTo) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs">
                {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : dateFrom ? `من ${dateFrom}` : `إلى ${dateTo}`}
                <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }} className="hover:text-red-500"><XCircle size={11} /></button>
              </span>
            )}
            <button
              onClick={() => { setStatus(''); setPayStatus(''); setSupplier(''); setDateFrom(''); setDateTo(''); setPage(1) }}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              مسح الكل
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">رقم الفاتورة</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">المورد</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">عدد المنتجات</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">تاريخ الفاتورة</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">آخر تعديل</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">الحالة</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">الدفع</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">طريقة الإنشاء</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">الإجمالي</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading && (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent" />
                      <p className="text-sm">جارٍ التحميل…</p>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && !data?.items?.length && (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <ShoppingBag size={36} className="text-gray-200" />
                      <p className="text-sm">لا توجد فواتير بعد</p>
                      <Link
                        to="/pharmacy/purchases/invoices/create"
                        className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <Plus size={14} /> أضف أول فاتورة
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
              {data?.items?.map((inv) => (
                <tr
                  key={inv.id}
                  className="hover:bg-emerald-50/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/pharmacy/purchases/invoices/${inv.id}`)}
                >
                  {/* رقم الفاتورة */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-100">
                        <FileText size={13} className="text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 text-xs">{inv.poNumber}</p>
                        {inv.supplierInvoiceNumber && (
                          <p className="text-[11px] text-gray-400">{inv.supplierInvoiceNumber}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* المورد */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Building2 size={13} className="text-gray-400 shrink-0" />
                      <p className="text-gray-700 text-sm truncate max-w-[140px]">{inv.supplierName}</p>
                    </div>
                  </td>

                  {/* عدد المنتجات */}
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-bold tabular-nums">
                      {inv.linesCount ?? '—'}
                    </span>
                  </td>

                  {/* تاريخ الفاتورة */}
                  <td className="px-4 py-3">
                    <p className="text-gray-600 text-xs">{fmtDate(inv.invoiceDate)}</p>
                    <p className="text-[11px] text-gray-400">{fmtDate(inv.createdAt)}</p>
                  </td>

                  {/* آخر تعديل */}
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {fmtDate(inv.updatedAt)}
                  </td>

                  {/* الحالة */}
                  <td className="px-4 py-3"><StatusChip status={inv.status} /></td>

                  {/* الدفع */}
                  <td className="px-4 py-3"><PaymentChip status={inv.paymentStatus} /></td>

                  {/* طريقة الإنشاء */}
                  <td className="px-4 py-3">
                    {inv.source === 'ai' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700">
                        <Bot size={11} /> ذكاء اصطناعي
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        <User size={11} /> يدوي
                      </span>
                    )}
                  </td>

                  {/* الإجمالي */}
                  <td className="px-4 py-3">
                    <p className="font-bold text-gray-900 tabular-nums text-sm">{fmtMoney(inv.grandTotal)}</p>
                    <p className="text-[11px] text-gray-400">ر.س</p>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <RowMenu
                      inv={inv}
                      onConfirm={() => confirmMut.mutate(inv.id)}
                      onPay={() => payMut.mutate(inv.id)}
                      onCancel={() => cancelMut.mutate(inv.id)}
                      onPrint={() => handlePrint(inv.id)}
                      onExport={() => handleExportSingle(inv)}
                      onChangelog={() => setChangelogInv(inv)}
                      confirmPending={confirmMut.isPending}
                      payPending={payMut.isPending}
                      cancelPending={cancelMut.isPending}
                      printingId={printingId}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data?.meta && data.meta.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100">
            <Pagination
              page={page}
              pageSize={20}
              total={data.meta.total}
              totalPages={data.meta.totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {/* Changelog drawer */}
      {changelogInv && (
        <ChangelogDrawer
          invoiceId={changelogInv.id}
          poNumber={changelogInv.poNumber}
          onClose={() => setChangelogInv(null)}
        />
      )}
    </div>
  )
}
