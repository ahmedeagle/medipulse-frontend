import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Building2, Plus, Trash2, AlertTriangle,
  CheckCircle2, Loader2, Save, PackageCheck, Camera,
  PartyPopper, Eye, FilePlus, X, ScanLine,
} from 'lucide-react'
import clsx from 'clsx'
import { purchasesApi, type ProductSearchResult, type PurchaseInvoice, type OcrResult } from '../../../api/purchases.api'
import { getApiErrors } from '../../../api/errors'
import { ProductSearchCombobox } from './ProductSearchCombobox'

// --- Types ---------------------------------------------------------------------

interface LineItem {
  _key: string
  productId: string
  productName: string
  productSku: string
  batchNumber: string
  expiryDate: string
  purchaseQty: number
  freeGoodsQty: number
  purchasePrice: number
  salePrice: number
  discountPct: number
  taxPct: number
  lineTotal: number
  priceWarning: { deviationPct: number; historicalAvg: number; direction: 'higher' | 'lower' } | null
  priceWarningDismissed: boolean
}

interface InvoiceHeader {
  supplierName: string
  supplierTenantId: string
  supplierInvoiceNumber: string
  invoiceDate: string
  paymentMethod: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  notes: string
}

// --- Calc -----------------------------------------------------------------------

function calcLineTotal(l: LineItem) {
  const base = l.purchaseQty * l.purchasePrice
  const afterDisc = base * (1 - l.discountPct / 100)
  const tax = afterDisc * (l.taxPct / 100)
  return +(afterDisc + tax).toFixed(2)
}

function calcTotals(lines: LineItem[], discountType: 'percent' | 'fixed', discountValue: number) {
  const subtotal = lines.reduce((s, l) => {
    const base = l.purchaseQty * l.purchasePrice
    return s + base * (1 - l.discountPct / 100)
  }, 0)
  const totalTax = lines.reduce((s, l) => {
    const base = l.purchaseQty * l.purchasePrice
    const afterDisc = base * (1 - l.discountPct / 100)
    return s + afterDisc * (l.taxPct / 100)
  }, 0)
  const totalDiscount = discountType === 'percent'
    ? subtotal * (discountValue / 100)
    : Math.min(discountValue, subtotal)
  const grandTotal = subtotal - totalDiscount + totalTax
  return {
    subtotal: +subtotal.toFixed(2),
    totalTax: +totalTax.toFixed(2),
    totalDiscount: +totalDiscount.toFixed(2),
    grandTotal: +grandTotal.toFixed(2),
  }
}

const newLine = (): LineItem => ({
  _key: Math.random().toString(36).slice(2),
  productId: '', productName: '', productSku: '',
  batchNumber: '', expiryDate: '',
  purchaseQty: 1, freeGoodsQty: 0,
  purchasePrice: 0, salePrice: 0,
  discountPct: 0, taxPct: 15,
  lineTotal: 0,
  priceWarning: null, priceWarningDismissed: false,
})

// --- Main Page ------------------------------------------------------------------

// Confidence badge: green ≥80%, amber 60–79%, red <60%
function ConfBadge({ conf }: { conf: number }) {
  const pct = Math.round(conf * 100)
  const color = pct >= 80 ? 'bg-emerald-100 text-emerald-700' : pct >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`ms-1 inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-bold ${color}`}>{pct}%</span>
}

export default function PurchaseInvoiceCreatePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [header, setHeader] = useState<InvoiceHeader>({
    supplierName: '', supplierTenantId: '',
    supplierInvoiceNumber: '', invoiceDate: '',
    paymentMethod: 'cash',
    discountType: 'percent', discountValue: 0,
    notes: '',
  })
  const [lines, setLines] = useState<LineItem[]>([newLine()])
  const [submitMode, setSubmitMode] = useState<'draft' | 'confirm'>('draft')
  const [successInvoice, setSuccessInvoice] = useState<PurchaseInvoice | null>(null)
  const [showOcrHint, setShowOcrHint] = useState(true)
  const [ocrState, setOcrState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => setShowOcrHint(false), 10_000)
    return () => clearTimeout(t)
  }, [])

  const handleOcrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setOcrState('loading')
    try {
      const result = await purchasesApi.analyzeInvoiceOcr(file)
      setOcrResult(result)
      if (result.error === 'OCR_NOT_CONFIGURED') {
        setOcrState('error')
        return
      }
      setOcrState('done')
      // Pre-fill header fields from OCR result
      if (result.vendorName) {
        setHeader(h => ({ ...h, supplierName: result.vendorName! }))
      }
      if (result.invoiceId) {
        setHeader(h => ({ ...h, supplierInvoiceNumber: result.invoiceId! }))
      }
      if (result.invoiceDate) {
        // Normalize date to YYYY-MM-DD
        const d = new Date(result.invoiceDate)
        if (!isNaN(d.getTime())) {
          setHeader(h => ({ ...h, invoiceDate: d.toISOString().slice(0, 10) }))
        }
      }
      // Pre-fill matched line items that have high confidence (=60%)
      const matchedLines = result.lineItems.filter(
        li => li.matchedProduct && li.matchedProduct.matchScore >= 60
      )
      if (matchedLines.length > 0) {
        const newLines = matchedLines.map(li => ({
          _key: crypto.randomUUID(),
          productId: li.matchedProduct!.id,
          productName: li.matchedProduct!.name,
          productSku: li.matchedProduct!.sku || '',
          batchNumber: '',
          expiryDate: '',
          purchaseQty: li.quantity ?? 1,
          freeGoodsQty: 0,
          purchasePrice: li.unitPrice ?? 0,
          salePrice: 0,
          discountPct: 0,
          taxPct: 15,
          lineTotal: 0,
          priceWarning: null,
          priceWarningDismissed: false,
        }))
        setLines(prev => {
          // Remove empty placeholder line if present
          const filtered = prev.filter(l => l.productId !== '')
          return [...filtered, ...newLines]
        })
      }
    } catch {
      setOcrState('error')
    }
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const { data: suppliers = [] } = useQuery({
    queryKey: ['purchase-suppliers'],
    queryFn: purchasesApi.getSuppliers,
    staleTime: 60_000,
  })

  // Supplier history: last 3 received invoices from the currently-selected supplier
  const { data: supplierHistory } = useQuery({
    queryKey: ['purchase-supplier-history', header.supplierName],
    queryFn: () => purchasesApi.getInvoices({ q: header.supplierName, status: 'received', limit: 3, page: 1 }),
    enabled: header.supplierName.trim().length > 1,
    staleTime: 30_000,
  })

  const saveMut = useMutation({
    mutationFn: async (dto: any) => {
      const inv = await purchasesApi.createInvoice(dto)
      if (submitMode === 'confirm') {
        return purchasesApi.confirmInvoice(inv.id)
      }
      return inv
    },
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] })
      qc.invalidateQueries({ queryKey: ['purchase-stats'] })
      if (submitMode === 'confirm') {
        setSuccessInvoice(inv)   // show success card; don't navigate away
      } else {
        navigate('/pharmacy/purchases/invoices')
      }
    },
  })

  const updateLine = useCallback((key: string, patch: Partial<LineItem>) => {
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l
      const p = { ...patch }
      // API returns numeric columns as strings ("50.00"). Coerce here so state
      // is always a number regardless of which code path set the value.
      if ('purchasePrice' in p) p.purchasePrice = Number(p.purchasePrice) || 0
      if ('salePrice'     in p) p.salePrice     = Number(p.salePrice)     || 0
      if ('discountPct'   in p) p.discountPct   = Number(p.discountPct)   || 0
      if ('taxPct'        in p) p.taxPct        = Number(p.taxPct)        || 0
      if ('purchaseQty'   in p) p.purchaseQty   = Number(p.purchaseQty)   || 0
      if ('freeGoodsQty'  in p) p.freeGoodsQty  = Number(p.freeGoodsQty)  || 0
      const updated = { ...l, ...p }
      updated.lineTotal = calcLineTotal(updated)
      return updated
    }))
  }, [])

  const handleSelectProduct = useCallback(async (key: string, p: ProductSearchResult, supplierId: string) => {
    updateLine(key, {
      productId: p.id,
      productName: p.name,
      productSku: p.sku ?? '',
      purchasePrice: +(p.lastCostPrice ?? 0),
      salePrice: 0,
    })
    if (p.lastCostPrice > 0) {
      const anomaly = await purchasesApi.checkPriceAnomaly(p.id, p.lastCostPrice, supplierId || undefined)
      if (anomaly?.hasAnomaly) {
        setLines(prev => prev.map(l => l._key === key ? { ...l, priceWarning: anomaly } : l))
      }
    }
  }, [updateLine])

  const handlePriceChange = useCallback(async (key: string, price: number, productId: string, supplierId: string) => {
    updateLine(key, { purchasePrice: price })
    if (price > 0 && productId) {
      const anomaly = await purchasesApi.checkPriceAnomaly(productId, price, supplierId || undefined)
      setLines(prev => prev.map(l => l._key === key ? { ...l, priceWarning: anomaly?.hasAnomaly ? anomaly : null } : l))
    }
  }, [updateLine])

  const removeLine = (key: string) => setLines(prev => prev.filter(l => l._key !== key))

  const totals = calcTotals(lines, header.discountType, header.discountValue)

  const handleSubmit = (mode: 'draft' | 'confirm') => {
    if (!header.supplierName.trim()) return
    const validLines = lines.filter(l => l.productId && l.purchaseQty > 0)
    if (!validLines.length) return
    if (mode === 'confirm') {
      if (header.invoiceDate && new Date(header.invoiceDate) > new Date()) {
        alert('تاريخ الفاتورة لا يمكن أن يكون في المستقبل')
        return
      }
      const zeroPrice = validLines.find(l => !(l.purchasePrice > 0))
      if (zeroPrice) {
        alert(`سعر شراء "${zeroPrice.productName || 'منتج'}" غير محدد — أدخل السعر قبل الاستلام`)
        return
      }
      if (totals.grandTotal === 0) {
        alert('الإجمالي يجب أن يكون أكبر من صفر')
        return
      }
    }
    setSubmitMode(mode)
    saveMut.mutate({
      supplierTenantId: header.supplierTenantId || undefined,
      supplierName: header.supplierName,
      supplierInvoiceNumber: header.supplierInvoiceNumber || undefined,
      invoiceDate: header.invoiceDate || undefined,
      paymentMethod: header.paymentMethod,
      discountType: header.discountType,
      discountValue: header.discountValue,
      notes: header.notes || undefined,
      lines: validLines.map((l, i) => ({
        productId: l.productId,
        productName: l.productName,
        productSku: l.productSku || undefined,
        batchNumber: l.batchNumber || undefined,
        expiryDate: l.expiryDate || undefined,
        purchaseQty: +l.purchaseQty || 1,
        freeGoodsQty: +l.freeGoodsQty || 0,
        purchasePrice: +l.purchasePrice || 0,
        salePrice: +l.salePrice || 0,
        discountPct: +l.discountPct || 0,
        taxPct: +l.taxPct || 0,
        priceWarningDismissed: l.priceWarningDismissed,
        sortOrder: i,
      })),
    })
  }

  const warningCount = lines.filter(l => l.priceWarning && !l.priceWarningDismissed).length

  // --- Success screen (shown after confirm, PRD step 10) ---------------------
  if (successInvoice) {
    const lineCount = successInvoice.lines?.length ?? 0
    const fmtMoney = (n: number) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
    return (
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <PartyPopper size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">تم الاستلام بنجاح</h2>
          <p className="text-sm text-gray-500 mb-6">تم تحديث المخزون وتأكيد الفاتورة</p>

          <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-3 text-right">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">رقم الأمر</span>
              <span className="font-bold text-emerald-700 font-mono">{successInvoice.poNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">المورد</span>
              <span className="font-medium text-gray-800">{successInvoice.supplierName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">رقم الأمر</span>
              <span className="font-medium text-gray-800">{lineCount} صنف</span>
            </div>
            <div className="flex justify-between text-sm border-t border-gray-200 pt-3 mt-1">
              <span className="text-gray-600 font-medium">الإجمالي</span>
              <span className="font-bold text-gray-900 text-base">{fmtMoney(successInvoice.grandTotal)} ج.م</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/pharmacy/purchases/invoices/${successInvoice.id}`)}
              className="flex-1 py-2.5 px-4 text-sm rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors font-medium flex items-center justify-center gap-1.5"
            >
              <Eye size={14} /> عرض الفاتورة
            </button>
            <button
              onClick={() => {
                setSuccessInvoice(null)
                setHeader({ supplierName: '', supplierTenantId: '', supplierInvoiceNumber: '', invoiceDate: '', paymentMethod: 'cash', discountType: 'percent', discountValue: 0, notes: '' })
                setLines([newLine()])
              }}
              className="flex-1 py-2.5 px-4 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium flex items-center justify-center gap-1.5"
            >
              <FilePlus size={14} /> فاتورة جديدة
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 px-4 md:px-6 pt-1 pb-8">

      {/* --- Back nav -------------------------------------------------------- */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          to="/pharmacy/purchases/invoices"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-sm"
        >
          <ArrowLeft size={15} />
          رجوع للمشتريات
        </Link>
        <span className="text-gray-300 select-none">/</span>
        <span className="text-sm text-gray-500 font-medium">فاتورة شراء جديدة</span>
      </div>

      {/* --- Hero card ------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-5">
        <div className="flex items-start justify-between gap-5 p-6">
          {/* Icon + title + hint */}
          <div className="flex items-start gap-5 min-w-0">
            <div className="p-4 rounded-2xl shrink-0 bg-emerald-50">
              <PackageCheck size={28} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">فاتورة شراء جديدة</h1>
              <p className="text-gray-500 mt-1.5 text-sm leading-relaxed max-w-xl">
                أدخل بيانات المورد والمنتجات لتسجيل الفاتورة وتحديث المخزون تلقائياً
              </p>
              {/* OCR hint — disappears after 10s, replaced by camera button interaction */}
              <div className={`mt-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 max-w-xl transition-all duration-700 ${showOcrHint && ocrState === 'idle' ? 'opacity-100 max-h-16' : 'opacity-0 max-h-0 mt-0 py-0 overflow-hidden border-0'}`}>
                <Camera size={13} className="shrink-0 mt-0.5 text-emerald-500" />
                <span className="leading-relaxed">
                  لديك فاتورة ورقية؟ اضغط على أيقونة الكاميرا لملء النموذج تلقائياً بالذكاء الاصطناعي.
                </span>
              </div>
              {/* OCR loading state */}
              {ocrState === 'loading' && (
                <div className="mt-3 flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2 max-w-xl">
                  <Loader2 size={13} className="animate-spin shrink-0 text-violet-500" />
                  <span>جاري قراءة الفاتورة بالذكاء الاصطناعي…</span>
                </div>
              )}
              {/* OCR error */}
              {ocrState === 'error' && (
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 max-w-xl">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={13} className="shrink-0" />
                    <span>
                      {ocrResult?.error === 'OCR_NOT_CONFIGURED'
                        ? 'خدمة OCR غير مُفعَّلة بعد — يمكنك الإدخال اليدوي.'
                        : 'تعذّر قراءة الفاتورة — يمكنك الإدخال اليدوي.'}
                    </span>
                  </div>
                  <button onClick={() => setOcrState('idle')} className="shrink-0"><X size={12} /></button>
                </div>
              )}
              {/* OCR success summary */}
              {ocrState === 'done' && ocrResult && (
                <div className="mt-3 max-w-xl bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                      <CheckCircle2 size={13} />تم استخراج البيانات تلقائياً
                    </span>
                    <button onClick={() => setOcrState('idle')} className="text-emerald-500 hover:text-emerald-700"><X size={12} /></button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-emerald-700">
                    {ocrResult.vendorName && (
                      <span>المورد: <strong>{ocrResult.vendorName}</strong>
                        <ConfBadge conf={ocrResult.vendorNameConfidence} />
                      </span>
                    )}
                    {ocrResult.invoiceId && (
                      <span>رقم الفاتورة: <strong>{ocrResult.invoiceId}</strong>
                        <ConfBadge conf={ocrResult.invoiceIdConfidence} />
                      </span>
                    )}
                    {ocrResult.invoiceDate && (
                      <span>التاريخ: <strong>{ocrResult.invoiceDate}</strong>
                        <ConfBadge conf={ocrResult.invoiceDateConfidence} />
                      </span>
                    )}
                    {ocrResult.lineItems.filter(l => l.matchedProduct).length > 0 && (
                      <span>{ocrResult.lineItems.filter(l => l.matchedProduct && l.matchedProduct.matchScore >= 60).length} منتج تم مطابقته</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {/* Camera / OCR button */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleOcrFile}
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={ocrState === 'loading'}
              title="مسح الفاتورة الورقية بالكاميرا"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all font-medium shadow-sm disabled:opacity-50"
            >
              {ocrState === 'loading'
                ? <Loader2 size={14} className="animate-spin" />
                : <Camera size={14} />}
              مسح ضوئي
            </button>
            <button
              onClick={() => handleSubmit('draft')}
              disabled={saveMut.isPending || !header.supplierName}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50 font-medium shadow-sm"
            >
              {saveMut.isPending && submitMode === 'draft'
                ? <Loader2 size={14} className="animate-spin" />
                : <Save size={14} />}
              مسح ضوئي
            </button>
            <button
              onClick={() => handleSubmit('confirm')}
              disabled={saveMut.isPending || !header.supplierName}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-semibold disabled:opacity-50 shadow-sm"
            >
              {saveMut.isPending && submitMode === 'confirm'
                ? <Loader2 size={14} className="animate-spin" />
                : <PackageCheck size={14} />}
              مسح ضوئي
            </button>
          </div>
        </div>
      </div>

      {/* --- Error banner ---------------------------------------------------- */}
      {saveMut.isError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <div className="flex items-center gap-2 font-medium mb-1">
            <AlertTriangle size={15} className="shrink-0" />
            فشل الحفظ — يرجى مراجعة البيانات
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-xs pr-1">
            {getApiErrors(saveMut.error).map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      {warningCount > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-700 text-sm">
            <AlertTriangle size={15} />
            <span>{warningCount} منتج يحتوي على تحذير سعر غير عادي</span>
          </div>
          <button
            onClick={() => setLines(prev => prev.map(l => ({ ...l, priceWarningDismissed: true })))}
            className="text-xs text-amber-600 hover:text-amber-800 underline"
          >
            تجاهل الكل
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Lines table — 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 text-sm">أصناف الفاتورة</h2>
              <button
                onClick={() => setLines(prev => [...prev, newLine()])}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
              >
                <Plus size={13} /> إضافة صنف
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-48">المنتج</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-20">دفعة</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-28">تاريخ الانتهاء</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">الكمية</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">الكمية</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-20">سعر الشراء</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-20">سعر الشراء</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">خصم%</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">خصم%</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-20">دفعة</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lines.map((line) => (
                    <React.Fragment key={line._key}>
                      <tr className={clsx(
                        line.priceWarning && !line.priceWarningDismissed ? 'bg-amber-50/30' : '',
                      )}>
                        <td className="px-3 py-2">
                          <ProductSearchCombobox
                            value={line.productName}
                            onSelect={(p) => handleSelectProduct(line._key, p, header.supplierTenantId)}
                            queryFn={(q) => purchasesApi.searchProducts(q, header.supplierTenantId || undefined)}
                            queryKey={['purchase-product-search', header.supplierTenantId]}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            placeholder="مثال: B001"
                            value={line.batchNumber}
                            onChange={e => updateLine(line._key, { batchNumber: e.target.value })}
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={line.expiryDate}
                            onChange={e => updateLine(line._key, { expiryDate: e.target.value })}
                            className={clsx(
                              'w-full px-2 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-emerald-500',
                              line.expiryDate && Math.ceil((new Date(line.expiryDate).getTime() - Date.now()) / 86_400_000) <= 90
                                ? 'border-amber-400 bg-amber-50'
                                : 'border-gray-200',
                            )}
                          />
                          {line.expiryDate && Math.ceil((new Date(line.expiryDate).getTime() - Date.now()) / 86_400_000) <= 90 && (
                            <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-0.5">
                              <AlertTriangle size={9} /> تاريخ انتهاء قريب — تأكد مع المورد
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number" min={1}
                            value={line.purchaseQty}
                            onChange={e => updateLine(line._key, { purchaseQty: parseInt(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number" min={0}
                            value={line.freeGoodsQty}
                            onChange={e => updateLine(line._key, { freeGoodsQty: parseInt(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number" min={0} step="0.01"
                            value={line.purchasePrice}
                            onChange={e => handlePriceChange(line._key, parseFloat(e.target.value) || 0, line.productId, header.supplierTenantId)}
                            className={clsx(
                              'w-full px-2 py-1.5 rounded-lg border text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums',
                              line.priceWarning && !line.priceWarningDismissed ? 'border-amber-400 bg-amber-50' : 'border-gray-200',
                            )}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number" min={0} step="0.01"
                            value={line.salePrice}
                            onChange={e => updateLine(line._key, { salePrice: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number" min={0} max={100} step="0.1"
                            value={line.discountPct}
                            onChange={e => updateLine(line._key, { discountPct: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number" min={0} max={100} step="0.1"
                            value={line.taxPct}
                            onChange={e => updateLine(line._key, { taxPct: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2 text-left">
                          <p className="font-bold text-gray-800 tabular-nums">{calcLineTotal(line).toFixed(2)}</p>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => removeLine(line._key)}
                            className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                      {line.priceWarning && !line.priceWarningDismissed && (
                        <tr key={`${line._key}-warn`} className="bg-amber-50/50">
                          <td colSpan={11} className="px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-amber-700 text-xs">
                                <AlertTriangle size={12} />
                                <span>
                                  سعر {line.priceWarning.direction === 'higher' ? 'أعلى' : 'أقل'} من المعتاد بنسبة{' '}
                                  <strong>{line.priceWarning.deviationPct}%</strong>
                                  {' '}· متوسط السعر: {line.priceWarning.historicalAvg.toFixed(2)} ج.م
                                </span>
                              </div>
                              <button
                                onClick={() => updateLine(line._key, { priceWarningDismissed: true })}
                                className="text-[11px] text-amber-600 hover:text-amber-800 underline"
                              >
                                تجاهل
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-2 border-t border-dashed border-gray-100">
              <button
                onClick={() => setLines(prev => [...prev, newLine()])}
                className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
              >
                <Plus size={13} /> إضافة صنف آخر
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar — 1/3 */}
        <div className="space-y-4">
          {/* Supplier */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <Building2 size={15} className="text-emerald-600" />
              مسح ضوئي
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">اسم المورد <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type="text"
                  list="suppliers-list"
                  placeholder="ابحث أو اكتب اسم المورد…"
                  value={header.supplierName}
                  onChange={e => {
                    const found = suppliers.find(s => s.name === e.target.value)
                    setHeader(h => ({
                      ...h,
                      supplierName: e.target.value,
                      supplierTenantId: found?.supplierTenantId ?? '',
                    }))
                  }}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <datalist id="suppliers-list">
                  {suppliers.map(s => <option key={s.id} value={s.name} />)}
                </datalist>
              </div>
              {/* Supplier history chips */}
              {supplierHistory && supplierHistory.items.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {supplierHistory.items.map(inv => (
                    <span key={inv.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-medium border border-emerald-100">
                      {inv.poNumber} · {Number(inv.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 0 })} ج.م · {new Date(inv.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">رقم فاتورة المورد</label>
              <input
                type="text"
                placeholder="اختياري"
                value={header.supplierInvoiceNumber}
                onChange={e => setHeader(h => ({ ...h, supplierInvoiceNumber: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">تاريخ الفاتورة</label>
              <input
                type="date"
                value={header.invoiceDate}
                onChange={e => setHeader(h => ({ ...h, invoiceDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">تاريخ الفاتورة</label>
              <select
                value={header.paymentMethod}
                onChange={e => setHeader(h => ({ ...h, paymentMethod: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="cash">نقدي</option>
                <option value="credit_card">بطاقة ائتمان</option>
                <option value="bank_transfer">تحويل بنكي</option>
                <option value="credit_term">آجل</option>
              </select>
            </div>
          </div>

          {/* Discount & Notes */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <h3 className="font-semibold text-gray-800 text-sm">الخصم والملاحظات</h3>

            <div className="flex gap-2">
              <select
                value={header.discountType}
                onChange={e => setHeader(h => ({ ...h, discountType: e.target.value as any }))}
                className="px-2 py-2 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="percent">نسبة %</option>
                <option value="fixed">مبلغ ثابت</option>
              </select>
              <input
                type="number" min={0} step="0.01"
                value={header.discountValue}
                onChange={e => setHeader(h => ({ ...h, discountValue: parseFloat(e.target.value) || 0 }))}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">ملاحظات</label>
              <textarea
                rows={2}
                placeholder="ملاحظات إضافية…"
                value={header.notes}
                onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>
          </div>

          {/* Totals */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <h3 className="font-semibold text-gray-800 text-sm mb-3">ملخص الفاتورة</h3>
            <div className="flex justify-between text-sm text-gray-600">
              <span>المجموع الجزئي</span>
              <span className="tabular-nums font-medium">{totals.subtotal.toFixed(2)} ج.م</span>
            </div>
            {totals.totalDiscount > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>الخصم</span>
                <span className="tabular-nums">- {totals.totalDiscount.toFixed(2)} ج.م</span>
              </div>
            )}
            {totals.totalTax > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>الخصم</span>
                <span className="tabular-nums">{totals.totalTax.toFixed(2)} ج.م</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-2 flex justify-between text-base font-bold text-gray-900">
              <span>الإجمالي</span>
              <span className="tabular-nums text-emerald-700">{totals.grandTotal.toFixed(2)} ج.م</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => handleSubmit('draft')}
              disabled={saveMut.isPending || !header.supplierName}
              className="flex-1 py-3 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 font-medium"
            >
              {saveMut.isPending && submitMode === 'draft' ? 'جاري الحفظ…' : 'حفظ كمسودة'}
            </button>
            <button
              onClick={() => handleSubmit('confirm')}
              disabled={saveMut.isPending || !header.supplierName}
              className="flex-1 py-3 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
            >
              {saveMut.isPending && submitMode === 'confirm' ? 'جاري الحفظ…' : 'حفظ وتأكيد'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
