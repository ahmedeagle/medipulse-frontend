import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Search, Receipt, RotateCcw, CreditCard, Banknote, Printer, Eye,
  MoreHorizontal, X, Check, XCircle, AlertTriangle,
  RefreshCcw, SplitSquareVertical, Zap, Clock, TrendingUp, ArrowUpRight,
} from 'lucide-react'
import clsx from 'clsx'
import { posApi, type PosTransaction, type PosShift } from '../../../api/pos.api'
import Pagination from '../../../components/ui/Pagination'
import { useCurrency } from '../../../hooks/useCurrency'
import { pharmacySettingsApi } from '../../../api/pharmacy-settings.api'

// ── Helpers ───────────────────────────────────────────────────────────────────
const PAGE_SIZE = 30
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtTime = (s: string) =>
  new Date(s).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
const shortId = (id: string) => id.slice(0, 6).toUpperCase()

function paymentBadge(method: string) {
  if (method === 'card')  return { label: 'كارت',  cls: 'bg-blue-50 text-blue-600',   Icon: CreditCard }
  if (method === 'split') return { label: 'مختلط', cls: 'bg-violet-50 text-violet-600', Icon: SplitSquareVertical }
  return                          { label: 'نقدي',  cls: 'bg-gray-100 text-gray-600',  Icon: Banknote }
}

