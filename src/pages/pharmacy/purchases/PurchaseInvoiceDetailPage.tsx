import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight, FileText, Building2, Calendar, CheckCircle2, Clock, XCircle,
  CreditCard, Printer, Download, Pencil, AlertCircle, Package,
  History, ChevronLeft, User, Bot, Tag,
} from 'lucide-react'
import clsx from 'clsx'
import { purchasesApi, type PurchaseInvoice, type InvoiceChangelogEntry } from '../../../api/purchases.api'
import { buildInvoicePrintHtml } from './buildInvoicePrintHtml'

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const fmtMoney = (n: number | string | null | undefined) =>
  n != null ? Number(n).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '٠٫٠٠'

const STATUS_CONFIG = {
  draft:     { label: 'مسودة',   cls: 'bg-gray-100 text-gray-600 border-gray-200',       Icon: Clock },
  received:  { label: 'مستلمة', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  paid:      { label: 'مدفوعة', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  cancelled: { label: 'ملغاة',  cls: 'bg-red-50 text-red-600 border-red-200',             Icon: XCircle },
}

const PAYMENT_CONFIG = {
  pending: { label: 'معلق', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: AlertCircle },
  paid:    { label: 'مدفوع', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  credit_card: 'بطاقة ائتمان',
  bank_transfer: 'تحويل بنكي',
  credit_term: 'أجل',
}

const ACTION_LABELS: Record<InvoiceChangelogEntry['action'], { label: string; cls: string }> = {
  created:   { label: 'تم الإنشاء',  cls: 'bg-emerald-100 text-emerald-700' },
  updated:   { label: 'تم التعديل',  cls: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'تم الاستلام', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'تم الإلغاء',  cls: 'bg-red-100 text-red-600' },
  paid:      { label: 'تم الدفع',    cls: 'bg-violet-100 text-violet-700' },
}

function ChangelogDrawer({ invoiceId, poNumber, onClose }: { invoiceId: string; poNumber: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoice-changelog', invoiceId],
    queryFn: () => purchasesApi.getInvoiceChangelog(invoiceId),
    staleTime: 0,
    retry: 2,
  })

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-base">سجل التغييرات</h2>
            <p className="text-xs text-gray-500 mt-0.5">{poNumber}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <ChevronLeft size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-600 border-t-transparent" />
            </div>
          )}
          {isError && (
            <div className="flex flex-col items-center gap-2 py-16 text-red-300">
              <AlertCircle size={36} />
              <p className="text-sm text-red-400">تعذّر تحميل السجل. يرجى المحاولة مجدداً.</p>
            </div>
          )}
          {!isLoading && !isError && !data?.length && (
            <div className="flex flex-col items-center gap-2 py-16 text-gray-300">
              <History size={36} />
              <p className="text-sm text-gray-400">لا توجد تغييرات مسجلة</p>
            </div>
          )}
          {data?.map((entry, idx) => {
            const { label, cls } = ACTION_LABELS[entry.action] ?? ACTION_LABELS.updated
            return (
              <div key={entry.id} className="flex gap-3 mb-4">
                <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                  <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold', cls)}>
                    {idx + 1}
                  </div>
                  {idx < (data?.length ?? 0) - 1 && <div className="w-px flex-1 bg-gray-100 min-h-[16px]" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', cls)}>
                      {label}
                    </span>
                    <span className="text-[11px] text-gray-400">{fmtDateTime(entry.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                      <User size={11} className="text-gray-500" />
                    </div>
                    <span className="text-xs text-gray-500">{entry.userName || entry.userEmail || 'مستخدم النظام'}</span>
                  </div>
                  {entry.changes?.length > 0 && (
                    <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-100/60">
                            <th className="text-right px-3 py-2 font-medium text-gray-500">الحقل</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500">القديم</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500">الجديد</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {entry.changes.map((ch, ci) => (
                            <tr key={ci}>
                              <td className="px-3 py-2 text-gray-700 font-medium">{ch.fieldLabel}</td>
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
      </div>
    </div>
  )
}

export default function PurchaseInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [printing, setPrinting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)

  const { data: inv, isLoading, error } = useQuery<PurchaseInvoice>({
    queryKey: ['purchase-invoice', id],
    queryFn: () => purchasesApi.getInvoice(id!),
    enabled: !!id,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['purchase-invoice', id] })
    qc.invalidateQueries({ queryKey: ['purchase-invoices'] })
    qc.invalidateQueries({ queryKey: ['purchase-stats'] })
    qc.invalidateQueries({ queryKey: ['invoice-changelog', id] })
  }

  const confirmMut = useMutation({ mutationFn: () => purchasesApi.confirmInvoice(id!), onSuccess: invalidate })
  const payMut     = useMutation({ mutationFn: () => purchasesApi.markPaid(id!),        onSuccess: invalidate })
  const cancelMut  = useMutation({ mutationFn: () => purchasesApi.cancelInvoice(id!),   onSuccess: invalidate })

  const handlePrint = async () => {
    setPrinting(true)
    try {
      const full = await purchasesApi.getInvoice(id!)
      const html = buildInvoicePrintHtml(full)
      const win = window.open('', '_blank', 'width=960,height=700')
      if (!win) return
      win.document.write(html); win.document.close()
    } finally { setPrinting(false) }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await purchasesApi.exportSingleInvoice(id!)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${inv?.poNumber ?? 'invoice'}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  if (isLoading) return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-600 border-t-transparent" />
        <p className="text-sm">جارٍ التحميل…</p>
      </div>
    </div>
  )

  if (error || !inv) return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <XCircle size={40} className="text-red-300" />
        <p className="text-sm text-gray-500">الفاتورة غير موجودة</p>
        <Link to="/pharmacy/purchases/invoices" className="text-sm text-emerald-600 hover:underline">
          العودة للقائمة
        </Link>
      </div>
    </div>
  )

  const statusCfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.draft
  const paymentCfg = PAYMENT_CONFIG[inv.paymentStatus]

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-4 md:p-6 space-y-5">

      {/* Back + header row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/pharmacy/purchases/invoices')}
            className="mt-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowRight size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{inv.poNumber}</h1>
              <span className={clsx('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border', statusCfg.cls)}>
                <statusCfg.Icon size={13} /> {statusCfg.label}
              </span>
              <span className={clsx('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border', paymentCfg.cls)}>
                <paymentCfg.Icon size={13} /> {paymentCfg.label}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              أُنشئت {fmtDateTime(inv.createdAt)}
              {inv.updatedAt && inv.updatedAt !== inv.createdAt && ` · آخر تعديل ${fmtDateTime(inv.updatedAt)}`}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {inv.status === 'draft' && (
            <button
              onClick={() => navigate(`/pharmacy/purchases/invoices/${id}/edit`)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Pencil size={14} /> تعديل
            </button>
          )}
          <button
            onClick={handlePrint}
            disabled={printing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <Printer size={14} /> طباعة
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-60"
          >
            <Download size={14} /> تصدير Excel
          </button>
          <button
            onClick={() => setShowChangelog(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
          >
            <History size={14} /> سجل التغييرات
          </button>
          {inv.status === 'draft' && (
            <button
              onClick={() => confirmMut.mutate()}
              disabled={confirmMut.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium shadow-sm disabled:opacity-60"
            >
              <CheckCircle2 size={14} /> استلام الفاتورة
            </button>
          )}
          {inv.status === 'received' && inv.paymentStatus === 'pending' && (
            <button
              onClick={() => payMut.mutate()}
              disabled={payMut.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium shadow-sm disabled:opacity-60"
            >
              <CreditCard size={14} /> تسجيل الدفع
            </button>
          )}
          {inv.status === 'draft' && (
            <button
              onClick={() => { if (confirm('هل أنت متأكد من إلغاء هذه الفاتورة؟')) cancelMut.mutate() }}
              disabled={cancelMut.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-60"
            >
              <XCircle size={14} /> إلغاء
            </button>
          )}
        </div>
      </div>

      {/* Info cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Supplier card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-blue-50">
              <Building2 size={16} className="text-blue-600" />
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">المورد</p>
          </div>
          <p className="font-bold text-gray-900 text-base">{inv.supplierName}</p>
          {inv.supplierInvoiceNumber && (
            <div className="mt-2 flex items-center gap-1.5">
              <Tag size={12} className="text-gray-400" />
              <p className="text-sm text-gray-500">رقم فاتورة المورد: <span className="font-medium text-gray-700">{inv.supplierInvoiceNumber}</span></p>
            </div>
          )}
          {inv.invoiceDate && (
            <div className="mt-1 flex items-center gap-1.5">
              <Calendar size={12} className="text-gray-400" />
              <p className="text-sm text-gray-500">تاريخ الفاتورة: <span className="font-medium text-gray-700">{fmtDate(inv.invoiceDate)}</span></p>
            </div>
          )}
        </div>

        {/* Payment card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-emerald-50">
              <CreditCard size={16} className="text-emerald-600" />
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">الدفع</p>
          </div>
          <p className="font-bold text-gray-900 text-base">{PAYMENT_METHOD_LABELS[inv.paymentMethod] ?? inv.paymentMethod}</p>
          <p className="text-sm text-gray-500 mt-1">طريقة الدفع</p>
          {inv.confirmedAt && (
            <div className="mt-2 flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-emerald-500" />
              <p className="text-xs text-gray-400">تم الاستلام {fmtDate(inv.confirmedAt)}</p>
            </div>
          )}
        </div>

        {/* Source card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className={clsx('p-2 rounded-xl', inv.source === 'ai' ? 'bg-violet-50' : 'bg-gray-50')}>
              {inv.source === 'ai'
                ? <Bot size={16} className="text-violet-600" />
                : <User size={16} className="text-gray-500" />
              }
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">طريقة الإنشاء</p>
          </div>
          <p className="font-bold text-gray-900 text-base">
            {inv.source === 'ai' ? 'ذكاء اصطناعي' : 'يدوي'}
          </p>
          <p className="text-sm text-gray-500 mt-1">أُنشئت {fmtDate(inv.createdAt)}</p>
          {inv.notes && (
            <p className="text-xs text-gray-400 mt-2 line-clamp-2 italic">"{inv.notes}"</p>
          )}
        </div>
      </div>

      {/* Totals summary */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 mb-4">ملخص الفاتورة</h2>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">المجموع الفرعي</span>
            <span className="font-medium text-gray-800 tabular-nums">{fmtMoney(inv.subtotal)} ر.س</span>
          </div>
          {Number(inv.totalDiscount) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">الخصم</span>
              <span className="font-medium text-red-500 tabular-nums">- {fmtMoney(inv.totalDiscount)} ر.س</span>
            </div>
          )}
          {Number(inv.totalTax) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">الضريبة</span>
              <span className="font-medium text-gray-800 tabular-nums">{fmtMoney(inv.totalTax)} ر.س</span>
            </div>
          )}
          <div className="border-t border-gray-100 pt-2 mt-1 flex justify-between">
            <span className="font-bold text-gray-900">الإجمالي الكلي</span>
            <span className="font-bold text-emerald-700 text-xl tabular-nums">{fmtMoney(inv.grandTotal)} ر.س</span>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Package size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">
            بنود الفاتورة
            <span className="mr-2 text-xs font-normal text-gray-400">({inv.lines?.length ?? 0} منتج)</span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">#</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">المنتج</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الباتش</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الانتهاء</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 tabular-nums">الكمية</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">هدية</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">سعر الشراء</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الخصم%</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {inv.lines?.map((line, idx) => (
                <tr key={line.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{line.productName}</p>
                    {line.productSku && <p className="text-[11px] text-gray-400">{line.productSku}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{line.batchNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(line.expiryDate)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800 tabular-nums">{line.purchaseQty}</td>
                  <td className="px-4 py-3 text-gray-500 tabular-nums text-xs">{line.freeGoodsQty > 0 ? `+${line.freeGoodsQty}` : '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-700">{fmtMoney(line.purchasePrice)}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-500">{line.discountPct > 0 ? `${line.discountPct}%` : '—'}</td>
                  <td className="px-4 py-3 font-bold text-gray-900 tabular-nums">{fmtMoney(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showChangelog && (
        <ChangelogDrawer invoiceId={id!} poNumber={inv.poNumber} onClose={() => setShowChangelog(false)} />
      )}
    </div>
  )
}
