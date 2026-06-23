import React, { useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Building2, Plus, Trash2, AlertTriangle,
  CheckCircle2, Loader2, ChevronDown, Save, PackageCheck,
} from 'lucide-react'
import clsx from 'clsx'
import { purchasesApi, type ProductSearchResult } from '../../../api/purchases.api'
import { ProductSearchCombobox } from './ProductSearchCombobox'

// ─── Types ─────────────────────────────────────────────────────────────────────

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

// ─── Calc ───────────────────────────────────────────────────────────────────────

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

// ─── Main Page ──────────────────────────────────────────────────────────────────

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

  const { data: suppliers = [] } = useQuery({
    queryKey: ['purchase-suppliers'],
    queryFn: purchasesApi.getSuppliers,
    staleTime: 60_000,
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
      navigate('/pharmacy/purchases/invoices')
    },
  })

  const updateLine = useCallback((key: string, patch: Partial<LineItem>) => {
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l
      const updated = { ...l, ...patch }
      updated.lineTotal = calcLineTotal(updated)
      return updated
    }))
  }, [])

  const handleSelectProduct = useCallback(async (key: string, p: ProductSearchResult, supplierId: string) => {
    updateLine(key, {
      productId: p.id,
      productName: p.name,
      productSku: p.sku ?? '',
      purchasePrice: p.lastCostPrice ?? 0,
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
        purchaseQty: l.purchaseQty,
        freeGoodsQty: l.freeGoodsQty,
        purchasePrice: l.purchasePrice,
        salePrice: l.salePrice,
        discountPct: l.discountPct,
        taxPct: l.taxPct,
        priceWarningDismissed: l.priceWarningDismissed,
        sortOrder: i,
      })),
    })
  }

  const warningCount = lines.filter(l => l.priceWarning && !l.priceWarningDismissed).length

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/pharmacy/purchases/invoices" className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">فاتورة شراء جديدة</h1>
            <p className="text-sm text-gray-500">أدخل بيانات الفاتورة والمنتجات</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSubmit('draft')}
            disabled={saveMut.isPending || !header.supplierName}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {saveMut.isPending && submitMode === 'draft' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            حفظ مسودة
          </button>
          <button
            onClick={() => handleSubmit('confirm')}
            disabled={saveMut.isPending || !header.supplierName}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {saveMut.isPending && submitMode === 'confirm' ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
            حفظ واستلام
          </button>
        </div>
      </div>

      {saveMut.isError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={15} />
          حدث خطأ. يرجى المحاولة مجدداً.
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
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">مجاني</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-20">سعر الشراء</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-20">سعر البيع</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">خصم%</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">ضريبة%</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-20">الإجمالي</th>
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
                                  {' '}· متوسط تاريخي: {line.priceWarning.historicalAvg.toFixed(2)} ر.س
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
              بيانات المورد
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">اسم المورد <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type="text"
                  list="suppliers-list"
                  placeholder="ابحث أو أدخل اسماً جديداً…"
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
              <label className="text-xs font-medium text-gray-600">طريقة الدفع</label>
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
              <span className="tabular-nums font-medium">{totals.subtotal.toFixed(2)} ر.س</span>
            </div>
            {totals.totalDiscount > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>الخصم</span>
                <span className="tabular-nums">- {totals.totalDiscount.toFixed(2)} ر.س</span>
              </div>
            )}
            {totals.totalTax > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>الضريبة</span>
                <span className="tabular-nums">{totals.totalTax.toFixed(2)} ر.س</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-2 flex justify-between text-base font-bold text-gray-900">
              <span>الإجمالي</span>
              <span className="tabular-nums text-emerald-700">{totals.grandTotal.toFixed(2)} ر.س</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => handleSubmit('draft')}
              disabled={saveMut.isPending || !header.supplierName}
              className="flex-1 py-3 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 font-medium"
            >
              {saveMut.isPending && submitMode === 'draft' ? 'جارٍ الحفظ…' : 'حفظ مسودة'}
            </button>
            <button
              onClick={() => handleSubmit('confirm')}
              disabled={saveMut.isPending || !header.supplierName}
              className="flex-1 py-3 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
            >
              {saveMut.isPending && submitMode === 'confirm' ? 'جارٍ الحفظ…' : 'حفظ واستلام'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
