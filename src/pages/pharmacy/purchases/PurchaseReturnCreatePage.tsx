import { useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Building2, Plus, Trash2, AlertTriangle,
  Loader2, Save, CheckCircle2,
} from 'lucide-react'
import { purchasesApi, type ProductSearchResult } from '../../../api/purchases.api'
import { getApiErrors } from '../../../api/errors'
import { ProductSearchCombobox } from './ProductSearchCombobox'

interface ReturnLineItem {
  _key: string
  productId: string
  productName: string
  productSku: string
  batchNumber: string
  expiryDate: string
  availableQty: number
  returnQty: number
  freeGoodsQty: number
  returnPrice: number
  discountPct: number
  taxPct: number
}

function calcReturnTotal(l: ReturnLineItem) {
  const base = l.returnQty * l.returnPrice
  const afterDisc = base * (1 - l.discountPct / 100)
  const tax = afterDisc * (l.taxPct / 100)
  return +(afterDisc + tax).toFixed(2)
}

function calcTotals(lines: ReturnLineItem[], discountType: 'percent' | 'fixed', discountValue: number) {
  const subtotal = lines.reduce((s, l) => {
    const base = l.returnQty * l.returnPrice
    return s + base * (1 - l.discountPct / 100)
  }, 0)
  const totalTax = lines.reduce((s, l) => {
    const base = l.returnQty * l.returnPrice
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

const newLine = (): ReturnLineItem => ({
  _key: Math.random().toString(36).slice(2),
  productId: '', productName: '', productSku: '',
  batchNumber: '', expiryDate: '',
  availableQty: 0, returnQty: 1, freeGoodsQty: 0,
  returnPrice: 0, discountPct: 0, taxPct: 15,
})


export default function PurchaseReturnCreatePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [header, setHeader] = useState({
    supplierName: '', supplierTenantId: '',
    supplierInvoiceDate: '', supplierInvoiceNumber: '',
    paymentMethod: 'cash',
    discountType: 'percent' as 'percent' | 'fixed',
    discountValue: 0,
    notes: '',
  })
  const [lines, setLines] = useState<ReturnLineItem[]>([newLine()])
  const [submitMode, setSubmitMode] = useState<'draft' | 'confirm'>('draft')

  const { data: suppliers = [] } = useQuery({
    queryKey: ['purchase-suppliers'],
    queryFn: purchasesApi.getSuppliers,
    staleTime: 60_000,
  })

  const saveMut = useMutation({
    mutationFn: async (dto: any) => {
      const ret = await purchasesApi.createReturn(dto)
      if (submitMode === 'confirm') return purchasesApi.confirmReturn(ret.id)
      return ret
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-returns'] })
      navigate('/pharmacy/purchases/returns')
    },
  })

  const updateLine = useCallback((key: string, patch: Partial<ReturnLineItem>) => {
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l
      const p = { ...patch }
      if ('returnPrice'  in p) p.returnPrice  = Number(p.returnPrice)  || 0
      if ('salePrice'    in p) p.salePrice    = Number(p.salePrice)    || 0
      if ('discountPct'  in p) p.discountPct  = Number(p.discountPct)  || 0
      if ('taxPct'       in p) p.taxPct       = Number(p.taxPct)       || 0
      if ('returnQty'    in p) p.returnQty    = Number(p.returnQty)    || 0
      if ('freeGoodsQty' in p) p.freeGoodsQty = Number(p.freeGoodsQty) || 0
      if ('availableQty' in p) p.availableQty = Number(p.availableQty) || 0
      return { ...l, ...p }
    }))
  }, [])

  const handleSelectProduct = useCallback((key: string, p: ProductSearchResult) => {
    updateLine(key, {
      productId: p.id,
      productName: p.name,
      productSku: p.sku ?? '',
      availableQty: p.currentStock,
      returnPrice: +(p.lastCostPrice ?? 0),
    })
  }, [updateLine])

  const removeLine = (key: string) => setLines(prev => prev.filter(l => l._key !== key))

  const totals = calcTotals(lines, header.discountType, header.discountValue)

  const handleSubmit = (mode: 'draft' | 'confirm') => {
    if (!header.supplierName.trim()) return
    const validLines = lines.filter(l => l.productId && l.returnQty > 0)
    if (!validLines.length) return
    if (mode === 'confirm' && !header.supplierInvoiceDate) {
      alert('يرجى إدخال تاريخ الفاتورة الأصلية من المورد')
      return
    }
    setSubmitMode(mode)
    saveMut.mutate({
      supplierTenantId: header.supplierTenantId || undefined,
      supplierName: header.supplierName,
      supplierInvoiceDate: header.supplierInvoiceDate || undefined,
      supplierInvoiceNumber: header.supplierInvoiceNumber || undefined,
      paymentMethod: header.paymentMethod,
      discountType: header.discountType,
      discountValue: header.discountValue,
      notes: header.notes || undefined,
      lines: validLines.map(l => ({
        productId: l.productId,
        productName: l.productName,
        productSku: l.productSku || undefined,
        batchNumber: l.batchNumber || undefined,
        expiryDate: l.expiryDate || undefined,
        availableQty: +l.availableQty || 0,
        returnQty: +l.returnQty || 1,
        freeGoodsQty: +l.freeGoodsQty || 0,
        returnPrice: +l.returnPrice || 0,
        discountPct: +l.discountPct || 0,
        taxPct: +l.taxPct || 0,
      })),
    })
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/pharmacy/purchases/returns" className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">مرتجع شراء جديد</h1>
            <p className="text-sm text-gray-500">أدخل بيانات المرتجع والأصناف</p>
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
            {saveMut.isPending && submitMode === 'confirm' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            حفظ وتأكيد
          </button>
        </div>
      </div>

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

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Lines */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 text-sm">أصناف المرتجع</h2>
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
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-16">المتاح</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">المرتجع</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">مجاني</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-20">سعر المرتجع</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">خصم%</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-14">ضريبة%</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500 w-20">الإجمالي</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lines.map((line) => (
                    <tr key={line._key}>
                      <td className="px-3 py-2">
                        <ProductSearchCombobox
                          value={line.productName}
                          onSelect={(p) => handleSelectProduct(line._key, p)}
                          queryFn={(q) => purchasesApi.searchProductsForReturn(q, header.supplierTenantId || undefined)}
                          queryKey={['return-product-search', header.supplierTenantId]}
                          placeholder="ابحث في مشتريات هذا المورد…"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          placeholder="B001"
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
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-2 py-2 text-center text-gray-500 tabular-nums">{line.availableQty}</td>
                      <td className="px-2 py-2">
                        <input
                          type="number" min={1} max={line.availableQty || undefined}
                          value={line.returnQty}
                          onChange={e => updateLine(line._key, { returnQty: parseInt(e.target.value) || 0 })}
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
                          value={line.returnPrice}
                          onChange={e => updateLine(line._key, { returnPrice: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number" min={0} max={100}
                          value={line.discountPct}
                          onChange={e => updateLine(line._key, { discountPct: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number" min={0} max={100}
                          value={line.taxPct}
                          onChange={e => updateLine(line._key, { taxPct: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-2 text-left">
                        <p className="font-bold text-gray-800 tabular-nums">{calcReturnTotal(line).toFixed(2)}</p>
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

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <Building2 size={15} className="text-emerald-600" />
              بيانات المورد
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">اسم المورد <span className="text-red-500">*</span></label>
              <input
                type="text"
                list="return-suppliers-list"
                placeholder="اسم المورد…"
                value={header.supplierName}
                onChange={e => {
                  const found = suppliers.find(s => s.name === e.target.value)
                  setHeader(h => ({ ...h, supplierName: e.target.value, supplierTenantId: found?.supplierTenantId ?? '' }))
                }}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <datalist id="return-suppliers-list">
                {suppliers.map(s => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">رقم فاتورة المورد الأصلية</label>
              <input
                type="text"
                placeholder="اختياري"
                value={header.supplierInvoiceNumber}
                onChange={e => setHeader(h => ({ ...h, supplierInvoiceNumber: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">تاريخ فاتورة المورد</label>
              <input
                type="date"
                value={header.supplierInvoiceDate}
                onChange={e => setHeader(h => ({ ...h, supplierInvoiceDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">طريقة الاسترداد</label>
              <select
                value={header.paymentMethod}
                onChange={e => setHeader(h => ({ ...h, paymentMethod: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="cash">نقدي</option>
                <option value="credit_card">بطاقة ائتمان</option>
                <option value="bank_transfer">تحويل بنكي</option>
                <option value="credit_term">آجل</option>
              </select>
            </div>
          </div>

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
            <textarea
              rows={2}
              placeholder="ملاحظات…"
              value={header.notes}
              onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Totals */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <h3 className="font-semibold text-gray-800 text-sm mb-3">ملخص المرتجع</h3>
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
            <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
              <span>الإجمالي</span>
              <span className="tabular-nums text-emerald-700">{totals.grandTotal.toFixed(2)} ر.س</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleSubmit('draft')}
              disabled={saveMut.isPending || !header.supplierName}
              className="flex-1 py-3 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {saveMut.isPending && submitMode === 'draft' ? 'جارٍ الحفظ…' : 'حفظ مسودة'}
            </button>
            <button
              onClick={() => handleSubmit('confirm')}
              disabled={saveMut.isPending || !header.supplierName}
              className="flex-1 py-3 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
            >
              {saveMut.isPending && submitMode === 'confirm' ? 'جارٍ الحفظ…' : 'حفظ وتأكيد'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