// ── Items cell: first item + hover tooltip for the rest ───────────────────────
function ItemsCell({ items }: { items: import('../../../api/pos.api').PosTransactionItem[] }) {
  const [hover, setHover] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  if (items.length === 0) return <span className="text-gray-300">—</span>
  const first = items[0]
  const rest  = items.slice(1)
  return (
    <div ref={ref} className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <p className="text-sm text-gray-700 truncate max-w-[160px]">{first.productName}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[11px] text-gray-400">{first.quantity} × {Number(first.unitPrice).toFixed(2)}</span>
        {rest.length > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold cursor-default">
            +{rest.length} أخرى
          </span>
        )}
      </div>
      {hover && rest.length > 0 && (
        <div className="absolute z-50 top-full mt-1 start-0 w-60 bg-white rounded-xl shadow-xl border border-gray-100 p-2.5 space-y-1.5 animate-in fade-in duration-100">
          {rest.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg hover:bg-gray-50">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{item.productName}</p>
                <p className="text-[10px] text-gray-400">{item.quantity} × {Number(item.unitPrice).toFixed(2)}</p>
              </div>
              <p className="text-xs font-semibold text-gray-700 shrink-0 tabular-nums">{Number(item.subtotal).toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Row action menu ───────────────────────────────────────────────────────────
function TxRowMenu({
  onPrint, onPreview, onReturn, onVoid, isVoided, isReturn,
}: {
  onPrint: () => void; onPreview: () => void; onReturn: () => void
  onVoid: () => void; isVoided: boolean; isReturn: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          className="fixed w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[200]"
          style={(() => {
            if (!ref.current) return { top: 0, left: 0 }
            const rect = ref.current.getBoundingClientRect()
            const menuW = 176
            // Right-align to button; if that goes off-screen left, left-align instead
            const leftIfRightAligned = rect.right - menuW
            const left = leftIfRightAligned < 8
              ? Math.min(rect.left, window.innerWidth - menuW - 8)
              : leftIfRightAligned
            return { top: rect.bottom + 4, left: Math.max(8, left) }
          })()}
        >
          <button onClick={() => { onPreview(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <Eye size={13} className="text-gray-400" /> معاينة الفاتورة
          </button>
          <button onClick={() => { onPrint(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <Printer size={13} className="text-gray-400" /> طباعة الفاتورة
          </button>
          {!isReturn && !isVoided && (
            <button onClick={() => { onReturn(); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors">
              <RotateCcw size={13} /> إنشاء مرتجع
            </button>
          )}
          {!isVoided && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button onClick={() => { onVoid(); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                <XCircle size={13} /> إلغاء المعاملة
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Receipt / Invoice Modal ───────────────────────────────────────────────────
function ReceiptModal({ tx, onClose, autoPrint = false }: {
  tx: PosTransaction; onClose: () => void; autoPrint?: boolean
}) {
  const printRef = useRef<HTMLDivElement>(null)
  const isReturn = tx.type === 'return'
  const isVoided = tx.status === 'voided'
  const { fmt } = useCurrency()

  const { data: settings } = useQuery({
    queryKey: ['pharmacy-settings'],
    queryFn:  pharmacySettingsApi.getSettings,
    staleTime: 5 * 60_000,
  })

  const rs        = settings?.receiptSettings ?? {}
  const rxLang    = rs.language ?? 'ar'
  const isAr      = rxLang !== 'en'
  const pharmName = isAr
    ? (settings?.pharmacyNameAr || settings?.pharmacyNameEn || 'الصيدلية')
    : (settings?.pharmacyNameEn || settings?.pharmacyNameAr || 'Pharmacy')

  const handlePrint = () => {
    const content = printRef.current?.innerHTML ?? ''
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}" lang="${rxLang}"><head>
      <meta charset="UTF-8">
      <title>فاتورة ${shortId(tx.id)}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;font-size:12px;color:#111;direction:${isAr ? 'rtl' : 'ltr'};padding:20px;max-width:${rs.paperSize === '58mm' ? '200px' : rs.paperSize === 'A4' ? '600px' : '300px'};margin:0 auto}
        .pharmacy-name{font-size:20px;font-weight:900;text-align:center;margin-bottom:2px}
        .pharmacy-sub{font-size:11px;color:#666;text-align:center;margin-bottom:2px}
        .badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;margin-bottom:12px}
        .badge.sale{background:#e6f7f5;color:#0d9488}
        .badge.return{background:#fef3c7;color:#d97706}
        .divider{border:none;border-top:2px dashed #ddd;margin:10px 0}
        .row{display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px}
        .row .lbl{color:#888}
        .section-title{font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:12px 0 6px}
        .item-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0}
        .item-name{font-weight:600}
        .item-meta{color:#888;font-size:11px;margin-top:1px}
        .total-row{display:flex;justify-content:space-between;font-weight:900;font-size:15px;margin-top:10px;padding-top:10px;border-top:2px solid #111}
        .footer{text-align:center;margin-top:16px;padding-top:12px;border-top:2px dashed #ddd;color:#888;font-size:10px;line-height:1.6}
        .footer strong{color:#0d9488}
      </style>
    </head><body>${content}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  useEffect(() => { if (autoPrint) handlePrint() }, [])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          <div ref={printRef} className="p-6">
            {/* Header */}
            <div className="text-center mb-5 pb-5 border-b border-dashed border-gray-200">
              <p className="pharmacy-name text-xl font-black text-gray-900 mb-1">{pharmName}</p>
              {rs.showAddress && settings?.address && (
                <p className="pharmacy-sub text-[11px] text-gray-400 mt-0.5">{settings.address}</p>
              )}
              {rs.showPhone && settings?.phone && (
                <p className="pharmacy-sub text-[11px] text-gray-400">{settings.phone}</p>
              )}
              {rs.showTaxNumber && settings?.licenseNumber && (
                <p className="pharmacy-sub text-[11px] text-gray-400">رخصة: {settings.licenseNumber}</p>
              )}
              {rs.headerText && (
                <p className="pharmacy-sub text-[11px] text-gray-500 mt-1 italic">{rs.headerText}</p>
              )}
              <span className={clsx(
                'badge inline-block px-3 py-0.5 rounded-full text-xs font-bold mt-3',
                isVoided ? 'bg-gray-100 text-gray-500'
                : isReturn ? 'bg-amber-50 text-amber-700'
                : 'bg-teal-50 text-teal-700'
              )}>
                {isVoided ? 'ملغي' : isReturn ? 'مرتجع' : 'إجمالي مبيعات'}
              </span>
            </div>

            {/* Invoice meta */}
            <div className="space-y-2 mb-4 pb-4 border-b border-gray-100">
              {[
                { label: isAr ? 'رقم الفاتورة' : 'Invoice #', value: `${isReturn ? (isAr ? 'مرتجع' : 'Return') : (isAr ? 'بيع' : 'Sale')}-${shortId(tx.id)}` },
                { label: isAr ? 'التاريخ' : 'Date', value: `${fmtDate(tx.createdAt)} ${fmtTime(tx.createdAt)}` },
                { label: isAr ? 'الكاشير' : 'Cashier', value: tx.cashierName ?? shortId(tx.cashierId) },
                { label: isAr ? 'العميل' : 'Customer', value: tx.customerName ?? (tx.customerId ? shortId(tx.customerId) : (isAr ? 'عميل مباشر' : 'Walk-in')) },
                { label: isAr ? 'الشفت' : 'Shift', value: shortId(tx.shiftId) },
              ].map(r => (
                <div key={r.label} className="row flex items-center justify-between text-sm">
                  <span className="lbl text-gray-400">{r.label}</span>
                  <span className="font-semibold text-gray-800">{r.value}</span>
                </div>
              ))}
            </div>

            {/* Items */}
            <div className="mb-4 pb-4 border-b border-gray-100">
              <p className="section-title text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {isAr ? 'الأصناف' : 'Items'}
              </p>
              <div className="space-y-2">
                {(tx.items ?? []).map(item => (
                  <div key={item.id} className="item-row flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="item-name font-semibold text-gray-800 text-sm">{item.productName}</p>
                      <p className="item-meta text-[11px] text-gray-400 font-mono">#{item.productId.slice(0, 8).toUpperCase()}</p>
                      <p className="item-meta text-[11px] text-gray-400">{item.quantity} × {fmt(item.unitPrice)}</p>
                      {Number(item.discountAmount) > 0 && (
                        <p className="text-[11px] text-red-500 font-medium">{isAr ? 'خصم' : 'Disc'}: −{fmt(item.discountAmount)}</p>
                      )}
                    </div>
                    <p className="font-bold text-gray-800 text-sm tabular-nums">{fmt(item.subtotal)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-1.5 mb-4 pb-4 border-b border-gray-100">
              <div className="row flex justify-between text-sm text-gray-500">
                <span className="lbl">{isAr ? 'المجموع الفرعي' : 'Subtotal'}</span>
                <span className="tabular-nums">{fmt(tx.subtotal)}</span>
              </div>
              {Number(tx.discountAmount) > 0 && (
                <div className="row flex justify-between text-sm text-red-500">
                  <span className="lbl">{isAr ? 'إجمالي الخصم' : 'Total Discount'}</span>
                  <span className="tabular-nums">−{fmt(tx.discountAmount)}</span>
                </div>
              )}
              <div className="total-row flex justify-between font-black text-base pt-2 border-t border-gray-200 mt-2">
                <span>{isAr ? 'الإجمالي' : 'Total'}</span>
                <span className="tabular-nums">{fmt(tx.totalAmount)}</span>
              </div>
            </div>

            {/* Payment */}
            <div className="mb-5 pb-5 border-b border-dashed border-gray-200">
              <p className="section-title text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {isAr ? 'طريقة الدفع' : 'Payment'}
              </p>
              <div className="row flex justify-between items-center text-sm">
                <span className="text-gray-600">
                  {tx.paymentMethod === 'cash' ? (isAr ? 'نقدي' : 'Cash') : tx.paymentMethod === 'card' ? (isAr ? 'كارت' : 'Card') : (isAr ? 'مختلط' : 'Split')}
                </span>
                <span className="font-bold tabular-nums">{fmt(tx.totalAmount)}</span>
              </div>
              {(tx.changeAmount ?? 0) > 0 && (
                <div className="row flex justify-between text-sm text-gray-400 mt-1">
                  <span className="lbl">{isAr ? 'الباقي للعميل' : 'Change'}</span>
                  <span className="tabular-nums">{fmt(tx.changeAmount!)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="footer text-center text-[11px] text-gray-400 space-y-0.5">
              {rs.footerText ? (
                <p>{rs.footerText}</p>
              ) : (
                <p>{isAr ? 'شكراً لك على ثقتك بنا!' : 'Thank you for your purchase!'}</p>
              )}
              <p><strong className="text-teal-600">{pharmName}</strong></p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 p-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors"
          >
            <Printer size={14} /> طباعة
          </button>
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            <X size={14} /> إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Return Modal ──────────────────────────────────────────────────────────────
function ReturnModal({ tx, onClose }: { tx: PosTransaction; onClose: () => void }) {
  const qc = useQueryClient()
  const { fmt } = useCurrency()

  const { data: shift } = useQuery({
    queryKey: ['pos-shift'],
    queryFn: posApi.getCurrentShift,
  })

  interface ReturnItem {
    inventoryItemId: string
    productId: string
    productName: string
    originalQty: number
    returnQty: number
    unitPrice: number
    discountPerUnit: number
    selected: boolean
  }

  const [items, setItems] = useState<ReturnItem[]>(
    (tx.items ?? []).map(i => ({
      inventoryItemId: i.inventoryItemId ?? '',
      productId:       i.productId,
      productName:     i.productName,
      originalQty:     i.quantity,
      returnQty:       i.quantity,
      unitPrice:       Number(i.unitPrice),
      discountPerUnit: i.quantity > 0 ? Number(i.discountAmount) / i.quantity : 0,
      selected:        true,
    }))
  )
  const [returnMethod, setReturnMethod] = useState<'cash' | 'card'>(
    tx.paymentMethod === 'card' ? 'card' : 'cash'
  )
  const [reason, setReason] = useState('')

  const selectedItems = items.filter(i => i.selected && i.returnQty > 0)
  const returnTotal   = selectedItems.reduce((s, i) => s + (i.unitPrice - i.discountPerUnit) * i.returnQty, 0)
  const canSubmit     = selectedItems.length > 0 && reason.trim().length >= 3 && !!shift

  const returnMut = useMutation({
    mutationFn: () => posApi.createTransaction({
      type:          'return',
      customerId:    tx.customerId ?? undefined,
      items:         selectedItems.map(i => ({
        inventoryItemId: i.inventoryItemId,
        productId:       i.productId,
        productName:     i.productName,
        quantity:        i.returnQty,
        unitPrice:       i.unitPrice,
        discountAmount:  i.discountPerUnit * i.returnQty,
      })),
      paymentMethod: returnMethod,
      note:          reason,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-transactions'] })
      qc.invalidateQueries({ queryKey: ['pos-shift'] })
      onClose()
    },
  })

  const patchItem = (idx: number, patch: Partial<ReturnItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center">
              <RotateCcw size={16} className="text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">المرتجعات والاسترداد</h2>
              <p className="text-xs text-gray-400">Sale-{shortId(tx.id)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Transaction info bar */}
        <div className="flex items-center gap-5 px-6 py-2.5 bg-gray-50 border-b border-gray-100 shrink-0 flex-wrap">
          {[
            { label: 'البيع',           value: `Sale-${shortId(tx.id)}` },
            { label: 'التاريخ والوقت', value: `${fmtDate(tx.createdAt)} ${fmtTime(tx.createdAt)}` },
            { label: 'الكاشير',        value: tx.cashierName ?? shortId(tx.cashierId) },
            { label: 'العميل',         value: tx.customerName ?? (tx.customerId ? shortId(tx.customerId) : 'عميل مباشر/غير دائم') },
            { label: 'طريقة الدفع',   value: tx.paymentMethod === 'cash' ? 'نقدي' : tx.paymentMethod === 'card' ? 'كارت' : 'مختلط' },
          ].map(r => (
            <div key={r.label}>
              <p className="text-[10px] text-gray-400">{r.label}</p>
              <p className="text-xs font-semibold text-gray-800">{r.value}</p>
            </div>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {!shift && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <p className="text-amber-800 text-sm font-medium">يجب فتح شفت أولاً لمعالجة المرتجعات</p>
            </div>
          )}

          {/* Items table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-700">الأصناف</p>
              <button
                onClick={() => setItems(prev => prev.map(i => ({ ...i, selected: true, returnQty: i.originalQty })))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Check size={11} /> إرجاع جميع الأصناف
              </button>
            </div>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="px-3 py-2.5 w-10" />
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">المنتج</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">إجمالي الكمية</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">الكمية المتوفرة للإرجاع</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">كمية الإرجاع</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">سعر الوحدة</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">مبلغ المرتجعات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const lineAmt = item.selected && item.returnQty > 0
                      ? (item.unitPrice - item.discountPerUnit) * item.returnQty
                      : 0
                    return (
                      <tr key={item.productId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={e => patchItem(idx, { selected: e.target.checked })}
                            className="w-4 h-4 rounded accent-teal-600 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-800 text-sm">{item.productName}</p>
                          <p className="text-[11px] text-gray-400 font-mono">Prod-{shortId(item.productId)}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 tabular-nums text-center">{item.originalQty}</td>
                        <td className="px-4 py-3 text-gray-600 tabular-nums text-center">{item.originalQty}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            max={item.originalQty}
                            value={item.returnQty}
                            disabled={!item.selected}
                            onChange={e => patchItem(idx, { returnQty: Math.min(Math.max(0, Number(e.target.value)), item.originalQty) })}
                            className="w-16 px-2 py-1.5 rounded-lg border border-teal-300 text-center text-sm font-semibold focus:ring-2 focus:ring-teal-100 outline-none disabled:opacity-40 disabled:bg-gray-50 tabular-nums"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-700 tabular-nums text-sm">{fmt(item.unitPrice)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums">{fmt(lineAmt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Return method + reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-3">
              <p className="text-sm font-bold text-gray-700">طريقة الاسترداد</p>
              <select
                value={returnMethod}
                onChange={e => setReturnMethod(e.target.value as 'cash' | 'card')}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none"
              >
                <option value="cash">نقدي</option>
                <option value="card">كارت</option>
              </select>
              <p className="flex items-center gap-1.5 text-xs text-gray-400">
                <RefreshCcw size={10} />
                إجمالي المبلغ المحدد:
                <span className="font-bold text-teal-700">{fmt(returnTotal)}</span>
              </p>
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">متاح للاسترداد</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="font-bold text-gray-900 tabular-nums">{fmt(returnTotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{returnMethod === 'cash' ? 'نقدي' : 'كارت'}</span>
                  <span className="tabular-nums">{fmt(returnTotal)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-bold text-gray-700">
                ملاحظة سبب الإرجاع <span className="text-red-500">*</span>
              </p>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={6}
                placeholder="أدخل تفاصيل سبب الإرجاع..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none resize-none"
              />
              {reason.trim().length > 0 && reason.trim().length < 3 && (
                <p className="text-xs text-red-500">السبب يجب أن يكون 3 أحرف على الأقل</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2.5 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={() => returnMut.mutate()}
            disabled={!canSubmit || returnMut.isPending}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {returnMut.isPending
              ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <><Check size={14} /> معالجة الإرجاع</>}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
          >
            إلغاء
          </button>
          {returnMut.isError && (
            <p className="text-red-500 text-xs">
              {(returnMut.error as any)?.response?.data?.message ?? 'حدث خطأ، حاول مجدداً'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Shift Context Banner ──────────────────────────────────────────────────────
function ShiftBanner({ shift, isFiltered, onClear }: {
  shift: PosShift; isFiltered: boolean; onClear?: () => void
}) {
  const { fmt } = useCurrency()
  const open = shift.status === 'open'
  const dur  = (() => {
    const ms  = (shift.closedAt ? new Date(shift.closedAt) : new Date()).getTime() - new Date(shift.openedAt).getTime()
    const min = Math.round(ms / 60000)
    return min < 60 ? `${min}د` : `${Math.floor(min / 60)}س ${min % 60}د`
  })()

  return (
    <div className={clsx(
      'flex items-center gap-4 px-5 py-3.5 rounded-2xl border mb-1',
      open
        ? 'bg-gradient-to-l from-emerald-600 to-teal-600 border-emerald-400 text-white'
        : 'bg-gray-50 border-gray-200 text-gray-700',
    )}>
      {open && <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0" />}
      {!open && <Clock size={15} className="shrink-0 text-gray-400" />}

      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-5 gap-y-0.5">
        <span className={clsx('font-bold text-sm', open ? 'text-white' : 'text-gray-800')}>
          {open ? 'الشفت الحالي — ' : 'الشفت — '}{shift.cashierName ?? 'كاشير'}
        </span>
        <span className={clsx('text-xs', open ? 'text-emerald-100' : 'text-gray-400')}>
          {new Date(shift.openedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          {shift.closedAt && ` ← ${new Date(shift.closedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`}
          {' · '}{dur}
        </span>
        <span className={clsx('flex items-center gap-1 text-xs font-semibold', open ? 'text-white' : 'text-teal-700')}>
          <TrendingUp size={11} />
          {fmt(shift.totalSales)}
        </span>
        <span className={clsx('text-xs', open ? 'text-emerald-100' : 'text-gray-500')}>
          <ArrowUpRight size={10} className="inline" />
          {shift.transactionCount} معاملة
        </span>
        {Number(shift.openingBalance) > 0 && (
          <span className={clsx('text-xs', open ? 'text-emerald-100' : 'text-gray-400')}>
            رصيد افتتاحي: {fmt(shift.openingBalance)}
          </span>
        )}
      </div>

      {isFiltered && onClear && (
        <button
          onClick={onClear}
          className={clsx(
            'flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors',
            open ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-600',
          )}
        >
          <X size={11} />
          إلغاء الفلتر
        </button>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SalesLogPage() {
  const qc = useQueryClient()
  const { fmt } = useCurrency()
  const [searchParams, setSearchParams] = useSearchParams()
  const shiftIdParam = searchParams.get('shiftId') ?? undefined

  const [search,    setSearch]    = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'return'>('all')
  const [page,      setPage]      = useState(1)
  const [receipt,   setReceipt]   = useState<{ tx: PosTransaction; print: boolean } | null>(null)
  const [returning, setReturning] = useState<PosTransaction | null>(null)

  const offset = (page - 1) * PAGE_SIZE

  // Current open shift (always fetched for the live banner)
  const { data: currentShift } = useQuery({
    queryKey: ['pos-shift'],
    queryFn: posApi.getCurrentShift,
    staleTime: 30_000,
  })

  // If a shiftId param is given, fetch that specific shift for the banner
  const { data: filteredShift } = useQuery({
    queryKey: ['pos-shift-detail', shiftIdParam],
    queryFn: () => posApi.getShift(shiftIdParam!),
    enabled: !!shiftIdParam,
    staleTime: 60_000,
  })

  // Which shift to show in the banner
  const bannerShift = shiftIdParam ? filteredShift : currentShift

  const { data, isLoading } = useQuery({
    queryKey: ['pos-transactions', typeFilter, page, shiftIdParam],
    queryFn: () => posApi.listTransactions({
      type:    typeFilter === 'all' ? undefined : typeFilter,
      shiftId: shiftIdParam,
      limit:   PAGE_SIZE,
      offset,
    }),
    staleTime: 15_000,
    placeholderData: prev => prev,
  })

  const voidMut = useMutation({
    mutationFn: (id: string) => posApi.voidTransaction(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-transactions'] }),
  })

  const txs   = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Page-level stats
  const pageSales   = txs.filter(t => t.type === 'sale'   && t.status === 'completed').reduce((s, t) => s + Number(t.totalAmount), 0)
  const pageReturns = txs.filter(t => t.type === 'return' && t.status === 'completed').reduce((s, t) => s + Number(t.totalAmount), 0)
  const voidCount   = txs.filter(t => t.status === 'voided').length

  const filteredTxs = search
    ? txs.filter(t =>
        (t.items ?? []).some(i => i.productName.toLowerCase().includes(search.toLowerCase())) ||
        t.id.toLowerCase().includes(search.toLowerCase())
      )
    : txs

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Modals */}
      {receipt && (
        <ReceiptModal
          tx={receipt.tx}
          autoPrint={receipt.print}
          onClose={() => setReceipt(null)}
        />
      )}
      {returning && (
        <ReturnModal
          tx={returning}
          onClose={() => setReturning(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">سجل المبيعات والمرتجعات</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {shiftIdParam ? 'معاملات الشفت المحدد' : total > 0 ? `${total.toLocaleString('ar-EG')} معاملة إجمالاً` : 'جميع معاملات نقطة البيع'}
          </p>
        </div>
      </div>

      {/* Shift banner — shows current shift or filtered shift */}
      {bannerShift && (
        <ShiftBanner
          shift={bannerShift}
          isFiltered={!!shiftIdParam}
          onClear={() => { setSearchParams({}); setPage(1) }}
        />
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-700">إجمالي المبيعات</p>
            <p className="text-xs text-gray-400 mt-0.5">{txs.filter(t => t.type === 'sale' && t.status === 'completed').length} معاملة</p>
          </div>
          <p className="text-2xl font-black tabular-nums shrink-0 text-teal-600">{fmt(pageSales)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-700">إجمالي المرتجعات</p>
            <p className="text-xs text-gray-400 mt-0.5">{txs.filter(t => t.type === 'return' && t.status === 'completed').length} مرتجع</p>
          </div>
          <p className="text-2xl font-black tabular-nums shrink-0 text-red-500">{fmt(pageReturns)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-700">الصافي</p>
            <p className="text-xs text-gray-400 mt-0.5">{voidCount > 0 ? `${voidCount} معاملة ملغية` : 'بعد خصم المرتجعات'}</p>
          </div>
          <p className={clsx(
            'text-2xl font-black tabular-nums shrink-0',
            pageSales - pageReturns < 0 ? 'text-red-500' : 'text-teal-600',
          )}>{fmt(pageSales - pageReturns)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث باسم المنتج أو رقم المعاملة..."
            className="w-full pr-11 pl-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-teal-400 outline-none text-sm transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center bg-white border border-gray-200 rounded-xl p-0.5 gap-0.5">
          {(['all', 'sale', 'return'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setPage(1) }}
              className={clsx(
                'px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                typeFilter === t ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t === 'all' ? 'الكل' : t === 'sale' ? 'مبيعات' : 'مرتجعات'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              {['#', 'التاريخ والوقت', 'الكاشير', 'طريقة الدفع', 'الزبون', 'الأصناف المشتراة', 'الإجمالي', 'ملاحظات', 'الحالة', 'الإجراءات'].map((h, i, arr) => (
                <th
                  key={h}
                  className={clsx(
                    'text-right px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap',
                    i === 0 && 'rounded-tr-2xl',
                    i === arr.length - 1 && 'rounded-tl-2xl w-12',
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {[...Array(10)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredTxs.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-16 text-center">
                  <Receipt size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">
                    {search ? `لا توجد نتائج لـ "${search}"` : 'لا توجد معاملات'}
                  </p>
                </td>
              </tr>
            ) : filteredTxs.map((tx, idx) => {
              const isVoided = tx.status === 'voided'
              const isRet    = tx.type === 'return'
              const badge    = paymentBadge(tx.paymentMethod)

              return (
                <tr
                  key={tx.id}
                  className={clsx(
                    'border-b border-gray-50 last:border-0 transition-colors group',
                    isVoided ? 'opacity-50 bg-gray-50/50' : 'hover:bg-gray-50/60',
                  )}
                >
                  {/* # */}
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-semibold',
                      isRet ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700',
                    )}>
                      {isRet ? 'Ret' : 'Sale'}-{shortId(tx.id)}
                    </span>
                  </td>

                  {/* Date/Time */}
                  <td className="px-4 py-3">
                    <p className="text-gray-800 text-sm font-medium tabular-nums">
                      {new Date(tx.createdAt).toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                    <p className="text-gray-400 text-xs tabular-nums">{fmtTime(tx.createdAt)}</p>
                  </td>

                  {/* Cashier */}
                  <td className="px-4 py-3">
                    {tx.cashierName ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-[10px] shrink-0">
                          {tx.cashierName.trim()[0]?.toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-gray-700 truncate max-w-[90px]">{tx.cashierName}</span>
                      </div>
                    ) : (
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">
                        {shortId(tx.cashierId)}
                      </span>
                    )}
                  </td>

                  {/* Payment */}
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                      badge.cls,
                    )}>
                      <badge.Icon size={10} />
                      {badge.label}
                    </span>
                  </td>

                  {/* Customer */}
                  <td className="px-4 py-3">
                    {tx.customerName ? (
                      <span className="text-sm font-medium text-teal-700">{tx.customerName}</span>
                    ) : tx.customerId ? (
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{shortId(tx.customerId)}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Products */}
                  <td className="px-4 py-3 max-w-[200px]">
                    <ItemsCell items={tx.items ?? []} />
                  </td>

                  {/* Total */}
                  <td className="px-4 py-3">
                    <p className={clsx(
                      'font-bold tabular-nums text-sm',
                      isVoided ? 'text-gray-400 line-through'
                        : isRet ? 'text-amber-600'
                        : 'text-gray-900',
                    )}>
                      {isRet && '−'}{fmt(tx.totalAmount)}
                    </p>
                    {tx.discountAmount > 0 && !isVoided && (
                      <p className="text-[11px] text-red-400">خصم −{fmt(tx.discountAmount)}</p>
                    )}
                  </td>

                  {/* Notes */}
                  <td className="px-4 py-3 max-w-[120px]">
                    {tx.note ? (
                      <p className="text-xs text-gray-500 truncate" title={tx.note}>{tx.note}</p>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    {isVoided ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold">
                        <XCircle size={10} /> ملغي
                      </span>
                    ) : isRet ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold">
                        <RotateCcw size={10} /> مرتجع
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold">
                        <Check size={10} /> مكتمل
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <TxRowMenu
                      onPrint={() => setReceipt({ tx, print: true })}
                      onPreview={() => setReceipt({ tx, print: false })}
                      onReturn={() => setReturning(tx)}
                      onVoid={() => voidMut.mutate(tx.id)}
                      isVoided={isVoided}
                      isReturn={isRet}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}
