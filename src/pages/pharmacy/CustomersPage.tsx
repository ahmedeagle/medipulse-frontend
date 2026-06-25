import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, UserPlus, Phone, Mail, MapPin, X, Check,
  MoreHorizontal, Pencil, Trash2, Plus, Shield,
  ChevronDown, Building2, CreditCard, FileText,
  History, Banknote, Receipt, ChevronRight, Package,
} from 'lucide-react'
import clsx from 'clsx'
import { posApi, type PosCustomer, type PosInsuranceCompany, type PosTransaction } from '../../api/pos.api'
import Pagination from '../../components/ui/Pagination'
import { useCurrency } from '../../hooks/useCurrency'
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function visitBadge(count: number) {
  if (count === 0) return { label: 'جديد',    cls: 'bg-gray-100 text-gray-500' }
  if (count < 3)  return { label: 'عارض',    cls: 'bg-blue-50 text-blue-600' }
  if (count < 10) return { label: 'منتظم',   cls: 'bg-violet-50 text-violet-700' }
  return               { label: 'متكرر ⭐', cls: 'bg-amber-50 text-amber-700' }
}

function validateCustomer(f: typeof EMPTY_FORM) {
  const e: Record<string, string> = {}
  if (f.name.trim().length < 2) e.name = 'الاسم يجب أن يكون حرفين على الأقل'
  if (f.phone) {
    const d = f.phone.replace(/\D/g, '')
    if (d.length < 10 || d.length > 15) e.phone = 'رقم الهاتف غير صحيح'
  }
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'البريد الإلكتروني غير صحيح'
  if (f.copayPercent && (Number(f.copayPercent) < 0 || Number(f.copayPercent) > 100)) e.copayPercent = 'النسبة يجب أن تكون بين 0 و 100'
  return e
}

