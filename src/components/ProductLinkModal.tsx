import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, Search, CheckCircle2, Link2, Link2Off, Loader2,
  Barcode, Building2, Pill, FlaskConical, AlertCircle, Send,
  ShieldCheck, X, ChevronRight,
} from 'lucide-react'
import { Modal } from './ui/Modal'
import { inventoryApi } from '../api/inventory.api'
import { catalogRequestsApi } from '../api/catalog-requests.api'
import type { InventoryItem, Product } from '../types'

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface MatchCandidate {
  productId: string
  product: Product
  score: number
  signals: string[]
  reasons: string[]
}

interface ProductLinkModalProps {
  item: InventoryItem
  isOpen: boolean
  onClose: () => void
  onSuccess?: (msg: string) => void
}

/* ── Signal chip metadata (icon + Arabic label + color) ────────────────────── */
const SIGNAL_META: Record<string, { label: string; cls: string; Icon: any }> = {
  barcode_exact:      { label: 'باركود متطابق',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: Barcode },
  name_exact:         { label: 'اسم متطابق',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  name_strong:        { label: 'اسم مشابه جدًا',     cls: 'bg-blue-50 text-blue-700 border-blue-200',         Icon: Sparkles },
  name_partial:       { label: 'تشابه جزئي',         cls: 'bg-amber-50 text-amber-700 border-amber-200',      Icon: Sparkles },
  manufacturer_match: { label: 'نفس المُصنّع',       cls: 'bg-purple-50 text-purple-700 border-purple-200',   Icon: Building2 },
  strength_match:     { label: 'تركيز متطابق',      cls: 'bg-cyan-50 text-cyan-700 border-cyan-200',         Icon: FlaskConical },
  dosage_form_match:  { label: 'شكل صيدلاني متطابق', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',   Icon: Pill },
}

function SignalChip({ signal }: { signal: string }) {
  const m = SIGNAL_META[signal] ?? { label: signal, cls: 'bg-gray-50 text-gray-600 border-gray-200', Icon: Sparkles }
  const Icon = m.Icon
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${m.cls}`}>
      <Icon size={10} /> {m.label}
    </span>
  )
}

/* ── Score ring (visual confidence) ────────────────────────────────────────── */
function ScoreRing({ score }: { score: number }) {
  const r = 18, c = 2 * Math.PI * r
  const dash = (score / 100) * c
  const tier = score >= 90 ? 'emerald' : score >= 70 ? 'blue' : score >= 50 ? 'amber' : 'gray'
  const stroke = { emerald: '#10b981', blue: '#3b82f6', amber: '#f59e0b', gray: '#9ca3af' }[tier]
  const text   = { emerald: 'text-emerald-700', blue: 'text-blue-700', amber: 'text-amber-700', gray: 'text-gray-600' }[tier]
  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg width={48} height={48} className="-rotate-90">
        <circle cx={24} cy={24} r={r} stroke="#f3f4f6" strokeWidth={4} fill="none" />
        <circle cx={24} cy={24} r={r} stroke={stroke} strokeWidth={4} strokeLinecap="round" fill="none"
          strokeDasharray={`${dash} ${c - dash}`} className="transition-all duration-500" />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${text}`}>
        {Math.round(score)}
      </div>
    </div>
  )
}

/* ── Confidence verdict line ───────────────────────────────────────────────── */
function ConfidenceVerdict({ score }: { score: number }) {
  if (score >= 90) return <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold"><ShieldCheck size={12} /> ثقة عالية جدًا — موصى به</span>
  if (score >= 75) return <span className="inline-flex items-center gap-1 text-xs text-blue-700 font-semibold"><Sparkles size={12} /> ثقة جيدة</span>
  if (score >= 55) return <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-semibold"><AlertCircle size={12} /> ثقة متوسطة — راجع البيانات</span>
  return <span className="inline-flex items-center gap-1 text-xs text-gray-500"><AlertCircle size={12} /> ثقة منخفضة</span>
}

