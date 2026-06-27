import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, RefreshCw, CheckCircle2, Clock, XCircle, Building2,
  RotateCcw, ArrowLeft,
} from 'lucide-react'
import clsx from 'clsx'
import { purchasesApi, type PurchaseReturn } from '../../../api/purchases.api'
import Pagination from '../../../components/ui/Pagination'

const PAGE_SIZE = 20

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '…'

const fmtMoney = (n: number | string) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function StatusChip({ status }: { status: PurchaseReturn['status'] }) {
  const map = {
    draft:     { label: 'مسودة',    cls: 'bg-gray-100 text-gray-600',    Icon: Clock },
    confirmed: { label: 'مؤكد',     cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
    cancelled: { label: 'ملغي',     cls: 'bg-red-50 text-red-600',       Icon: XCircle },
  }
  const { label, cls, Icon } = map[status] ?? map.draft
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cls)}>
      <Icon size={11} />
      {label}
    </span>
  )
}

export default function PurchaseReturnListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const id = setTimeout(() => { setQ(qInput); setPage(1) }, 300)
    return () => clearTimeout(id)
  }, [qInput])

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-returns', page, q, status],
    queryFn: () => purchasesApi.getReturns({ page, limit: PAGE_SIZE, q: q || undefined, status: status || undefined }),
    staleTime: 15_000,
  })

  const confirmMut = useMutation({
    mutationFn: purchasesApi.confirmReturn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-returns'] }),
  })
  const cancelMut = useMutation({
    mutationFn: purchasesApi.cancelReturn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-returns'] }),
  })

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/pharmacy/purchases/invoices" className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">سجل المرتجعات</h1>
            <p className="text-sm text-gray-500 mt-0.5">مرتجعات المشتريات من الموردين</p>
          </div>
        </div>
        <Link
          to="/pharmacy/purchases/returns/create"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium shadow-sm"
        >
          <Plus size={15} />
          مرتجع جديد
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="ابحث برقم المرتجع أو اسم المورد…"
              value={qInput}
              onChange={e => setQInput(e.target.value)}
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
            <option value="confirmed">مؤكد</option>
            <option value="cancelled">ملغي</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">رقم المرتجع</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">المورد</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">المورد</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">المورد</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">المورد</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs">المورد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent" />
                      <p className="text-sm">جاري التحميل…</p>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && !data?.items?.length && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <RotateCcw size={36} className="text-gray-200" />
                      <p className="text-sm">لا توجد مرتجعات بعد</p>
                    </div>
                  </td>
                </tr>
              )}
              {data?.items?.map((ret) => (
                <tr
                  key={ret.id}
                  className="hover:bg-emerald-50/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/pharmacy/purchases/returns/${ret.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-pink-100">
                        <RefreshCw size={13} className="text-pink-600" />
                      </div>
                      <p className="font-semibold text-gray-800 text-xs">{ret.rpoNumber}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Building2 size={13} className="text-gray-400 shrink-0" />
                      <p className="text-gray-700 text-sm truncate max-w-[160px]">{ret.supplierName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(ret.createdAt)}</td>
                  <td className="px-4 py-3"><StatusChip status={ret.status} /></td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-gray-900 tabular-nums text-sm">{fmtMoney(ret.grandTotal)}</p>
                    <p className="text-[11px] text-gray-400">ج.م</p>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {ret.status === 'draft' && (
                        <button
                          onClick={() => confirmMut.mutate(ret.id)}
                          disabled={confirmMut.isPending}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        >
                          تأكيد
                        </button>
                      )}
                      {ret.status === 'draft' && (
                        <button
                          onClick={() => cancelMut.mutate(ret.id)}
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