const EMPTY_FORM = {
  name: '', phone: '', email: '', gender: '' as '' | 'male' | 'female',
  address: '', tags: '',
  insuranceCompanyId: '', insuranceCardNumber: '', insurancePolicyNumber: '', copayPercent: '',
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
function DeleteCustomerModal({ customer, onClose, onConfirm, isPending }: {
  customer: PosCustomer
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-1.5">حذف العميل</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              هل أنت متأكد من حذف{' '}
              <span className="font-semibold text-gray-800">"{customer.name}"</span>؟
            </p>
            <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">
              سيتم أرشفة بيانات العميل وإخفاؤه من القوائم. تبقى السجلات قابلة للمراجعة من قِبل المسؤول.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 justify-start">
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {isPending
              ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <><Trash2 size={13} /> تأكيد الحذف</>}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row action menu ───────────────────────────────────────────────────────────
function RowMenu({ onEdit, onDelete, onHistory }: { onEdit: () => void; onDelete: () => void; onHistory: () => void }) {
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
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="fixed mt-1 w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[200]"
          style={{
            top:  ref.current ? ref.current.getBoundingClientRect().bottom + 4 : 0,
            left: ref.current ? Math.min(
              ref.current.getBoundingClientRect().left,
              window.innerWidth - 168
            ) : 0,
          }}>
          <button onClick={() => { onHistory(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <History size={13} className="text-emerald-500" /> سجل المشتريات
          </button>
          <button onClick={() => { onEdit(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <Pencil size={13} className="text-gray-400" /> تعديل
          </button>
          <button onClick={() => { onDelete(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 size={13} /> حذف
          </button>
        </div>
      )}
    </div>
  )
}

// ── Customer History Drawer ───────────────────────────────────────────────────
function payBadge(method: string) {
  if (method === 'card')  return { label: 'كارت',  cls: 'bg-blue-50 text-blue-600',    Icon: CreditCard }
  if (method === 'split') return { label: 'مختلط', cls: 'bg-violet-50 text-violet-600', Icon: Receipt }
  return                          { label: 'نقدي',  cls: 'bg-gray-100 text-gray-600',   Icon: Banknote }
}

function CustomerHistoryDrawer({ customer, onClose }: { customer: PosCustomer; onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const PAGE = 15
  const { fmt: fmtEGP } = useCurrency()

  const { data, isLoading } = useQuery({
    queryKey: ['customer-tx', customer.id, page],
    queryFn: () => posApi.getCustomerTransactions(customer.id, PAGE, page * PAGE),
  })

  const txs: PosTransaction[] = data?.data ?? []
  const total: number = data?.total ?? 0

  // close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 start-0 z-[70] w-full max-w-md mx-4 sm:mx-0 bg-white shadow-2xl flex flex-col" dir="rtl">
        {/* Header */}
        <div className="bg-violet-600 px-5 py-4 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {customer.name.trim()[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm">{customer.name}</p>
            <p className="text-violet-100 text-xs">{customer.phone ?? 'بدون هاتف'} · {total} فاتورة</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-gray-100 shrink-0">
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-0.5">إجمالي المشتريات</p>
            <p className="font-bold text-gray-900 text-sm">{fmtEGP(customer.totalPurchases)}</p>
          </div>
          <div className="px-4 py-3 text-center border-x border-gray-100">
            <p className="text-xs text-gray-400 mb-0.5">عدد الزيارات</p>
            <p className="font-bold text-gray-900 text-sm">{customer.visitCount}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-0.5">آخر زيارة</p>
            <p className="font-bold text-gray-900 text-sm">{customer.lastVisitAt ? fmtDate(customer.lastVisitAt) : '—'}</p>
          </div>
        </div>

        {/* Transaction list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : txs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-6">
              <Receipt size={32} className="text-gray-200 mb-3" />
              <p className="font-semibold text-gray-500">لا توجد فواتير مسجلة</p>
              <p className="text-xs text-gray-400 mt-1">لم يتم إجراء أي عمليات شراء بعد</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {txs.map(tx => {
                const isOpen = expanded === tx.id
                const pay = payBadge(tx.paymentMethod)
                const isReturn = tx.type === 'return'
                const isVoided = tx.status === 'voided'
                return (
                  <div key={tx.id}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : tx.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-right"
                    >
                      {/* Icon */}
                      <div className={clsx(
                        'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                        isVoided ? 'bg-gray-100' : isReturn ? 'bg-amber-50' : 'bg-violet-50',
                      )}>
                        {isReturn
                          ? <Receipt size={14} className="text-amber-600" />
                          : <Package size={14} className="text-violet-600" />
                        }
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-mono text-xs text-gray-400">{tx.id.slice(0, 8).toUpperCase()}</span>
                          {isReturn && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-bold">مرتجع</span>}
                          {isVoided && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">ملغي</span>}
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {new Date(tx.createdAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' '}·{' '}
                          {new Date(tx.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Payment badge + total */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={clsx('font-bold text-sm tabular-nums', isVoided ? 'text-gray-400 line-through' : isReturn ? 'text-amber-600' : 'text-gray-900')}>
                          {fmtEGP(tx.totalAmount)}
                        </span>
                        <span className={clsx('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium', pay.cls)}>
                          <pay.Icon size={9} /> {pay.label}
                        </span>
                      </div>

                      <ChevronRight size={14} className={clsx('text-gray-300 transition-transform shrink-0', isOpen && 'rotate-90')} />
                    </button>

                    {/* Expanded items */}
                    {isOpen && (
                      <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
                        <div className="divide-y divide-gray-100 mt-2">
                          {(tx.items ?? []).map(item => (
                            <div key={item.id} className="flex items-center justify-between py-2 text-xs">
                              <span className="text-gray-700 font-medium truncate flex-1">{item.productName}</span>
                              <span className="text-gray-400 mx-2">×{item.quantity}</span>
                              <span className="font-semibold text-gray-800 tabular-nums">{fmtEGP(item.subtotal)}</span>
                            </div>
                          ))}
                        </div>
                        {tx.discountAmount > 0 && (
                          <div className="flex justify-between text-xs pt-2 border-t border-gray-200 mt-1">
                            <span className="text-gray-400">خصم</span>
                            <span className="text-violet-600 font-semibold">−{fmtEGP(tx.discountAmount)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > PAGE && (
          <div className="shrink-0 border-t border-gray-100 px-4 py-3 flex items-center justify-between">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >السابق</button>
            <span className="text-xs text-gray-400">
              {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} من {total}
            </span>
            <button
              disabled={(page + 1) * PAGE >= total}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >التالي</button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Add / Edit Customer Drawer ────────────────────────────────────────────────
function CustomerDrawer({
  initial, onClose, insuranceCompanies,
}: {
  initial?: PosCustomer
  onClose: () => void
  insuranceCompanies: PosInsuranceCompany[]
}) {
  const qc = useQueryClient()
  const isEdit = !!initial

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    ...(initial ? {
      name:                  initial.name,
      phone:                 initial.phone ?? '',
      email:                 initial.email ?? '',
      gender:                (initial.gender ?? '') as '' | 'male' | 'female',
      address:               initial.address ?? '',
      tags:                  initial.tags.join(', '),
      insuranceCompanyId:    initial.insuranceCompanyId ?? '',
      insuranceCardNumber:   initial.insuranceCardNumber ?? '',
      insurancePolicyNumber: initial.insurancePolicyNumber ?? '',
      copayPercent:          initial.copayPercent != null ? String(initial.copayPercent) : '',
    } : {}),
  })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [insSearch, setInsSearch] = useState('')
  const [insOpen, setInsOpen] = useState(false)
  const insRef = useRef<HTMLDivElement>(null)

  const errs   = validateCustomer(form)
  const canSave = Object.keys(errs).length === 0

  const selectedIns = insuranceCompanies.find(ic => ic.id === form.insuranceCompanyId)
  const filteredIns = insuranceCompanies.filter(ic =>
    ic.name.toLowerCase().includes(insSearch.toLowerCase())
  )

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!insRef.current?.contains(e.target as Node)) setInsOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        name:                  form.name.trim(),
        phone:                 form.phone || undefined,
        email:                 form.email || undefined,
        gender:                form.gender || undefined,
        address:               form.address || undefined,
        tags:                  form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        insuranceCompanyId:    form.insuranceCompanyId || undefined,
        insuranceCardNumber:   form.insuranceCardNumber || undefined,
        insurancePolicyNumber: form.insurancePolicyNumber || undefined,
        copayPercent:          form.copayPercent ? Number(form.copayPercent) : undefined,
      }
      return isEdit
        ? posApi.updateCustomer(initial!.id, payload)
        : posApi.createCustomer(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-customers'] })
      onClose()
    },
  })

  const set   = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }))

  const fieldCls = (k: string) => clsx(
    'w-full px-3 py-2.5 rounded-xl border text-sm focus:ring-2 outline-none transition-colors',
    touched[k] && errs[k]
      ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
      : 'border-gray-200 focus:border-violet-400 focus:ring-violet-100',
  )

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative ms-auto w-full max-w-[480px] h-full bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <UserPlus size={15} className="text-emerald-700" />
            </div>
            <h2 className="font-bold text-gray-900">{isEdit ? 'تعديل بيانات العميل' : 'عميل جديد'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Basic info ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">البيانات الأساسية</p>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">الاسم الكامل *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} onBlur={() => touch('name')}
                autoFocus className={fieldCls('name')} placeholder="اسم العميل" />
              {touched.name && errs.name && <p className="text-red-500 text-[11px] mt-1">{errs.name}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">رقم الهاتف</label>
                <div className="relative">
                  <Phone size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} onBlur={() => touch('phone')}
                    className={clsx(fieldCls('phone'), 'pr-9')} placeholder="01XXXXXXXXX" />
                </div>
                {touched.phone && errs.phone && <p className="text-red-500 text-[11px] mt-1">{errs.phone}</p>}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">الجنس</label>
                <select value={form.gender} onChange={e => set('gender', e.target.value)}
                  className={fieldCls('gender')}>
                  <option value="">غير محدد</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">البريد الإلكتروني</label>
              <div className="relative">
                <Mail size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={form.email} onChange={e => set('email', e.target.value)} onBlur={() => touch('email')}
                  className={clsx(fieldCls('email'), 'pr-9')} placeholder="example@email.com" />
              </div>
              {touched.email && errs.email && <p className="text-red-500 text-[11px] mt-1">{errs.email}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">العنوان</label>
              <div className="relative">
                <MapPin size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={form.address} onChange={e => set('address', e.target.value)}
                  className={clsx(fieldCls('address'), 'pr-9')} placeholder="العنوان" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">التصنيفات (مفصولة بفاصلة)</label>
              <input value={form.tags} onChange={e => set('tags', e.target.value)}
                className={fieldCls('tags')} placeholder="VIP, مزمن, كبار السن..." />
            </div>
          </div>

          {/* ── Insurance ── */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <Shield size={13} className="text-violet-600" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">بيانات التأمين (اختياري)</p>
            </div>

            {/* Insurance company search dropdown */}
            <div ref={insRef}>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">شركة التأمين</label>
              <div className="relative">
                <button type="button" onClick={() => setInsOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-right hover:border-violet-300 transition-colors bg-white">
                  <span className={selectedIns ? 'text-gray-900' : 'text-gray-400'}>
                    {selectedIns ? selectedIns.name : 'اختر شركة التأمين...'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {selectedIns && (
                      <span className="text-[10px] text-violet-600 font-semibold bg-violet-50 px-1.5 py-0.5 rounded-full">
                        المريض {selectedIns.patientPercent}%
                      </span>
                    )}
                    <ChevronDown size={13} className={clsx('text-gray-400 transition-transform', insOpen && 'rotate-180')} />
                  </div>
                </button>
                {insOpen && (
                  <div className="absolute top-full right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-52 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100">
                      <div className="relative">
                        <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={insSearch} onChange={e => setInsSearch(e.target.value)}
                          className="w-full pr-8 pl-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:border-violet-400 focus:ring-1 focus:ring-violet-100 outline-none"
                          placeholder="ابحث عن شركة..." autoFocus />
                      </div>
                    </div>
                    <div className="overflow-y-auto">
                      {form.insuranceCompanyId && (
                        <button onClick={() => { set('insuranceCompanyId', ''); setInsOpen(false) }}
                          className="w-full text-right px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                          × إزالة التأمين
                        </button>
                      )}
                      {filteredIns.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-gray-400 text-center">لا توجد نتائج</p>
                      ) : filteredIns.map(ic => (
                        <button key={ic.id} onClick={() => { set('insuranceCompanyId', ic.id); setInsOpen(false) }}
                          className={clsx('w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-violet-50 transition-colors',
                            form.insuranceCompanyId === ic.id ? 'bg-violet-50 text-violet-700' : 'text-gray-700')}>
                          <span>{ic.name}</span>
                          <span className="text-xs text-gray-400">المريض {ic.patientPercent}% / التأمين {100 - ic.patientPercent}%</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {selectedIns && (
                <p className="text-[11px] text-violet-600 mt-1 flex items-center gap-1">
                  <Shield size={10} />
                  يتحمل المريض {selectedIns.patientPercent}٪ وتغطي {selectedIns.name} {100 - Number(selectedIns.patientPercent)}٪ من الفاتورة
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">رقم بطاقة التأمين</label>
                <div className="relative">
                  <CreditCard size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={form.insuranceCardNumber} onChange={e => set('insuranceCardNumber', e.target.value)}
                    className={clsx(fieldCls('insuranceCardNumber'), 'pr-9')} placeholder="رقم البطاقة" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">رقم الوثيقة</label>
                <div className="relative">
                  <FileText size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={form.insurancePolicyNumber} onChange={e => set('insurancePolicyNumber', e.target.value)}
                    className={clsx(fieldCls('insurancePolicyNumber'), 'pr-9')} placeholder="رقم الوثيقة" />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                نسبة تحمل المريض (%) — تجاوز نسبة شركة التأمين
              </label>
              <input type="number" min="0" max="100" step="0.01"
                value={form.copayPercent} onChange={e => set('copayPercent', e.target.value)} onBlur={() => touch('copayPercent')}
                className={fieldCls('copayPercent')} placeholder="مثال: 20 (المريض يدفع 20٪ والتأمين 80٪)" />
              {touched.copayPercent && errs.copayPercent && <p className="text-red-500 text-[11px] mt-1">{errs.copayPercent}</p>}
              <p className="text-[11px] text-gray-400 mt-1">اتركه فارغاً لاستخدام نسبة شركة التأمين الافتراضية</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          {mut.isError && (
            <p className="text-red-500 text-xs mb-3 text-center">
              {(mut.error as any)?.response?.data?.message ?? 'حدث خطأ، حاول مجدداً'}
            </p>
          )}
          <button
            onClick={() => { setTouched({ name: true, phone: true, email: true, copayPercent: true }); if (canSave) mut.mutate() }}
            disabled={!canSave || mut.isPending}
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
          >
            {mut.isPending
              ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <><Check size={15} /> {isEdit ? 'حفظ التعديلات' : 'حفظ العميل'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Insurance Companies Modal ─────────────────────────────────────────────────
function InsuranceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [adding, setAdding]   = useState(false)
  const [editing, setEditing] = useState<PosInsuranceCompany | null>(null)
  const [form, setForm]       = useState({ name: '', patientPercent: '20', notes: '' })
  const [errs, setErrs]       = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['pos-insurance', search],
    queryFn:  () => posApi.listInsuranceCompanies(search || undefined, 100, 0),
  })
  const companies = data?.data ?? []

  const createMut = useMutation({
    mutationFn: () => posApi.createInsuranceCompany({ name: form.name.trim(), patientPercent: Number(form.patientPercent), notes: form.notes || undefined }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['pos-insurance'] }); setAdding(false); setForm({ name: '', patientPercent: '20', notes: '' }) },
  })
  const updateMut = useMutation({
    mutationFn: () => posApi.updateInsuranceCompany(editing!.id, { name: form.name.trim(), patientPercent: Number(form.patientPercent), notes: form.notes || undefined }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['pos-insurance'] }); setEditing(null) },
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => posApi.deleteInsuranceCompany(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['pos-insurance'] }),
  })

  function openEdit(ic: PosInsuranceCompany) {
    setEditing(ic)
    setForm({ name: ic.name, patientPercent: String(ic.patientPercent), notes: ic.notes ?? '' })
    setAdding(false)
  }

  function openAdd() {
    setAdding(true)
    setEditing(null)
    setForm({ name: '', patientPercent: '20', notes: '' })
  }

  function validateForm() {
    const e: Record<string, string> = {}
    if (form.name.trim().length < 2) e.name = 'الاسم يجب أن يكون حرفين على الأقل'
    const p = Number(form.patientPercent)
    if (isNaN(p) || p < 0 || p > 100) e.patientPercent = 'النسبة يجب أن تكون بين 0 و 100'
    setErrs(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit() {
    if (!validateForm()) return
    editing ? updateMut.mutate() : createMut.mutate()
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Building2 size={15} className="text-emerald-700" />
            </div>
            <h2 className="font-bold text-gray-900">شركات التأمين</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Search + add button */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
                placeholder="ابحث عن شركة تأمين..." />
            </div>
            <button onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors">
              <Plus size={14} /> إضافة جديدة
            </button>
          </div>

          {/* Add / Edit form */}
          {(adding || editing) && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-bold text-violet-800">{editing ? 'تعديل شركة التأمين' : 'إضافة شركة تأمين جديدة'}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">اسم شركة التأمين *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none bg-white"
                    placeholder="أدخل اسم الشركة" autoFocus />
                  {errs.name && <p className="text-red-500 text-[11px] mt-1">{errs.name}</p>}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                    نسبة تحمل المريض (%) *
                  </label>
                  <input type="number" min="0" max="100" step="0.01"
                    value={form.patientPercent} onChange={e => setForm(f => ({ ...f, patientPercent: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none bg-white"
                    placeholder="20" />
                  {errs.patientPercent && <p className="text-red-500 text-[11px] mt-1">{errs.patientPercent}</p>}
                  {form.patientPercent && !isNaN(Number(form.patientPercent)) && (
                    <p className="text-[11px] text-violet-600 mt-1">
                      المريض يدفع {form.patientPercent}٪ وتغطي الشركة {100 - Number(form.patientPercent)}٪
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">ملاحظات</label>
                  <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none bg-white"
                    placeholder="ملاحظات اختيارية" />
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => { setAdding(false); setEditing(null) }}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  إلغاء
                </button>
                <button onClick={handleSubmit} disabled={isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
                  {isPending
                    ? <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    : <><Check size={13} /> {editing ? 'حفظ التعديلات' : 'إضافة'}</>}
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">اسم شركة التأمين</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">نسبة المريض</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">تغطية التأمين</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">ملاحظات</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="py-10 text-center text-gray-400">
                    <div className="w-5 h-5 rounded-full border-2 border-violet-400 border-t-transparent animate-spin mx-auto" />
                  </td></tr>
                ) : companies.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center">
                    <Building2 size={28} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">لا توجد شركات تأمين مسجلة</p>
                  </td></tr>
                ) : companies.map(ic => (
                  <tr key={ic.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{ic.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                        {ic.patientPercent}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-xs font-semibold">
                        {100 - Number(ic.patientPercent)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{ic.notes ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(ic)} className="p-1.5 rounded-lg hover:bg-violet-50 text-gray-400 hover:text-violet-600 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteMut.mutate(ic.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25

export default function CustomersPage() {
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(1)
  const { fmt: fmtEGP } = useCurrency()
  const [showAdd,     setShowAdd]     = useState(false)
  const [editing,     setEditing]     = useState<PosCustomer | null>(null)
  const [showIns,     setShowIns]     = useState(false)
  const [deleting,    setDeleting]    = useState<PosCustomer | null>(null)
  const [historyCustomer, setHistoryCustomer] = useState<PosCustomer | null>(null)

  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ['pos-customers', search, page],
    queryFn: () => posApi.listCustomers(search || undefined, PAGE_SIZE, offset),
    staleTime: 30_000,
    placeholderData: prev => prev,
  })

  const { data: insData } = useQuery({
    queryKey: ['pos-insurance'],
    queryFn: () => posApi.listInsuranceCompanies(undefined, 200, 0),
    staleTime: 60_000,
  })

  const qc = useQueryClient()

  const deleteMut = useMutation({
    mutationFn: (id: string) => posApi.deleteCustomer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-customers'] })
      setDeleting(null)
    },
  })

  const customers      = data?.data ?? []
  const total          = data?.total ?? 0
  const totalPages     = Math.ceil(total / PAGE_SIZE)
  const insuranceMap   = Object.fromEntries((insData?.data ?? []).map(ic => [ic.id, ic]))
  const insuranceList  = insData?.data ?? []

  // Stats
  const newThisMonth = customers.filter(c => {
    const d = new Date(c.createdAt); const n = new Date()
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
  }).length
  const loyal  = customers.filter(c => c.visitCount >= 5).length

  const STATS = [
    { label: 'إجمالي العملاء',          sub: 'الحسابات النشطة للعملاء',       val: total        },
    { label: 'العملاء الجدد هذا الشهر', sub: 'المضافون في الشهر الحالي',      val: newThisMonth },
    { label: 'المشترون الدائمون',        sub: 'العملاء الذين لديهم +5 زيارات', val: loyal        },
  ]

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Modals */}
      {(showAdd || editing) && (
        <CustomerDrawer
          initial={editing ?? undefined}
          insuranceCompanies={insuranceList}
          onClose={() => { setShowAdd(false); setEditing(null) }}
        />
      )}
      {showIns && <InsuranceModal onClose={() => setShowIns(false)} />}
      {deleting && (
        <DeleteCustomerModal
          customer={deleting}
          isPending={deleteMut.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteMut.mutate(deleting.id)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">العملاء</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {total > 0 ? `عرض ${total.toLocaleString('ar-EG')} عميل` : 'قائمة عملاء نقطة البيع'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowIns(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm font-medium transition-colors">
            <Building2 size={14} /> إضافة شركة تأمين جديدة
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors">
            <UserPlus size={14} /> إضافة عميل جديد
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {STATS.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">{s.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 tabular-nums shrink-0">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="ابحث باسم العميل أو رقم الهاتف أو الرمز..."
            className="w-full pr-11 pl-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-emerald-400 outline-none text-sm transition-all" />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1) }}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              {[
                'رمز العميل', 'اسم العميل', 'الهاتف',
                'التأمين', 'تصنيفات', 'الجنس',
                'إجمالي المشتريات', 'آخر زيارة', 'الإجراءات',
              ].map((h, i, arr) => (
                <th key={h} className={clsx(
                  'text-right px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap bg-gray-50/80',
                  i === 0 && 'rounded-tr-2xl',
                  i === arr.length - 1 && 'rounded-tl-2xl',
                )}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {[...Array(9)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <UserPlus size={22} className="text-gray-300" />
                  </div>
                  <p className="text-gray-500 font-medium">
                    {search ? `لا توجد نتائج لـ "${search}"` : 'لا يوجد عملاء مسجلون بعد'}
                  </p>
                  {!search && (
                    <button onClick={() => setShowAdd(true)}
                      className="mt-3 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors">
                      أضف أول عميل
                    </button>
                  )}
                </td>
              </tr>
            ) : customers.map((c, idx) => {
              const freq = visitBadge(c.visitCount)
              const ins  = c.insuranceCompanyId ? insuranceMap[c.insuranceCompanyId] : null
              const code = `#${String(offset + idx + 1).padStart(3, '0')}`
              return (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors group">
                  {/* رمز العميل */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">{code}</span>
                  </td>

                  {/* الاسم */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-xs shrink-0">
                        {c.name.trim()[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{c.name}</p>
                        {c.email && <p className="text-[11px] text-gray-400">{c.email}</p>}
                      </div>
                    </div>
                  </td>

                  {/* الهاتف */}
                  <td className="px-4 py-3 text-gray-600 text-sm font-mono">{c.phone ?? '—'}</td>

                  {/* التأمين */}
                  <td className="px-4 py-3">
                    {ins ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-700">{ins.name}</p>
                        <p className="text-[10px] text-violet-600">المريض {c.copayPercent ?? ins.patientPercent}%</p>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>

                  {/* تصنيفات */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {c.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">
                          {tag}
                        </span>
                      ))}
                      {c.tags.length > 2 && (
                        <span className="text-[10px] text-gray-400">+{c.tags.length - 2}</span>
                      )}
                      <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-semibold', freq.cls)}>
                        {freq.label}
                      </span>
                    </div>
                  </td>

                  {/* الجنس */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">
                      {c.gender === 'male' ? 'ذكر' : c.gender === 'female' ? 'أنثى' : '—'}
                    </span>
                  </td>

                  {/* إجمالي المشتريات */}
                  <td className="px-4 py-3 font-semibold text-gray-900">{fmtEGP(c.totalPurchases)}</td>

                  {/* آخر زيارة */}
                  <td className="px-4 py-3 text-gray-500 text-sm">{fmtDate(c.lastVisitAt)}</td>

                  {/* الإجراءات */}
                  <td className="px-4 py-3">
                    <RowMenu onEdit={() => setEditing(c)} onDelete={() => setDeleting(c)} onHistory={() => setHistoryCustomer(c)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination — always visible when there are records */}
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

      {/* Customer history drawer */}
      {historyCustomer && (
        <CustomerHistoryDrawer
          customer={historyCustomer}
          onClose={() => setHistoryCustomer(null)}
        />
      )}
    </div>
  )
}