/* ── Main modal ────────────────────────────────────────────────────────────── */
export function ProductLinkModal({ item, isOpen, onClose, onSuccess }: ProductLinkModalProps) {
  const qc = useQueryClient()

  // Editable search profile — pre-filled from item, refines AI suggestions
  const [profile, setProfile] = useState({
    name:         item.product?.name        || '',
    nameAr:       (item.product as any)?.nameAr || '',
    barcode:      item.product?.barcode     || '',
    manufacturer: (item.product as any)?.manufacturer || '',
    strength:     (item.product as any)?.strength     || '',
    dosageForm:   (item.product as any)?.dosageForm   || '',
  })
  const [selected, setSelected]       = useState<MatchCandidate | null>(null)
  const [requestNote, setRequestNote] = useState('')
  const [showRequest, setShowRequest] = useState(false)
  const [error, setError]             = useState<string | null>(null)

  // Reset state when item changes
  useEffect(() => {
    if (!isOpen) return
    setProfile({
      name:         item.product?.name        || '',
      nameAr:       (item.product as any)?.nameAr || '',
      barcode:      item.product?.barcode     || '',
      manufacturer: (item.product as any)?.manufacturer || '',
      strength:     (item.product as any)?.strength     || '',
      dosageForm:   (item.product as any)?.dosageForm   || '',
    })
    setSelected(null); setRequestNote(''); setShowRequest(false); setError(null)
  }, [isOpen, item.id])

  // Debounced fetch — re-runs when any profile field changes
  const profileKey = useMemo(() => JSON.stringify(profile), [profile])
  const { data: candidates = [], isFetching } = useQuery({
    queryKey: ['match-candidates', item.id, profileKey],
    queryFn: () => inventoryApi.matchCandidates(item.id, { ...profile, limit: 10 }).then(r => r.data),
    enabled: isOpen,
    staleTime: 5_000,
  })

  // Auto-pre-select the top candidate so the user can confirm with one click
  useEffect(() => {
    if (!selected && candidates.length > 0) setSelected(candidates[0])
  }, [candidates, selected])

  // Mutations
  const linkMut = useMutation({
    mutationFn: (c: MatchCandidate) =>
      inventoryApi.linkToProduct(item.id, {
        productId: c.productId,
        score:     c.score,
        signals:   c.signals,
        reasons:   c.reasons,
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      onSuccess?.('تم ربط المنتج بالكتالوج المركزي بنجاح')
      onClose()
    },
    onError: (e: any) => setError(e?.response?.data?.message || 'تعذّر ربط المنتج'),
  })

  const unlinkMut = useMutation({
    mutationFn: () => inventoryApi.unlinkFromCatalog(item.id, 'user_unlinked_from_modal').then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      onSuccess?.('تم إلغاء ربط المنتج')
      onClose()
    },
  })

  const requestMut = useMutation({
    mutationFn: () => catalogRequestsApi.create({
      inventoryItemId: item.id,
      type: 'add',
      name:         profile.name         || undefined,
      nameAr:       profile.nameAr       || undefined,
      barcode:      profile.barcode      || undefined,
      manufacturer: profile.manufacturer || undefined,
      strength:     profile.strength     || undefined,
      dosageForm:   profile.dosageForm   || undefined,
      notes:        requestNote          || undefined,
    }).then(r => r.data),
    onSuccess: (req: any) => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['catalog-requests'] })
      onSuccess?.(`تم إرسال طلب المراجعة — رقم التتبّع: ${req.trackingNumber}`)
      onClose()
    },
    onError: (e: any) => setError(e?.response?.data?.message || 'تعذّر إرسال الطلب'),
  })

  const F = (k: keyof typeof profile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setProfile(p => ({ ...p, [k]: e.target.value }))

  const isLinked = item.linkStatus === 'linked'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="xl">
      {/* Custom header (replaces default Modal title for richer layout) */}
      <div className="flex items-start justify-between -mt-2 mb-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl shadow-md">
            <Link2 size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {item.linkStatus === 'linked' ? 'إدارة ربط المنتج بالكتالوج' : 'ربط المنتج بالكتالوج المركزي'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {item.linkStatus === 'linked'
                ? 'مربوط بالكتالوج · يمكنك مراجعة الربط الحالي أو تغييره'
                : 'مدعوم بالذكاء الاصطناعي · ترشيحات مبنية على عدة إشارات'}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
          <X size={18} />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex gap-2 text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* ── Left rail: current item & search profile ─────────────────────── */}
        <aside className="col-span-12 lg:col-span-4 space-y-3">
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">منتج المخزون</p>
            <p className="font-bold text-gray-900 text-sm leading-tight">{item.product?.name || '—'}</p>
            {(item.product as any)?.nameAr && (
              <p className="text-sm text-gray-600 mt-0.5">{(item.product as any).nameAr}</p>
            )}
            <div className="mt-3 space-y-1 text-[11px] text-gray-500">
              {item.product?.barcode && <p className="flex items-center gap-1.5"><Barcode size={11} /> {item.product.barcode}</p>}
              {(item.product as any)?.manufacturer && <p className="flex items-center gap-1.5"><Building2 size={11} /> {(item.product as any).manufacturer}</p>}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-[11px] text-gray-500">الحالة الحالية</p>
              <p className="mt-1">
                {isLinked ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <Link2 size={12} /> مربوط · ثقة {Math.round(item.matchScore || 0)}٪
                  </span>
                ) : item.linkStatus === 'suggested' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                    <Sparkles size={12} /> اقتراح بانتظار التأكيد
                  </span>
                ) : item.linkStatus === 'pending' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700">
                    <Loader2 size={12} className="animate-spin" /> طلب مراجعة قيد التنفيذ
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
                    <Link2Off size={12} /> غير مربوط
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-gray-200">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">حسّن البحث</p>
            <div className="space-y-2.5">
              <input value={profile.name}    onChange={F('name')}    placeholder="الاسم بالإنجليزية" dir="ltr" className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <input value={profile.nameAr}  onChange={F('nameAr')}  placeholder="الاسم بالعربية"   className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <input value={profile.barcode} onChange={F('barcode')} placeholder="الباركود"        dir="ltr" className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <input value={profile.manufacturer} onChange={F('manufacturer')} placeholder="المُصنّع" className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <div className="grid grid-cols-2 gap-2">
                <input value={profile.strength}   onChange={F('strength')}   placeholder="التركيز" dir="ltr" className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <input value={profile.dosageForm} onChange={F('dosageForm')} placeholder="الشكل" className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
          </div>

          {isLinked && (
            <button
              onClick={() => unlinkMut.mutate()}
              disabled={unlinkMut.isPending}
              className="w-full text-xs font-semibold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 rounded-xl py-2 transition-colors flex items-center justify-center gap-1.5">
              <Link2Off size={13} /> إلغاء الربط الحالي
            </button>
          )}
        </aside>

        {/* ── Right pane: candidates ──────────────────────────────────────── */}
        <section className="col-span-12 lg:col-span-8">
          {/* Currently-linked product card — shown before alternatives so user always sees their link */}
          {isLinked && item.product && (
            <div className="mb-4 p-3.5 rounded-xl border-2 border-emerald-300 bg-emerald-50/60">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                <p className="text-xs font-bold text-emerald-800 flex-1">مربوط حالياً بالكتالوج المركزي</p>
                <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-100 px-2 py-0.5 rounded-full">
                  ثقة {Math.round(item.matchScore || 0)}٪
                </span>
              </div>
              <p className="font-semibold text-gray-900 text-sm">{item.product.name}</p>
              {(item.product as any)?.nameAr && (
                <p className="text-xs text-gray-600 mt-0.5">{(item.product as any).nameAr}</p>
              )}
              <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
                {item.product.barcode && (
                  <span dir="ltr" className="flex items-center gap-1"><Barcode size={10} />{item.product.barcode}</span>
                )}
                {(item.product as any)?.manufacturer && (
                  <span className="flex items-center gap-1"><Building2 size={10} />{(item.product as any).manufacturer}</span>
                )}
                {(item.product as any)?.strength && (
                  <span className="flex items-center gap-1"><FlaskConical size={10} />{(item.product as any).strength}</span>
                )}
              </div>
            </div>
          )}

          {/* Human-in-the-loop banner */}
          {candidates.length > 0 && (
            <div className="mb-3 p-3 rounded-xl bg-gradient-to-r from-violet-50 via-blue-50 to-teal-50 border border-violet-200 flex items-start gap-3">
              <div className="p-1.5 bg-white rounded-lg shadow-sm shrink-0">
                <Sparkles size={14} className="text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900">مراجعة بشرية مطلوبة</p>
                <p className="text-[11px] text-gray-600 leading-relaxed mt-0.5">
                  حلل الذكاء الاصطناعي بيانات المنتج ورتّب أقوى المطابقات بناءً على الباركود والاسم والمصنّع والتركيز.
                  أعلى نتيجة محددة تلقائيًا — راجعها واضغط <span className="font-bold text-teal-700">تأكيد الربط</span>،
                  أو اختر بديلاً، أو أرسل طلب مراجعة.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Sparkles size={14} className="text-teal-600" />
              {isLinked ? 'بدائل متاحة في الكتالوج' : 'ترشيحات الذكاء الاصطناعي'}
              {isFetching && <Loader2 size={13} className="animate-spin text-gray-400" />}
            </h3>
            <span className="text-xs text-gray-400">{candidates.length} نتيجة</span>
          </div>

          {!isFetching && candidates.length === 0 ? (
            isLinked ? (
              <div className="text-center py-10 px-6 bg-gradient-to-b from-emerald-50 to-white border-2 border-dashed border-emerald-200 rounded-2xl">
                <CheckCircle2 size={28} className="mx-auto mb-3 text-emerald-500" />
                <p className="font-bold text-gray-900 mb-1">لا توجد بدائل أخرى في الكتالوج</p>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  ربطك الحالي هو أفضل تطابق متاح. يمكنك تعديل بيانات البحث لإعادة المحاولة، أو إلغاء الربط إن كان غير صحيح.
                </p>
              </div>
            ) : (
            <div className="text-center py-12 px-6 bg-gradient-to-b from-amber-50 to-white border-2 border-dashed border-amber-200 rounded-2xl">
              <Search size={28} className="mx-auto mb-3 text-amber-500" />
              <p className="font-bold text-gray-900 mb-1">لم نجد ترشيحات تلقائية</p>
              <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">
                جرّب تعديل بيانات البحث على اليمين، أو أرسل طلب مراجعة لفريق الكتالوج لإضافة هذا المنتج.
              </p>
              <button
                onClick={() => setShowRequest(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl">
                <Send size={12} /> إرسال طلب مراجعة
              </button>
            </div>
            )
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pe-1">
              {candidates.map((c: MatchCandidate, idx: number) => {
                const isSelected = selected?.productId === c.productId
                const isTop = idx === 0
                return (
                  <button
                    key={c.productId}
                    onClick={() => setSelected(c)}
                    className={`w-full text-start p-3.5 rounded-xl border-2 transition-all hover:shadow-md ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/50 shadow-sm ring-2 ring-teal-200'
                        : 'border-gray-200 bg-white hover:border-teal-300'
                    }`}>
                    <div className="flex items-start gap-3">
                      {/* Radio indicator */}
                      <div className={`mt-1.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                        isSelected ? 'border-teal-600 bg-teal-600' : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <ScoreRing score={c.score} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-gray-900 text-sm truncate">{c.product.name}</p>
                              {isTop && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                                  <Sparkles size={9} /> الأفضل
                                </span>
                              )}
                            </div>
                            {(c.product as any).nameAr && (
                              <p className="text-xs text-gray-600 truncate">{(c.product as any).nameAr}</p>
                            )}
                          </div>
                          <ChevronRight size={14} className={`shrink-0 mt-1 ${isSelected ? 'text-teal-600' : 'text-gray-300'}`} />
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {c.signals.map((s: string) => <SignalChip key={s} signal={s} />)}
                        </div>

                        <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
                          {c.product.barcode && <span className="flex items-center gap-1" dir="ltr"><Barcode size={10} /> {c.product.barcode}</span>}
                          {(c.product as any).manufacturer && <span className="flex items-center gap-1"><Building2 size={10} /> {(c.product as any).manufacturer}</span>}
                          {(c.product as any).strength && <span className="flex items-center gap-1"><FlaskConical size={10} /> {(c.product as any).strength}</span>}
                        </div>

                        <div className="mt-2"><ConfidenceVerdict score={c.score} /></div>
                      </div>
                    </div>
                  </button>
                )
              })}

              {/* Inline "request review" CTA */}
              {!showRequest && (
                <button
                  onClick={() => setShowRequest(true)}
                  className="w-full p-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/40 text-amber-700 hover:bg-amber-50 hover:border-amber-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors">
                  <Send size={13} /> لا تجد المنتج الصحيح؟ أرسل طلب مراجعة لفريق الكتالوج
                </button>
              )}
            </div>
          )}

          {/* ── Inline request panel ──────────────────────────────────────── */}
          {showRequest && (
            <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                  <Send size={14} /> إرسال طلب مراجعة
                </p>
                <button onClick={() => setShowRequest(false)} className="text-amber-600 hover:text-amber-800">
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-amber-800 mb-3 leading-relaxed">
                سيُنشئ النظام رقم تتبّع رسمي ويُرسل بياناتك (الاسم، الباركود، المُصنّع، التركيز) إلى فريق الكتالوج للمراجعة.
              </p>
              <textarea
                value={requestNote} onChange={(e) => setRequestNote(e.target.value)}
                placeholder="ملاحظة اختيارية تشرح لماذا النتائج غير مناسبة أو ما هو المنتج المطلوب…"
                rows={3}
                className="w-full text-sm px-3 py-2 rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => requestMut.mutate()}
                  disabled={requestMut.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl">
                  {requestMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  تأكيد إرسال الطلب
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Footer actions ──────────────────────────────────────────────── */}
      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-400">
          يمكنك استبدال المرجع الحالي أو إزالته أو إرسال طلب مراجعة إلى فريق البيانات.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">
            إلغاء
          </button>
          <button
            onClick={() => selected && linkMut.mutate(selected)}
            disabled={!selected || linkMut.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl shadow-sm transition-colors">
            {linkMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {selected
              ? isLinked
                ? `تغيير الربط · ثقة ${Math.round(selected.score)}٪`
                : `تأكيد الربط · ثقة ${Math.round(selected.score)}٪`
              : isLinked ? 'مربوط بالكتالوج ✓' : 'اختر منتجًا للربط'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
