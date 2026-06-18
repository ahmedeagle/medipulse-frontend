import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search, X, Plus, Minus, User, CreditCard, Banknote, AlertTriangle,
  Clock, Package, CheckCircle2, Keyboard, Zap, Receipt,
  TrendingUp, DollarSign, RotateCcw, Trash2, ScanLine,
  ShoppingCart, Shield, ShieldOff, Store, Boxes, ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'
import { posApi, type PosProduct, type PosCustomer, type PosShift } from '../../../api/pos.api'
import { p2pMarketplaceApi } from '../../../api/p2p.api'
import { useCurrency } from '../../../hooks/useCurrency'
import { pharmacySettingsApi } from '../../../api/pharmacy-settings.api'
import { printShiftSummary } from '../../../utils/shiftPrint'

// ── Types ─────────────────────────────────────────────────────────────────────
interface CartItem {
  inventoryItemId: string
  productId:       string
  productName:     string
  barcode:         string | null
  quantity:        number
  unitPrice:       number
  discountAmount:  number
  available:       number
  expiryDate:      string | null
}

interface SaleTab {
  id:               string
  num:              number
  cart:             CartItem[]
  customer:         PosCustomer | null
  discount:         number
  insuranceEnabled: boolean
}


function expiryWarning(date: string | null) {
  if (!date) return null
  const days = Math.floor((new Date(date).getTime() - Date.now()) / 86400000)
  if (days < 0)  return { label: 'منتهي الصلاحية', cls: 'text-red-600 bg-red-50' }
  if (days < 30) return { label: `ينتهي خلال ${days} يوم`, cls: 'text-amber-600 bg-amber-50' }
  if (days < 90) return { label: new Date(date).toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' }), cls: 'text-gray-500 bg-gray-50' }
  return null
}

function stockBadge(qty: number, min: number) {
  if (qty <= 0)    return { label: `0 متاح`,     cls: 'bg-red-50 text-red-600' }
  if (qty <= min)  return { label: `${qty} متاح`, cls: 'bg-amber-50 text-amber-600' }
  return                   { label: `${qty} متاح`, cls: 'bg-teal-50 text-teal-700' }
}

let tabIdCounter = 1
const mkTab = (): SaleTab => ({
  id:               `tab-${++tabIdCounter}`,
  num:              tabIdCounter,
  cart:             [],
  customer:         null,
  discount:         0,
  insuranceEnabled: false,
})
const mkInitTab = (): SaleTab => ({ id: 'tab-1', num: 1, cart: [], customer: null, discount: 0, insuranceEnabled: false })

// ── Open Shift Modal ──────────────────────────────────────────────────────────
function OpenShiftModal({ onOpen, onBack }: { onOpen: (b: number, n: string) => void; onBack: () => void }) {
  const [balance, setBalance] = useState('0')
  const [note, setNote]       = useState('')
  const { currency } = useCurrency()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-gradient-to-br from-teal-500 to-emerald-600 px-8 py-7 text-white relative">
          <button
            onClick={onBack}
            className="absolute top-4 left-4 p-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
            title="رجوع"
          >
            <X size={16} />
          </button>
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-3">
            <Receipt size={24} />
          </div>
          <h2 className="text-xl font-bold">فتح شفت جديد</h2>
          <p className="text-teal-100 text-sm mt-1">ابدأ جلسة الكاشير وتتبع معاملاتك</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">مبلغ الكاش الافتتاحي</label>
            <div className="relative">
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">{currency}</span>
              <input
                autoFocus type="number" value={balance}
                onChange={e => setBalance(e.target.value)}
                className="w-full pr-12 pl-4 py-3 rounded-xl border border-gray-200 text-right text-lg font-semibold focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">ملاحظة الشفت (اختياري)</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none"
              placeholder="أي ملاحظات لهذا الشفت..." />
          </div>
          <button onClick={() => onOpen(Number(balance) || 0, note)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold text-sm shadow-lg shadow-teal-200 hover:shadow-teal-300 transition-all active:scale-95">
            ▶ بدء الشفت
          </button>
          <button onClick={onBack}
            className="w-full py-2 rounded-xl text-gray-400 text-sm hover:text-gray-600 hover:bg-gray-50 transition-colors">
            رجوع بدون فتح شفت
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Close Shift Modal ─────────────────────────────────────────────────────────
function CloseShiftModal({ shift, onClose, onConfirm, isPending }: {
  shift: PosShift; onClose: () => void
  onConfirm: (closing: number, note: string) => void; isPending: boolean
}) {
  const [actualCash,   setActualCash]   = useState('')
  const [note,         setNote]         = useState('')
  const [notesOpen,    setNotesOpen]    = useState(false)
  const { currency, fmt } = useCurrency()

  const { data: settings } = useQuery({
    queryKey: ['pharmacy-settings'],
    queryFn:  pharmacySettingsApi.getSettings,
    staleTime: 5 * 60_000,
  })

  const elapsed = Math.floor((Date.now() - new Date(shift.openedAt).getTime()) / 60000)
  const elapsedText = elapsed < 60
    ? `${elapsed} دقيقة`
    : `${Math.floor(elapsed / 60)}س ${elapsed % 60}د`

  // System expected cash in drawer
  const systemExpected =
    Number(shift.openingBalance)
    + Number(shift.totalCashIn ?? 0)
    - Number(shift.totalCashOut ?? 0)
    + Number(shift.totalCashSales ?? 0)

  const actualNum  = Number(actualCash) || 0
  const variance   = actualNum - systemExpected
  const isShort    = variance < -10
  const isOver     = variance > 10
  const isBalanced = !isShort && !isOver

  const initials = (shift.cashierName ?? 'K').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const printSummary = () => {
    printShiftSummary(shift, {
      currency,
      pharmName: settings?.pharmacyNameAr || settings?.pharmacyNameEn,
      address:   settings?.address,
      phone:     settings?.phone,
      closingBalance: actualNum,
      closeNote:      note,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 text-base">إغلاق الشفت</h3>
            <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded-lg">
              Shift-{shift.id.slice(0, 6)}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Cashier + duration card */}
          <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-teal-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm">{shift.cashierName ?? 'كاشير'}</p>
              <p className="text-xs text-gray-400 mt-0.5">pharmacy-admin</p>
            </div>
            <div className="text-left shrink-0">
              <p className="text-xs text-gray-400 mb-0.5">مدة الشفت</p>
              <div className="flex items-center gap-1 text-sm font-bold text-gray-700">
                <Clock size={13} className="text-teal-500" />
                {elapsedText}
              </div>
            </div>
          </div>

          {/* Shift timeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-[11px] text-gray-400 mb-1">بدأت</p>
              <p className="text-xs font-semibold text-gray-700">
                {new Date(shift.openedAt).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {new Date(shift.openedAt).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-[11px] text-gray-400 mb-1">تنتهي</p>
              <p className="text-xs font-semibold text-gray-700">
                {new Date().toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {new Date().toLocaleDateString('ar-EG', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Shift summary */}
          <div>
            <p className="text-xs font-bold text-gray-400 mb-2.5">ملخص الشفت</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <div className="bg-teal-50 rounded-xl px-3 py-3 text-center">
                <p className="text-lg font-black text-teal-700 tabular-nums">{fmt(Number(shift.totalSales))}</p>
                <p className="text-[11px] text-teal-600 mt-0.5">إجمالي المبيعات</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-3 text-center">
                <p className="text-lg font-black text-gray-800 tabular-nums">{shift.transactionCount}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">ملخص البيعة</p>
              </div>
              <div className="bg-red-50 rounded-xl px-3 py-3 text-center">
                <p className="text-lg font-black text-red-600 tabular-nums">{fmt(Number(shift.totalReturns))}</p>
                <p className="text-[11px] text-red-500 mt-0.5">المرتجعات</p>
              </div>
            </div>
          </div>

          {/* Payment breakdown */}
          <div>
            <p className="text-xs font-bold text-gray-400 mb-2.5">تفصيل المدفوعات</p>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <span className="text-sm text-gray-600">مبلغ افتتاح الشفت</span>
                <span className="font-semibold text-gray-800 tabular-nums">{fmt(Number(shift.openingBalance))}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">نقدي</span>
                  <Banknote size={13} className="text-teal-500" />
                </div>
                <span className="font-semibold text-gray-800 tabular-nums">{fmt(Number(shift.totalCashSales ?? 0))}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">كارت / فيزا</span>
                  <CreditCard size={13} className="text-blue-500" />
                </div>
                <span className="font-semibold text-gray-800 tabular-nums">{fmt(Number(shift.totalCardSales ?? 0))}</span>
              </div>
              {(Number(shift.totalCashIn) > 0 || Number(shift.totalCashOut) > 0) && (
                <>
                  {Number(shift.totalCashIn) > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                      <span className="text-sm text-gray-600">إدخال نقدية</span>
                      <span className="font-semibold text-teal-600 tabular-nums">+{fmt(Number(shift.totalCashIn))}</span>
                    </div>
                  )}
                  {Number(shift.totalCashOut) > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                      <span className="text-sm text-gray-600">إخراج نقدية</span>
                      <span className="font-semibold text-red-500 tabular-nums">−{fmt(Number(shift.totalCashOut))}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                <span className="text-sm font-bold text-gray-700">صافي المبيعات</span>
                <span className="font-black text-gray-900 tabular-nums">{fmt(Number(shift.totalSales) - Number(shift.totalReturns))}</span>
              </div>
            </div>
          </div>

          {/* Cash register audit */}
          <div>
            <p className="text-xs font-bold text-gray-400 mb-2.5">عد الصندوق النقدي</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {/* Actual cash input */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">النقد الفعلي المحسوب</label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{currency}</span>
                  <input
                    autoFocus
                    type="number"
                    value={actualCash}
                    onChange={e => setActualCash(e.target.value)}
                    className={clsx(
                      'w-full pr-10 pl-3 py-3 rounded-xl border-2 text-right font-bold text-lg outline-none transition-all tabular-nums',
                      isShort   ? 'border-red-300 focus:border-red-400 bg-red-50/30 text-red-700' :
                      isOver    ? 'border-amber-300 focus:border-amber-400 bg-amber-50/30 text-amber-700' :
                      actualCash ? 'border-teal-300 focus:border-teal-400 bg-teal-50/30 text-teal-700' :
                      'border-gray-200 focus:border-teal-400',
                    )}
                    placeholder="0"
                  />
                </div>
              </div>
              {/* System expected */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">المتوقع من النظام</label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{currency}</span>
                  <div className="w-full pr-10 pl-3 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 text-right font-bold text-lg text-gray-600 tabular-nums">
                    {systemExpected.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>

            {/* Variance display */}
            <div className={clsx(
              'flex items-center justify-between px-4 py-3 rounded-xl border',
              isShort   ? 'bg-red-50 border-red-200' :
              isOver    ? 'bg-amber-50 border-amber-200' :
              actualCash ? 'bg-teal-50 border-teal-200' :
              'bg-gray-50 border-gray-200',
            )}>
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'font-semibold text-sm',
                  isShort ? 'text-red-700' : isOver ? 'text-amber-700' : actualCash ? 'text-teal-700' : 'text-gray-500',
                )}>الفرق</span>
                {actualCash && (
                  <span className={clsx(
                    'text-[10px] px-2 py-0.5 rounded-full font-bold',
                    isShort   ? 'bg-red-100 text-red-700' :
                    isOver    ? 'bg-amber-100 text-amber-700' :
                    'bg-teal-100 text-teal-700',
                  )}>
                    {isShort ? 'عجز' : isOver ? 'فائض' : 'مطابق'}
                  </span>
                )}
              </div>
              <span className={clsx(
                'text-base font-black tabular-nums',
                isShort ? 'text-red-600' : isOver ? 'text-amber-600' : actualCash ? 'text-teal-600' : 'text-gray-400',
              )}>
                {actualCash
                  ? `${isOver ? '+' : ''}${currency} ${variance.toFixed(2)}`
                  : `${currency} 0.00`
                }
              </span>
            </div>
          </div>

          {/* Notes — collapsible */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              onClick={() => setNotesOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Receipt size={14} className="text-gray-400" />
                ملاحظات الإغلاق
              </div>
              <span className="text-gray-400 text-lg leading-none">{notesOpen ? '−' : '+'}</span>
            </button>
            {notesOpen && (
              <div className="px-4 pb-4 border-t border-gray-100">
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  className="w-full mt-3 px-3 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none"
                  placeholder="أدخل أي ملاحظات إغلاق..."
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex items-center gap-3">
          <button
            onClick={printSummary}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            <Receipt size={14} /> طباعة الملخص
          </button>

          <button onClick={onClose}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors">
            إلغاء
          </button>

          <button
            disabled={!actualCash || isPending}
            onClick={() => onConfirm(actualNum, note)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-sm transition-colors ms-auto"
          >
            {isPending
              ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  إغلاق الشفت
                </>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ total, fullTotal, isReturn, insurance, onConfirm, onClose }: {
  total: number; fullTotal: number; isReturn: boolean
  insurance?: { copay: number; patientAmount: number; insuranceAmount: number }
  onConfirm: (method: 'cash' | 'card' | 'split', cashAmt?: number, cardAmt?: number) => void
  onClose: () => void
}) {
  const [method, setMethod]       = useState<'cash' | 'card' | 'split'>('cash')
  const [cashAmt, setCashAmt]     = useState(String(Math.ceil(total)))
  const [cardAmt, setCardAmt]     = useState(total.toFixed(2))
  const [splitCash, setSplitCash] = useState(String(Math.floor(total / 2)))
  const { currency, fmt } = useCurrency()

  const change     = method === 'cash' ? Number(cashAmt) - total : 0
  const splitCard  = total - Number(splitCash)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={clsx(
          'px-6 py-5 text-white',
          insurance ? 'bg-gradient-to-br from-blue-600 to-blue-700' : 'bg-gradient-to-br from-teal-500 to-emerald-600',
        )}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base flex items-center gap-2">
              {insurance && <Shield size={16} />}
              طريقة الدفع
            </h3>
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
          {insurance ? (
            <div className="space-y-2">
              <div className="bg-white/10 rounded-xl px-4 py-2.5 flex items-center justify-between">
                <span className="text-blue-100 text-xs">الإجمالي الكلي</span>
                <span className="text-white/70 font-bold tabular-nums text-sm line-through">{fmt(fullTotal)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-white/15 rounded-xl px-3 py-2 text-center">
                  <p className="text-blue-100 text-[10px] mb-0.5">يغطيه التأمين ({100 - insurance.copay}%)</p>
                  <p className="text-white font-bold tabular-nums">{fmt(insurance.insuranceAmount)}</p>
                </div>
                <div className="bg-white/25 rounded-xl px-3 py-2 text-center border border-white/30">
                  <p className="text-blue-100 text-[10px] mb-0.5">يدفعه العميل ({insurance.copay}%)</p>
                  <p className="text-white text-xl font-black tabular-nums">{fmt(insurance.patientAmount)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/15 rounded-xl px-4 py-3 text-center">
              <p className="text-teal-100 text-xs mb-0.5">الإجمالي المستحق</p>
              <p className="text-white text-3xl font-black tabular-nums tracking-tight">{fmt(total)}</p>
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Method picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {([['cash', 'نقدي', Banknote], ['card', 'كارت', CreditCard], ['split', 'مختلط', DollarSign]] as const).map(([m, lbl, Icon]) => (
              <button key={m} onClick={() => setMethod(m)}
                className={clsx(
                  'flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-all border-2',
                  method === m ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50',
                )}>
                <Icon size={18} /> {lbl}
              </button>
            ))}
          </div>

          {/* Amount inputs */}
          {method === 'cash' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">المبلغ المستلم</label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{currency}</span>
                  <input autoFocus type="number" value={cashAmt} onChange={e => setCashAmt(e.target.value)}
                    className="w-full pr-12 pl-4 py-3 rounded-xl border-2 border-gray-200 focus:border-teal-400 text-right text-xl font-bold outline-none transition-colors" />
                </div>
              </div>
              {change >= 0 && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
                  <span className="text-teal-700 text-sm font-medium">الباقي للعميل</span>
                  <span className="text-teal-700 font-black text-base tabular-nums">{fmt(change)}</span>
                </div>
              )}
            </div>
          )}
          {method === 'card' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">مبلغ الكارت</label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{currency}</span>
                <input autoFocus type="number" value={cardAmt} onChange={e => setCardAmt(e.target.value)}
                  className="w-full pr-12 pl-4 py-3 rounded-xl border-2 border-gray-200 focus:border-teal-400 text-right text-xl font-bold outline-none transition-colors" />
              </div>
            </div>
          )}
          {method === 'split' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">نقدي</label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{currency}</span>
                  <input type="number" value={splitCash} onChange={e => setSplitCash(e.target.value)}
                    className="w-full pr-12 pl-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-teal-400 text-right font-semibold outline-none transition-colors" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
                  كارت — متبقي: <span className="text-teal-600">{fmt(Math.max(0, splitCard))}</span>
                </label>
                <div className="bg-gray-50 rounded-xl px-4 py-2.5 text-gray-600 font-semibold text-right border border-gray-200 tabular-nums">
                  {fmt(Math.max(0, splitCard))}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => {
              if (method === 'cash')  onConfirm('cash',  Number(cashAmt))
              if (method === 'card')  onConfirm('card',  undefined, Number(cardAmt))
              if (method === 'split') onConfirm('split', Number(splitCash), Math.max(0, splitCard))
            }}
            className={clsx(
              'w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg',
              isReturn
                ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                : 'bg-teal-600 hover:bg-teal-700 shadow-teal-200',
            )}
          >
            <Zap size={15} />
            {isReturn ? 'تأكيد الاسترداد' : 'تأكيد البيع'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cash Movement Modal ───────────────────────────────────────────────────────
function CashMovementModal({ onSave, onClose }: {
  onSave: (t: 'in' | 'out', amount: number, reason: string, note?: string) => void
  onClose: () => void
}) {
  const [type, setType]     = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote]     = useState('')
  const { currency } = useCurrency()
  const reasons = {
    in:  ['فتح الصندوق', 'إيداع نقدي', 'بيع نقدي'],
    out: ['مصروفات تشغيلية', 'صرف للموظفين', 'مستلزمات'],
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">حركة النقدية</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button onClick={() => setType('in')}
              className={clsx('py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all', type === 'in' ? 'bg-teal-100 text-teal-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100')}>
              <Plus size={14} /> إدخال نقدية
            </button>
            <button onClick={() => setType('out')}
              className={clsx('py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all', type === 'out' ? 'bg-red-100 text-red-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100')}>
              <Minus size={14} /> إخراج نقدية
            </button>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">المبلغ</label>
            <div className="relative">
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{currency}</span>
              <input autoFocus type="number" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-gray-200 text-right font-semibold focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">السبب</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none">
              <option value="">اختر السبب</option>
              {reasons[type].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none"
            placeholder="ملاحظات (اختياري)" />
          <button
            disabled={!amount || !reason}
            onClick={() => { onSave(type, Number(amount), reason, note || undefined); onClose() }}
            className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            تأكيد
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Success Flash ─────────────────────────────────────────────────────────────
function SuccessFlash({ amount, onDone }: { amount: number; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2000); return () => clearTimeout(t) }, [onDone])
  const { fmt } = useCurrency()
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-20 h-20 rounded-full bg-teal-500 flex items-center justify-center mb-4 shadow-2xl shadow-teal-200">
        <CheckCircle2 size={36} className="text-white" />
      </div>
      <p className="text-gray-900 font-black text-2xl mb-1">تم البيع!</p>
      <p className="text-teal-600 text-3xl font-black tabular-nums">{fmt(amount)}</p>
    </div>
  )
}

// ── Shortcuts Overlay ─────────────────────────────────────────────────────────
function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-[360px] mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-gray-900 flex items-center gap-2"><Keyboard size={16} /> اختصارات لوحة المفاتيح</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="space-y-2">
          {[
            { key: 'F10 / /', label: 'تركيز على البحث' },
            { key: 'F4',      label: 'إتمام البيع' },
            { key: 'F6',      label: 'حركة نقدية (إدخال / إخراج)' },
            { key: 'Enter',   label: 'إضافة أول نتيجة للسلة' },
            { key: 'Esc',     label: 'مسح البحث / إلغاء' },
            { key: '?',       label: 'عرض هذه القائمة' },
          ].map(s => (
            <div key={s.key} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{s.label}</span>
              <kbd className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-mono border border-gray-200">{s.key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main POS Page ─────────────────────────────────────────────────────────────
export default function PosPage() {
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const { currency, fmt } = useCurrency()

  // Tabs
  const [tabs, setTabs]           = useState<SaleTab[]>([mkInitTab()])
  const [activeTabId, setActiveTabId] = useState('tab-1')

  // Modals
  const [paying,       setPaying]      = useState(false)
  const [showCash,     setShowCash]    = useState(false)
  const [showShortcuts,setShowShortcuts]=useState(false)
  const [showClose,    setShowClose]   = useState(false)
  const [success,      setSuccess]     = useState<number | null>(null)
  const [isReturn,     setIsReturn]    = useState(false)

  // Search
  const searchRef = useRef<HTMLInputElement>(null)
  const custRef   = useRef<HTMLDivElement>(null)
  const [query,      setQuery]      = useState('')
  const [custSearch, setCustSearch] = useState('')
  const [custOpen,   setCustOpen]   = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTab,  setSearchTab]  = useState<'mine' | 'aumet'>('mine')

  // Active tab
  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0]
  const { cart, customer, discount, insuranceEnabled } = activeTab

  const patchTab = (id: string, patch: Partial<SaleTab>) =>
    setTabs(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))
  const patchActive = (patch: Partial<SaleTab>) => patchTab(activeTabId, patch)

  // Shift
  const { data: shift, isLoading: shiftLoading } = useQuery({
    queryKey: ['pos-shift'],
    queryFn: posApi.getCurrentShift,
    refetchInterval: 30_000,
  })

  // Product search — my inventory
  const { data: products = [], isFetching: productsFetching } = useQuery({
    queryKey: ['pos-products', query],
    queryFn: () => posApi.searchProducts(query),
    enabled: query.length >= 1 && searchTab === 'mine',
    staleTime: 10_000,
  })

  // Product search — Aumet marketplace
  const { data: aumetResults, isFetching: aumetFetching } = useQuery({
    queryKey: ['pos-aumet-search', query],
    queryFn: () => p2pMarketplaceApi.search({ q: query, limit: 10 }),
    enabled: query.length >= 1 && searchTab === 'aumet',
    staleTime: 15_000,
  })

  // Customer search
  const { data: customers } = useQuery({
    queryKey: ['pos-customers-search', custSearch],
    queryFn: () => posApi.listCustomers(custSearch, 10),
    enabled: custSearch.length >= 1,
  })

  // Mutations
  const openShiftMut = useMutation({
    mutationFn: ({ b, n }: { b: number; n: string }) => posApi.openShift(b, n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-shift'] }),
  })
  const closeShiftMut = useMutation({
    mutationFn: ({ closing, note }: { closing: number; note: string }) =>
      posApi.closeShift(shift!.id, closing, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-shift'] })
      navigate('/pharmacy/pos/shifts')
    },
  })
  const txMut = useMutation({
    mutationFn: posApi.createTransaction,
    onSuccess: tx => {
      setSuccess(tx.totalAmount)
      patchActive({ cart: [], customer: null, discount: 0 })
      setPaying(false)
      qc.invalidateQueries({ queryKey: ['pos-shift'] })
    },
  })
  const cashMut = useMutation({
    mutationFn: ({ type, amount, reason, note }: any) =>
      posApi.recordCashMovement(type, amount, reason, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-shift'] }),
  })

  // addToCart must be defined before the keyboard handler that references it
  const addToCart = useCallback((p: PosProduct) => {
    if (p.quantity <= 0 && !isReturn) return
    patchActive({
      cart: (() => {
        const existing = activeTab.cart.find(i => i.inventoryItemId === p.inventoryItemId)
        if (existing) {
          return activeTab.cart.map(i =>
            i.inventoryItemId === p.inventoryItemId ? { ...i, quantity: i.quantity + 1 } : i
          )
        }
        return [...activeTab.cart, {
          inventoryItemId: p.inventoryItemId,
          productId:       p.productId,
          productName:     p.name,
          barcode:         p.barcode,
          quantity:        1,
          unitPrice:       p.sellPrice ?? p.costPrice ?? 0,
          discountAmount:  0,
          available:       p.quantity,
          expiryDate:      p.expiryDate,
        }]
      })(),
    })
    setQuery('')
    setSearchOpen(false)
    searchRef.current?.focus()
  }, [activeTab, isReturn, activeTabId])

  // Close customer dropdown when clicking outside
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!custRef.current?.contains(e.target as Node)) setCustOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === '/' || e.key === 'F10') && document.activeElement !== searchRef.current) {
        e.preventDefault(); searchRef.current?.focus(); setSearchOpen(true)
      }
      if (e.key === 'F4') { e.preventDefault(); if (cart.length) setPaying(true) }
      if (e.key === 'F6') { e.preventDefault(); if (shift) setShowCash(true) }
      if (e.key === '?')  { e.preventDefault(); setShowShortcuts(true) }
      if (e.key === 'Escape') {
        if (paying) { setPaying(false); return }
        if (custOpen) { setCustOpen(false); return }
        setQuery(''); setSearchOpen(false)
      }
      if (e.key === 'Enter' && searchOpen && searchTab === 'mine' && products.length > 0) {
        e.preventDefault(); addToCart(products[0])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cart, shift, paying, custOpen, searchOpen, searchTab, products, addToCart])

  const removeFromCart = (inventoryItemId: string) =>
    patchActive({ cart: activeTab.cart.filter(i => i.inventoryItemId !== inventoryItemId) })

  const updateQty = (inventoryItemId: string, qty: number) =>
    patchActive({ cart: activeTab.cart.map(i => i.inventoryItemId === inventoryItemId ? { ...i, quantity: Math.max(1, qty) } : i) })

  const updateDiscount = (inventoryItemId: string, amt: number) =>
    patchActive({ cart: activeTab.cart.map(i => i.inventoryItemId === inventoryItemId ? { ...i, discountAmount: Math.max(0, amt) } : i) })

  const subtotal       = cart.reduce((s, i) => s + i.unitPrice * i.quantity - i.discountAmount, 0)
  const totalAmount    = Math.max(0, subtotal - discount)
  const itemCount      = cart.length
  const totalQty       = cart.reduce((s, i) => s + i.quantity, 0)
  const totalDiscount  = cart.reduce((s, i) => s + i.discountAmount, 0) + discount

  // Insurance calculations
  const copay          = customer?.copayPercent ?? 100
  const patientAmount  = insuranceEnabled ? Math.round(totalAmount * copay) / 100 : totalAmount
  const insuranceAmount = insuranceEnabled ? totalAmount - patientAmount : 0

  const handleConfirmPayment = (method: 'cash' | 'card' | 'split', cashAmt?: number, cardAmt?: number) => {
    txMut.mutate({
      type:          isReturn ? 'return' : 'sale',
      customerId:    customer?.id,
      items:         cart.map(i => ({
        inventoryItemId: i.inventoryItemId,
        productId:       i.productId,
        productName:     i.productName,
        quantity:        i.quantity,
        unitPrice:       i.unitPrice,
        discountAmount:  i.discountAmount,
      })),
      discountAmount: discount,
      paymentMethod:  method,
      cashAmount:     cashAmt,
      cardAmount:     cardAmt,
    })
  }

  if (shiftLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent" />
      </div>
    )
  }

  if (!shift) {
    return <OpenShiftModal onOpen={(b, n) => openShiftMut.mutate({ b, n })} onBack={() => navigate(-1)} />
  }

  const elapsed     = Math.floor((Date.now() - new Date(shift.openedAt).getTime()) / 60000)
  const elapsedText = elapsed < 60 ? `${elapsed} دقيقة` : `${Math.floor(elapsed / 60)}س ${elapsed % 60}د`
  // Cash in drawer = opening + cash sales only + cash-in movements - cash-out movements
  // Must match CloseShiftModal.systemExpected and shiftPrint.ts expected formula
  const cashBalance = Number(shift.openingBalance) + Number(shift.totalCashSales ?? 0) + Number(shift.totalCashIn ?? 0) - Number(shift.totalCashOut ?? 0)

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden" dir="rtl">
      {/* ── Modals ── */}
      {success !== null && <SuccessFlash amount={success} onDone={() => setSuccess(null)} />}
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      {showClose && (
        <CloseShiftModal
          shift={shift}
          isPending={closeShiftMut.isPending}
          onClose={() => setShowClose(false)}
          onConfirm={(closing, note) => closeShiftMut.mutate({ closing, note })}
        />
      )}
      {showCash && (
        <CashMovementModal
          onSave={(t, a, r, n) => cashMut.mutate({ type: t, amount: a, reason: r, note: n })}
          onClose={() => setShowCash(false)}
        />
      )}
      {paying && (
        <PaymentModal
          total={insuranceEnabled ? patientAmount : totalAmount}
          fullTotal={totalAmount}
          isReturn={isReturn}
          insurance={insuranceEnabled ? { copay, patientAmount, insuranceAmount } : undefined}
          onConfirm={handleConfirmPayment}
          onClose={() => setPaying(false)}
        />
      )}

      {/* ── Status bar ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0">
        {/* Shift status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200">
          <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          <span className="text-teal-700 text-xs font-semibold">{shift.cashierName ?? 'كاشير'}</span>
          <span className="text-teal-400 text-xs">•</span>
          <Clock size={11} className="text-teal-500" />
          <span className="text-teal-600 text-xs tabular-nums">{elapsedText}</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200">
          <Banknote size={13} className="text-gray-500" />
          <span className="text-gray-700 text-xs font-mono tabular-nums">{fmt(cashBalance)}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <TrendingUp size={11} />
          <span className="tabular-nums">{shift.transactionCount} معاملة</span>
          <span>•</span>
          <span className="tabular-nums font-medium text-teal-700">{fmt(Number(shift.totalSales))}</span>
        </div>

        {/* Right controls */}
        <div className="ms-auto flex items-center gap-2">
          {/* Sale / Return toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 border border-gray-200">
            <button
              onClick={() => { setIsReturn(false); patchActive({ cart: [] }) }}
              className={clsx('px-3 py-1.5 rounded-md text-xs font-semibold transition-all', !isReturn ? 'bg-white text-teal-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700')}
            >
              بيع
            </button>
            <button
              onClick={() => { setIsReturn(true); patchActive({ cart: [] }) }}
              className={clsx('flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all', isReturn ? 'bg-white text-amber-600 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700')}
            >
              <RotateCcw size={10} /> استرداد
            </button>
          </div>

          <button onClick={() => setShowCash(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium transition-colors border border-gray-200"
            title="F6">
            <DollarSign size={13} /> حركة نقدية
          </button>

          <button onClick={() => setShowShortcuts(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium transition-colors border border-gray-200">
            <Keyboard size={13} /> ?
          </button>

          <button onClick={() => setShowClose(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium transition-colors border border-red-200">
            <X size={13} /> إغلاق الشفت
          </button>
        </div>
      </div>

      {/* ── Sale tabs ── */}
      <div className="bg-white border-b border-gray-200 px-4 flex items-center gap-1 shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 whitespace-nowrap',
              tab.id === activeTabId
                ? isReturn
                  ? 'border-amber-500 text-amber-700'
                  : 'border-teal-500 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {isReturn && tab.id === activeTabId ? <RotateCcw size={12} /> : null}
            بيعة #{tab.num}
            {tab.cart.length > 0 && (
              <span className={clsx(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                tab.id === activeTabId
                  ? isReturn ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'
                  : 'bg-gray-100 text-gray-500',
              )}>
                {tab.cart.length}
              </span>
            )}
            {tabs.length > 1 && (
              <span
                onClick={e => {
                  e.stopPropagation()
                  const newTabs = tabs.filter(t => t.id !== tab.id)
                  setTabs(newTabs)
                  if (activeTabId === tab.id) setActiveTabId(newTabs[newTabs.length - 1].id)
                }}
                className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              >
                <X size={10} />
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => {
            const t = mkTab()
            setTabs(prev => [...prev, t])
            setActiveTabId(t.id)
          }}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors ms-1 shrink-0"
          title="بيعة جديدة"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* ── Search row ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
        {/* Product search */}
        <div className="relative flex-1">
          <ScanLine size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setQuery(''); setSearchOpen(false) }
            }}
            placeholder="ابحث عن الدواء بالاسم أو امسح الباركود (F10)"
            className={clsx(
              'w-full pr-11 pl-10 py-2.5 rounded-xl border-2 text-sm outline-none transition-all',
              isReturn
                ? 'border-amber-200 focus:border-amber-400 bg-amber-50/30'
                : 'border-gray-200 focus:border-teal-400',
            )}
          />
          {query && (
            <button onClick={() => { setQuery(''); setSearchOpen(false) }}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10">
              <X size={14} />
            </button>
          )}

          {/* ── Dual-tab search dropdown ── */}
          {searchOpen && query.length >= 1 && (
            <div className="absolute top-full right-0 left-0 mt-1.5 bg-white rounded-2xl border border-gray-200 shadow-2xl z-50 overflow-hidden">
              {/* Tabs */}
              <div className="flex items-center border-b border-gray-100 px-3 pt-2">
                <button
                  onClick={() => setSearchTab('mine')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all',
                    searchTab === 'mine' ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600',
                  )}
                >
                  <Boxes size={12} /> مخزوني
                  {products.length > 0 && searchTab === 'mine' && (
                    <span className="bg-teal-100 text-teal-700 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{products.length}</span>
                  )}
                </button>
                <button
                  onClick={() => setSearchTab('aumet')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all',
                    searchTab === 'aumet' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-400 hover:text-gray-600',
                  )}
                >
                  <Store size={12} /> السوق الإلكتروني
                  {(aumetResults?.data ?? []).length > 0 && searchTab === 'aumet' && (
                    <span className="bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{aumetResults!.data.length}</span>
                  )}
                </button>
              </div>

              {/* My Inventory results */}
              {searchTab === 'mine' && (
                <div className="max-h-72 overflow-y-auto">
                  {productsFetching ? (
                    <div className="py-8 flex justify-center">
                      <div className="w-5 h-5 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
                    </div>
                  ) : products.length === 0 ? (
                    <div className="py-10 text-center px-4">
                      <Package size={28} className="text-gray-200 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm font-medium">لا توجد نتائج في مخزونك</p>
                      <p className="text-gray-400 text-xs mt-1">جرّب البحث في متجر أومت</p>
                    </div>
                  ) : products.map((p, idx) => {
                    const warn    = expiryWarning(p.expiryDate)
                    const stock   = stockBadge(p.quantity, p.minThreshold)
                    const inCart  = cart.find(i => i.inventoryItemId === p.inventoryItemId)
                    const noStock = p.quantity <= 0 && !isReturn
                    return (
                      <button
                        key={p.inventoryItemId}
                        disabled={noStock}
                        onClick={() => addToCart(p)}
                        className={clsx(
                          'w-full text-right flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 disabled:opacity-40',
                          idx === 0 && 'bg-teal-50/40',
                        )}
                      >
                        {/* Product icon / thumbnail */}
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                          <Package size={16} className="text-gray-400" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                            {idx === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500 text-white font-bold">Enter ↵</span>}
                            {inCart && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500 text-white font-bold shrink-0">
                                {inCart.quantity} في السلة
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {p.barcode && (
                              <span className="text-gray-400 text-[11px] font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                {p.barcode}
                              </span>
                            )}
                            <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-semibold', stock.cls)}>
                              المخزون: {p.quantity} علبة
                            </span>
                            {warn && (
                              <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5', warn.cls)}>
                                <AlertTriangle size={9} /> {warn.label}
                              </span>
                            )}
                            {p.expiryDate && !warn && (
                              <span className="text-[11px] text-gray-400">
                                ينتهي {new Date(p.expiryDate).toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price + add */}
                        <div className="text-left shrink-0 flex flex-col items-end gap-1.5">
                          <p className="font-black text-gray-900 tabular-nums text-sm">
                            {fmt(p.sellPrice ?? p.costPrice ?? 0)}
                          </p>
                          <div className={clsx(
                            'flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg',
                            noStock ? 'bg-gray-100 text-gray-400' : 'bg-teal-100 text-teal-700',
                          )}>
                            <Plus size={10} /> إضافة
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Aumet marketplace results */}
              {searchTab === 'aumet' && (
                <div className="max-h-72 overflow-y-auto">
                  {aumetFetching ? (
                    <div className="py-8 flex justify-center">
                      <div className="w-5 h-5 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
                    </div>
                  ) : (aumetResults?.data ?? []).length === 0 ? (
                    <div className="py-10 text-center px-4">
                      <Store size={28} className="text-gray-200 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm font-medium">لا توجد نتائج في متجر أومت</p>
                    </div>
                  ) : (aumetResults?.data ?? []).map((item) => {
                    const warn = expiryWarning(item.listing.expiryDate ?? null)
                    const name = item.listing.productNameAr ?? item.listing.productName ?? '—'
                    const sellerName = item.seller.legalName ?? '—'
                    return (
                      <div key={item.listing.id}
                        className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 hover:bg-orange-50/30 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center shrink-0 border border-orange-100">
                          <Store size={14} className="text-orange-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-800 text-sm">{name}</p>
                            {item.listing.listingType === 'clearance' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">تصفية</span>
                            )}
                            {item.listing.listingType === 'emergency' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">طارئ</span>
                            )}
                            {item.listing.discountPct && item.listing.discountPct > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">−{item.listing.discountPct}%</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[11px] text-gray-500 flex items-center gap-0.5">
                              <Store size={9} /> {sellerName}
                              {item.seller.city && ` • ${item.seller.city}`}
                            </span>
                            {item.distanceKm !== undefined && (
                              <span className="text-[11px] text-gray-400">{item.distanceKm.toFixed(1)} كم</span>
                            )}
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-semibold">
                              متاح: {item.listing.quantity} علبة
                            </span>
                            {warn && (
                              <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5', warn.cls)}>
                                <AlertTriangle size={9} /> {warn.label}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          <p className="font-black text-gray-900 tabular-nums text-sm">{fmt(Number(item.listing.price))}</p>
                          <button
                            onClick={() => { setQuery(''); setSearchOpen(false); navigate('/pharmacy/p2p') }}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                          >
                            <ExternalLink size={10} /> طلب من أومت
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  <div className="px-4 py-2.5 border-t border-gray-100 bg-orange-50/40">
                    <p className="text-[11px] text-orange-600 flex items-center gap-1.5">
                      <Store size={10} />
                      منتجات متجر أومت للشراء فقط — اضغط "طلب من أومت" لإنشاء طلب شراء P2P
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Customer selector with insurance badge */}
        <div ref={custRef} className="relative w-80">
          <User size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <div
            className={clsx(
              'flex items-center gap-2 pr-10 pl-3 py-2.5 rounded-xl border-2 bg-white cursor-pointer transition-colors text-sm',
              customer?.copayPercent ? 'border-blue-200 hover:border-blue-300' : 'border-gray-200 hover:border-teal-300',
            )}
            onClick={() => setCustOpen(o => !o)}
          >
            {customer ? (
              <>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-gray-800 truncate text-xs">{customer.name}</span>
                    {customer.copayPercent && (
                      <span className="shrink-0 flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">
                        <Shield size={9} /> تأمين {customer.copayPercent}%
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{customer.phone ?? ''} • {customer.visitCount} زيارة</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); patchActive({ customer: null, insuranceEnabled: false }) }}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                >
                  <X size={13} />
                </button>
              </>
            ) : (
              <span className="flex-1 text-gray-400 text-xs">البحث باسم العميل أو رقم هاتفه</span>
            )}
          </div>

          {custOpen && (
            <div className="absolute top-full right-0 left-0 mt-1.5 bg-white rounded-xl border border-gray-200 shadow-2xl z-50 overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <input
                  autoFocus
                  value={custSearch}
                  onChange={e => setCustSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو رقم الهاتف..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:border-teal-400 outline-none"
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {(customers?.data ?? []).length === 0 && custSearch.length > 0 ? (
                  <p className="px-3 py-4 text-gray-400 text-xs text-center">لا توجد نتائج</p>
                ) : (customers?.data ?? []).map(c => (
                  <button key={c.id} onClick={() => {
                    patchActive({
                      customer: c,
                      insuranceEnabled: !!(c.copayPercent && c.copayPercent > 0),
                    })
                    setCustOpen(false); setCustSearch('')
                  }}
                    className="w-full text-right px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center text-xs text-teal-700 font-bold shrink-0">
                      {c.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                        {c.copayPercent && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center gap-0.5">
                            <Shield size={8} /> {c.copayPercent}%
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400">{c.phone ?? '—'} • {c.visitCount} زيارة</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Cart area ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Action bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0 flex-wrap">
          <button
            onClick={() => patchActive({ cart: [], discount: 0 })}
            disabled={cart.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold transition-colors disabled:opacity-30 border border-red-200"
          >
            <Trash2 size={12} /> إفراغ الكل
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
            <span className="text-xs text-gray-500 font-medium">خصم إضافي</span>
            <span className="text-xs text-gray-400">{currency}</span>
            <input
              type="number"
              value={discount || ''}
              onChange={e => patchActive({ discount: Number(e.target.value) || 0 })}
              className="w-20 text-right text-sm font-semibold bg-transparent outline-none text-gray-800 tabular-nums"
              placeholder="0"
            />
          </div>

          {/* Insurance toggle — only visible when customer has insurance */}
          {customer?.copayPercent && (
            <button
              onClick={() => patchActive({ insuranceEnabled: !insuranceEnabled })}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
                insuranceEnabled
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200'
                  : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
              )}
            >
              {insuranceEnabled ? <Shield size={13} /> : <ShieldOff size={13} />}
              {insuranceEnabled
                ? `التأمين مفعّل — ${customer.copayPercent}% على العميل`
                : `تفعيل التأمين (${customer.copayPercent}%)`
              }
            </button>
          )}

          <div className="ms-auto flex items-center gap-2">
            <span className={clsx(
              'text-xs font-bold px-3 py-1.5 rounded-lg',
              isReturn ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-teal-50 text-teal-700 border border-teal-200',
            )}>
              بيعة #{activeTab.num}
              {isReturn && ' — استرداد'}
            </span>
          </div>
        </div>

        {/* Cart table */}
        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <ShoppingCart size={24} className="text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium">السلة فارغة</p>
              <p className="text-gray-400 text-sm mt-1">ابحث عن دواء لإضافته</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    {['#', 'معلومات المنتج', 'المخزون', 'تاريخ الانتهاء', 'الكمية', 'سعر البيع', 'الخصم', 'الإجمالي', ''].map((h, i, arr) => (
                      <th key={i} className={clsx(
                        'text-right px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap',
                        i === 0 && 'rounded-tr-2xl w-10',
                        i === arr.length - 1 && 'rounded-tl-2xl w-10',
                      )}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, idx) => {
                    const warn  = expiryWarning(item.expiryDate)
                    const stock = stockBadge(item.available, 0)
                    const total = item.unitPrice * item.quantity - item.discountAmount
                    return (
                      <tr key={item.inventoryItemId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors group">
                        {/* # */}
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-mono text-gray-400">{idx + 1}</span>
                        </td>

                        {/* Product info */}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-800">{item.productName}</p>
                          {item.barcode && (
                            <p className="text-[11px] text-gray-400 font-mono">{item.barcode}</p>
                          )}
                          {warn && (
                            <span className={clsx('inline-flex items-center gap-1 text-[10px] font-semibold mt-0.5', warn.cls)}>
                              <AlertTriangle size={8} /> {warn.label}
                            </span>
                          )}
                        </td>

                        {/* Stock */}
                        <td className="px-4 py-3">
                          <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-semibold', stock.cls)}>
                            {stock.label}
                          </span>
                        </td>

                        {/* Expiry */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500">
                            {item.expiryDate
                              ? new Date(item.expiryDate).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </span>
                        </td>

                        {/* Quantity controls */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => item.quantity <= 1 ? removeFromCart(item.inventoryItemId) : updateQty(item.inventoryItemId, item.quantity - 1)}
                              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-red-500 transition-colors"
                            >
                              <Minus size={11} />
                            </button>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e => updateQty(item.inventoryItemId, Number(e.target.value))}
                              className="w-12 text-center font-bold text-gray-800 border border-gray-200 rounded-lg py-1 text-sm outline-none focus:border-teal-400 tabular-nums"
                            />
                            <button
                              onClick={() => updateQty(item.inventoryItemId, item.quantity + 1)}
                              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-teal-50 hover:text-teal-600 transition-colors"
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        </td>

                        {/* Unit price */}
                        <td className="px-4 py-3 tabular-nums font-medium text-gray-700">
                          {fmt(item.unitPrice)}
                        </td>

                        {/* Discount */}
                        <td className="px-4 py-3">
                          <div className="relative w-24">
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">{currency}</span>
                            <input
                              type="number"
                              value={item.discountAmount || ''}
                              onChange={e => updateDiscount(item.inventoryItemId, Number(e.target.value))}
                              className="w-full pr-9 pl-2 py-1.5 rounded-lg border border-gray-200 text-sm text-right tabular-nums outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100"
                              placeholder="0"
                            />
                          </div>
                          {item.discountAmount > 0 && (
                            <p className="text-[10px] text-red-400 mt-0.5 tabular-nums">−{fmt(item.discountAmount)}</p>
                          )}
                        </td>

                        {/* Line total */}
                        <td className="px-4 py-3">
                          <p className={clsx('font-bold tabular-nums', isReturn ? 'text-amber-600' : 'text-gray-900')}>
                            {fmt(total)}
                          </p>
                        </td>

                        {/* Delete */}
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => removeFromCart(item.inventoryItemId)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom summary bar ── */}
      <div className={clsx(
        'bg-white border-t px-4 py-3 flex items-center gap-4 shrink-0',
        isReturn ? 'border-amber-200' : insuranceEnabled ? 'border-blue-200' : 'border-gray-200',
      )}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">ملخص</p>

        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>المنتجات</span>
          <span className="font-bold text-gray-800 tabular-nums">{itemCount}</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>الكمية</span>
          <span className="font-bold text-gray-800 tabular-nums">{totalQty}</span>
        </div>

        {totalDiscount > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">الخصم</span>
            <span className="font-bold text-red-500 tabular-nums">−{fmt(totalDiscount)}</span>
          </div>
        )}

        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>الإجمالي</span>
          <span className="font-bold text-gray-800 tabular-nums">{fmt(subtotal)}</span>
        </div>

        {/* Insurance breakdown */}
        {insuranceEnabled && cart.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200">
            <Shield size={13} className="text-blue-600 shrink-0" />
            <div className="flex items-center gap-3 text-xs">
              <span className="text-blue-700 font-medium">
                العميل يدفع:
                <span className="font-black tabular-nums ms-1">{fmt(patientAmount)}</span>
                <span className="text-blue-400 ms-1">({copay}%)</span>
              </span>
              <span className="text-blue-300">|</span>
              <span className="text-blue-600 font-medium">
                التأمين:
                <span className="font-black tabular-nums ms-1">{fmt(insuranceAmount)}</span>
                <span className="text-blue-400 ms-1">({100 - copay}%)</span>
              </span>
            </div>
          </div>
        )}

        {/* Total + checkout */}
        <div className="flex items-center gap-2 ms-auto">
          <div className="text-right">
            {insuranceEnabled && cart.length > 0 ? (
              <>
                <p className="text-[10px] text-gray-400">يدفعه العميل</p>
                <p className="text-2xl font-black tabular-nums text-blue-700">{fmt(patientAmount)}</p>
              </>
            ) : (
              <>
                <p className="text-[10px] text-gray-400">المجموع</p>
                <p className={clsx('text-2xl font-black tabular-nums', isReturn ? 'text-amber-600' : 'text-gray-900')}>
                  {fmt(totalAmount)}
                </p>
              </>
            )}
          </div>

          <button
            onClick={() => cart.length > 0 && setPaying(true)}
            disabled={cart.length === 0 || txMut.isPending}
            className={clsx(
              'flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg',
              isReturn
                ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                : insuranceEnabled
                ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                : 'bg-teal-600 hover:bg-teal-700 shadow-teal-200',
            )}
          >
            {txMut.isPending
              ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <>
                  {insuranceEnabled ? <Shield size={15} /> : <Zap size={15} />}
                  {isReturn ? 'تأكيد الاسترداد' : insuranceEnabled ? `دفع ${fmt(patientAmount)}` : 'إتمام البيع'}
                  <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">F4</kbd>
                </>}
          </button>
        </div>
      </div>
    </div>
  )
}
