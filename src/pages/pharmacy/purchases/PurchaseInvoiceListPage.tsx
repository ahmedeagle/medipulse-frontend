import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, FileText, TrendingUp, CreditCard, AlertCircle,
  CheckCircle2, Clock, XCircle, MoreVertical, Banknote,
  Building2, RefreshCw, ShoppingBag, ClipboardList, ListChecks,
} from 'lucide-react'
import clsx from 'clsx'
import { purchasesApi, type PurchaseInvoice } from '../../../api/purchases.api'
import Pagination from '../../../components/ui/Pagination'

const PAGE_SIZE = 20

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const fmtMoney = (n: number | string) =>
  Number(n).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function StatusChip({ status }: { status: PurchaseInvoice['status'] }) {
  const map = {
    draft:     { label: 'مسودة',     cls: 'bg-gray-100 text-gray-600',    Icon: Clock },
    received:  { label: 'مستلمة',    cls: 'bg-emerald-50 text-emerald-700',     Icon: CheckCircle2 },
    paid:      { label: 'مدفوعة',    cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
    cancelled: { label: 'ملغاة',     cls: 'bg-red-50 text-red-600',       Icon: XCircle },
  }
  const { label, cls, Icon } = map[status] ?? map.draft
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cls)}>
      <Icon size={11} />
      {label}
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

export default function PurchaseInvoiceListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [payStatus, setPayStatus] = useState('')

  const { data: stats } = useQuery({
    queryKey: ['purchase-stats'],
    queryFn: purchasesApi.getStats,
    staleTime: 30_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-invoices', page, q, status, payStatus],
    queryFn: () => purchasesApi.getInvoices({ page, limit: PAGE_SIZE, q: q || undefined, status: status || undefined, paymentStatus: payStatus || undefined }),
    staleTime: 15_000,
  })

  const confirmMut = useMutation({
    mutationFn: purchasesApi.confirmInvoice,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-invoices'] }); qc.invalidateQueries({ queryKey: ['purchase-stats'] }) },
  })
  const payMut = useMutation({
    mutationFn: purchasesApi.markPaid,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-invoices'] }); qc.invalidateQueries({ queryKey: ['purchase-stats'] }) },
  })
  const cancelMut = useMutation({
    mutationFn: purchasesApi.cancelInvoice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-invoices'] }),
  })

  const tiles = [
    {
      label: 'فواتير هذا الشهر',
      value: stats ? Number(stats.thisMonthCount).toLocaleString('ar-EG') : '—',
      icon: FileText,
      color: 'bg-emerald-50 text-emerald-700',
      border: 'border-emerald-200',
    },
    {
      label: 'مشتريات هذا الشهر',
      value: stats ? fmtMoney(stats.thisMonthValue) + ' ر.س' : '—',
      icon: TrendingUp,
      color: 'bg-emerald-50 text-emerald-700',
      border: 'border-emerald-200',
    },
    {
      label: 'مستحقات الدفع',
      value: stats ? fmtMoney(stats.totalPending) + ' ر.س' : '—',
      icon: CreditCard,
      color: 'bg-amber-50 text-amber-700',
      border: 'border-amber-200',
    },
    {
      label: 'قائمة الأمنيات',
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
              <div className={clsx('p-2.5 rounded-xl', tile.color)}>
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">{tile.label}</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">{tile.value}</p>
              </div>
            </div>
          )
          return tile.to
            ? <Link key={tile.label} to={tile.to}>{card}</Link>
            : <div key={tile.label}>{card}</div>
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="بحث برقم الفاتورة أو اسم المورد…"
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1) }}
              className="w-full pr-9 pl-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
            className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">كل حالات الدفع</option>
            <option value="pending">معلقة</option>
            <option value="paid">مدفوعة</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">رقم الفاتورة</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">المورد</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">التاريخ</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">الحالة</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">الدفع</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">الإجمالي</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent" />
                      <p className="text-sm">جارٍ التحميل…</p>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && !data?.items?.length && (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Building2 size={13} className="text-gray-400 shrink-0" />
                      <p className="text-gray-700 text-sm truncate max-w-[160px]">{inv.supplierName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(inv.createdAt)}</td>
                  <td className="px-4 py-3"><StatusChip status={inv.status} /></td>
                  <td className="px-4 py-3"><PaymentChip status={inv.paymentStatus} /></td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-gray-900 tabular-nums text-sm">{fmtMoney(inv.grandTotal)}</p>
                    <p className="text-[11px] text-gray-400">ر.س</p>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {inv.status === 'draft' && (
                        <button
                          onClick={() => confirmMut.mutate(inv.id)}
                          disabled={confirmMut.isPending}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        >
                          استلام
                        </button>
                      )}
                      {inv.status === 'received' && inv.paymentStatus === 'pending' && (
                        <button
                          onClick={() => payMut.mutate(inv.id)}
                          disabled={payMut.isPending}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        >
                          دفع
                        </button>
                      )}
                      {inv.status === 'draft' && (
                        <button
                          onClick={() => cancelMut.mutate(inv.id)}
                          disabled={cancelMut.isPending}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <XCircle size={15} />
                        </button>
                      )}
                    </div>
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
    </div>
  )
}
