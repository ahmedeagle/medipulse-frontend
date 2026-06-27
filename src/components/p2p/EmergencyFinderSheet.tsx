import { useState, useEffect, useRef, useCallback } from 'react'
import { X, MapPin, Zap, CheckCircle, Loader2, AlertTriangle, Search, Filter } from 'lucide-react'
import clsx from 'clsx'
import { p2pMarketplaceApi, p2pOrdersApi } from '../../api/p2p.api'
import type { MarketplaceResult } from '../../types/p2p'
import { useProfileStore } from '../../store/auth.store'

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'search' | 'success'

const EXAMPLE_DRUGS = ['باراسيتامول', 'أوميبرازول', 'فونتارين', 'كابيتت', 'ريفاكس']

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExpiryBadge({ date }: { date?: string }) {
  if (!date) return null
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
  if (days > 90) return null
  const label = days === 0 ? 'صلاحية المنتج تنتهي اليوم' : `صلاحية المنتج: ${days} يوم متبقي`
  return (
    <span className={clsx(
      'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
      days <= 30 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
    )}>
      <AlertTriangle size={9} />
      {label}
    </span>
  )
}

/** SVG map — no library needed. Shows pharmacies as green pins radiating from centre. */
function PharmacyMap({ results }: { results: MarketplaceResult[] }) {
  const W = 340, H = 175
  const cx = W / 2, cy = H / 2 + 5

  const withDist = results.filter(r => r.distanceKm != null).slice(0, 9)
  const maxDist = withDist.length ? Math.max(...withDist.map(r => r.distanceKm!), 3) : 3
  const R = H / 2 - 14
  const scale = R / maxDist

  const dots = withDist.map((r, i) => {
    const angle = (i / Math.max(withDist.length, 1)) * 2 * Math.PI - Math.PI / 2 + 0.4
    return {
      x: cx + Math.cos(angle) * r.distanceKm! * scale,
      y: cy + Math.sin(angle) * r.distanceKm! * scale,
    }
  })

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-emerald-100"
      style={{ height: H, background: 'linear-gradient(145deg, #ecfdf5 0%, #d1fae5 60%, #a7f3d0 100%)' }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="absolute inset-0">
        {/* Road grid */}
        <line x1="0" y1={cy} x2={W} y2={cy} stroke="#86efac" strokeWidth="1.5" strokeDasharray="7 5" opacity="0.45" />
        <line x1={cx} y1="0" x2={cx} y2={H} stroke="#86efac" strokeWidth="1.5" strokeDasharray="7 5" opacity="0.45" />
        <line x1="0" y1={cy - 38} x2={W} y2={cy - 38} stroke="#86efac" strokeWidth="1" strokeDasharray="5 6" opacity="0.25" />
        <line x1="0" y1={cy + 38} x2={W} y2={cy + 38} stroke="#86efac" strokeWidth="1" strokeDasharray="5 6" opacity="0.25" />

        {/* Distance rings */}
        {[0.33, 0.60, 0.88].map((pct, i) => (
          <circle key={i} cx={cx} cy={cy} r={R * pct}
            fill={i === 1 ? '#10b981' : 'none'} fillOpacity={i === 1 ? 0.05 : 0}
            stroke="#6ee7b7" strokeWidth="1" strokeDasharray="4 3" opacity="0.55"
          />
        ))}

        {/* Lines to pharmacies */}
        {dots.map((d, i) => (
          <line key={`l${i}`} x1={cx} y1={cy} x2={d.x} y2={d.y}
            stroke="#34d399" strokeWidth="1" strokeDasharray="3 2" opacity="0.3"
          />
        ))}

        {/* Pharmacy pins */}
        {dots.map((d, i) => (
          <g key={`p${i}`}>
            <circle cx={d.x} cy={d.y} r="12" fill="#059669" fillOpacity="0.13" />
            <circle cx={d.x} cy={d.y} r="6.5" fill="#059669" />
            <circle cx={d.x} cy={d.y} r="3" fill="white" />
          </g>
        ))}

        {/* Buyer — centre */}
        <circle cx={cx} cy={cy} r="18" fill="#059669" fillOpacity="0.1" />
        <circle cx={cx} cy={cy} r="11" fill="#047857" />
        <circle cx={cx} cy={cy} r="5" fill="white" />
      </svg>

      {/* City label */}
      <div className="absolute top-2 start-3 flex items-center gap-1 bg-white/85 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm">
        <MapPin size={10} className="text-emerald-600" />
        <span className="text-[10px] font-semibold text-gray-600">القاهرة، مصر</span>
      </div>

      {/* Count badge */}
      {results.length > 0 && (
        <div className="absolute bottom-2 end-2 bg-emerald-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow">
          {results.length} صيدلية
        </div>
      )}
    </div>
  )
}

function getDosageIcon(form?: string | null): string {
  if (!form) return '💊'
  const f = form.toLowerCase()
  if (f.includes('cream') || f.includes('oint') || f.includes('gel') || f.includes('كريم') || f.includes('مرهم')) return '🧴'
  if (f.includes('syrup') || f.includes('solution') || f.includes('شراب') || f.includes('محلول')) return '🍶'
  if (f.includes('inject') || f.includes('حقن') || f.includes('ampoule') || f.includes('أمبول')) return '💉'
  if (f.includes('drop') || f.includes('eye') || f.includes('قطرة') || f.includes('عين')) return '👁️'
  if (f.includes('inhaler') || f.includes('بخاخ') || f.includes('spray') || f.includes('رذاذ')) return '💨'
  if (f.includes('patch') || f.includes('لصقة')) return '🩹'
  if (f.includes('capsule') || f.includes('كبسول')) return '💊'
  if (f.includes('tablet') || f.includes('قرص') || f.includes(' tab')) return '⬜'
  if (f.includes('supp') || f.includes('لبوس') || f.includes('تحميل')) return '🔵'
  return '💊'
}

function ResultCard({ result, selected, onSelect, myTenantId }: {
  result: MarketplaceResult
  selected: boolean
  onSelect: (r: MarketplaceResult) => void
  myTenantId: string
}) {
  const { listing, seller, distanceKm } = result
  const name = listing.productNameAr || listing.productName || 'دواء غير معروف'
  const code = listing.productBarcode ?? listing.productCode
  const isOwnListing = listing.sellerTenantId === myTenantId

  return (
    <div
      onClick={() => !isOwnListing && onSelect(result)}
      className={clsx(
        'flex gap-3 p-3.5 rounded-2xl border transition-all',
        isOwnListing
          ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
          : selected
          ? 'bg-emerald-50 border-emerald-400 shadow-sm cursor-pointer'
          : 'bg-white border-gray-100 hover:border-emerald-200 hover:shadow-sm cursor-pointer',
      )}
    >
      {/* Left: dosage form avatar */}
      <div className={clsx(
        'shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl',
        selected ? 'bg-emerald-100' : 'bg-gray-50 border border-gray-100',
      )}>
        {getDosageIcon(listing.productDosageForm)}
      </div>

      {/* Right: all product details */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Drug name */}
        <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{name}</p>

        {/* Strength + dosage form pills */}
        {(listing.productStrength || listing.productDosageForm) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {listing.productStrength && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-[10px] font-bold">
                {listing.productStrength}
              </span>
            )}
            {listing.productDosageForm && (
              <span className="px-2 py-0.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-full text-[10px] font-medium">
                {listing.productDosageForm}
              </span>
            )}
          </div>
        )}

        {/* Manufacturer */}
        {listing.productManufacturer && (
          <p className="text-[10px] text-gray-400 truncate">{listing.productManufacturer}</p>
        )}

        {/* Barcode / product code */}
        {code && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 font-medium">كود:</span>
            <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{code}</span>
          </div>
        )}

        {/* Badges: distance · availability · expiry · emergency type */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {distanceKm != null && (
            <div className="flex items-center gap-0.5 bg-emerald-50 border border-emerald-100 rounded-lg px-1.5 py-0.5">
              <MapPin size={9} className="text-emerald-600" />
              <span className="text-[10px] font-bold text-emerald-700">{distanceKm.toFixed(1)} كم</span>
            </div>
          )}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            متوفر
          </span>
          <ExpiryBadge date={listing.expiryDate} />
          {listing.listingType === 'emergency' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-full text-[10px] font-bold">
              <Zap size={8} />طارئ
            </span>
          )}
        </div>

        {/* Price + select button */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-baseline gap-1">
            <span className="text-base font-bold text-gray-900">
              {listing.price.toLocaleString('en-US', { maximumFractionDigits: 1 })}
            </span>
            <span className="text-[10px] text-gray-400">ج.م</span>
            {listing.discountPct != null && (
              <span className="text-[10px] font-bold text-amber-600">خصم {listing.discountPct}%</span>
            )}
          </div>
          {isOwnListing ? (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-gray-100 text-gray-400 shrink-0">
              صيدليتك
            </span>
          ) : (
            <span className={clsx(
              'text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors shrink-0',
              selected ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500',
            )}>
              {selected ? 'محدد ✓' : 'عرض التفاصيل'}
            </span>
          )}
        </div>

        {/* Pharmacy name + city + quantity */}
        <p className="text-[11px] text-gray-500 truncate">
          <span className={clsx('font-medium', isOwnListing && 'text-gray-400')}>
            {isOwnListing ? `${seller.legalName ?? 'صيدليتك'} (صيدليتك)` : (seller.legalName ?? 'صيدلية')}
          </span>
          {seller.city ? ` · ${seller.city}` : ''}
          {` · ${listing.quantity} عبوة`}
        </p>
      </div>
    </div>
  )
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

export function EmergencyFinderSheet({ open, onClose }: Props) {
  const myTenantId = useProfileStore(s => s.profile?.tenantId ?? '')
  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MarketplaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedResult, setSelectedResult] = useState<MarketplaceResult | null>(null)
  const [orderQty, setOrderQty] = useState(1)
  const [ordering, setOrdering] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (open) {
      setStep('search')
      setQuery('')
      setResults([])
      setSelectedResult(null)
      setOrderQty(1)
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  useEffect(() => () => {
    clearTimeout(debounceRef.current)
    clearInterval(timerRef.current)
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await p2pMarketplaceApi.search({ q: q.trim(), limit: 20 })
      setResults(res.data)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  const handleChange = (val: string) => {
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => doSearch(val), 400)
    } else {
      setResults([])
    }
  }

  const pickChip = (drug: string) => {
    setQuery(drug)
    clearTimeout(debounceRef.current)
    doSearch(drug)
  }

  const handleSelect = (r: MarketplaceResult) => {
    setSelectedResult(prev => prev?.listing.id === r.listing.id ? null : r)
    setOrderQty(Math.max(r.listing.minOrderQty || 1, 1))
  }

  const handleConfirmOrder = async () => {
    if (!selectedResult) return
    setOrdering(true)
    try {
      await p2pOrdersApi.create({
        listingId: selectedResult.listing.id,
        requestedQty: orderQty,
        urgencyLevel: 'critical',
      })
      setCountdown(60)
      setStep('success')
      timerRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(timerRef.current); return 0 }
          return c - 1
        })
      }, 1000)
    } finally {
      setOrdering(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog — two columns */}
      <div className="relative w-full max-w-[860px] bg-white rounded-2xl shadow-2xl flex overflow-hidden"
        style={{ maxHeight: '90vh' }}>

        {/* ── LEFT: Search panel ── */}
        <div className="w-[340px] shrink-0 flex flex-col p-6 border-e border-gray-100 bg-white">
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-3.5 start-3.5 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors z-10"
          >
            <X size={17} />
          </button>

          {/* Icon + headings */}
          <div className="flex flex-col items-center text-center pt-4 pb-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4 shadow-sm">
              <MapPin size={28} className="text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">البحث الطارئ</h2>
            <p className="text-sm text-emerald-600 font-medium mt-1">أسرع طريقة للحصول على دواء الآن</p>
            <p className="text-[11px] text-gray-400 mt-2 leading-relaxed max-w-[230px]">
              اكتب اسم الدواء الذي تحتاجه وستعرض لك أقرب الصيدليات التي تملكه الآن
            </p>
          </div>

          {/* Search input + button */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => handleChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch(query)}
              placeholder="اكتب اسم الدواء..."
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all min-w-0"
            />
            <button
              onClick={() => doSearch(query)}
              className="w-12 h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
            >
              {searching
                ? <Loader2 size={16} className="animate-spin" />
                : <Search size={16} />
              }
            </button>
          </div>

          {/* Example chips */}
          <div className="mt-5">
            <p className="text-[11px] text-gray-400 font-medium mb-2">أمثلة على أدوية شائعة</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_DRUGS.map(drug => (
                <button
                  key={drug}
                  onClick={() => pickChip(drug)}
                  className={clsx(
                    'px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors',
                    query === drug
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700',
                  )}
                >
                  {drug}
                </button>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Trust message */}
          <div className="flex items-start gap-2.5 p-3 bg-emerald-50 rounded-xl border border-emerald-100 mt-5">
            <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle size={11} className="text-white" />
            </div>
            <p className="text-[11px] text-emerald-700 leading-relaxed">
              جميع الصيدليات المعروضة تم التحقق من توفر المخزون فيها. الأسعار والكميات يتم تحديثها بشكل لحظي
            </p>
          </div>
        </div>

        {/* ── RIGHT: Map + Results ── */}
        <div className="flex-1 flex flex-col bg-gray-50/50 min-h-0 min-w-0">
          {/* Header */}
          <div className="px-5 pt-5 pb-3 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900">الصيدليات الأقرب إليك</h3>
                <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                  <MapPin size={9} className="text-gray-400" />
                  القاهرة، مصر
                </p>
              </div>
              {results.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] text-gray-600 hover:bg-gray-50 transition-colors">
                    <Filter size={10} />
                    تصفية
                  </button>
                  <button className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap">
                    الأقرب أولاً ↓
                  </button>
                </div>
              )}
            </div>
          </div>

          {step === 'success' ? (
            <SuccessStep countdown={countdown} onClose={onClose} />
          ) : (
            <>
              {/* Map */}
              <div className="px-5 shrink-0">
                <PharmacyMap results={results} />
              </div>

              {/* Results list */}
              <div className="flex-1 overflow-y-auto px-5 pt-3 min-h-0 space-y-2"
                style={{ paddingBottom: selectedResult ? '0' : '20px' }}>
                {searching ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 size={24} className="text-emerald-500 animate-spin" />
                    <p className="text-sm text-gray-500">جاري البحث في الصيدليات القريبة...</p>
                  </div>
                ) : !query.trim() || query.trim().length < 2 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <Search size={22} className="text-gray-200" />
                    <p className="text-sm text-gray-400">اكتب اسم الدواء للبدء</p>
                    <p className="text-[11px] text-gray-300">يبحث في جميع الأدوية المتاحة على شبكة P2P</p>
                  </div>
                ) : results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <p className="text-sm font-semibold text-gray-600">لم نجد "{query}" في الشبكة</p>
                    <p className="text-[11px] text-gray-400">جرّب اسماً مختلفاً أو تواصل مع مورّدك المعتمد</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-gray-400 px-0.5">
                      {results.length} نتيجة — مرتبة حسب الأقرب إليك
                    </p>
                    {results.map(r => (
                      <ResultCard
                        key={r.listing.id}
                        result={r}
                        selected={selectedResult?.listing.id === r.listing.id}
                        onSelect={handleSelect}
                        myTenantId={myTenantId}
                      />
                    ))}
                    {results.length >= 20 && (
                      <button className="w-full py-2.5 text-emerald-600 text-xs font-semibold hover:bg-emerald-50 rounded-xl transition-colors border border-dashed border-emerald-200">
                        ↓ عرض المزيد من الصيدليات
                      </button>
                    )}
                    <div className="h-2" />
                  </>
                )}
              </div>

              {/* Confirmation bar — only for other pharmacies, never for own listings */}
              {selectedResult && selectedResult.listing.sellerTenantId !== myTenantId && (
                <div className="shrink-0 px-5 pb-4 pt-3 border-t border-emerald-100 bg-emerald-50">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-emerald-800 truncate">
                        {selectedResult.seller.legalName ?? 'صيدلية'}
                      </p>
                      <p className="text-[11px] text-emerald-600 mt-0.5">
                        السعر: {selectedResult.listing.price.toLocaleString('en-US', { maximumFractionDigits: 1 })} ج.م
                        {selectedResult.distanceKm != null ? ` · ${selectedResult.distanceKm.toFixed(1)} كم` : ''}
                      </p>
                    </div>
                    {/* Qty stepper */}
                    <div className="flex items-center gap-1.5 bg-white rounded-lg border border-emerald-200 px-2 py-1">
                      <button
                        onClick={() => setOrderQty(q => Math.max(q - 1, 1))}
                        className="text-emerald-600 font-bold text-base w-5 h-5 flex items-center justify-center"
                      >−</button>
                      <span className="text-sm font-bold text-gray-800 w-5 text-center">{orderQty}</span>
                      <button
                        onClick={() => setOrderQty(q => Math.min(q + 1, selectedResult.listing.quantity))}
                        className="text-emerald-600 font-bold text-base w-5 h-5 flex items-center justify-center"
                      >+</button>
                    </div>
                    <button
                      onClick={handleConfirmOrder}
                      disabled={ordering}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 shrink-0"
                    >
                      {ordering ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      احجز الآن
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Success step ─────────────────────────────────────────────────────────────

function SuccessStep({ countdown, onClose }: { countdown: number; onClose: () => void }) {
  const pct = (countdown / 60) * 100
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10 gap-4 text-center px-6">
      <div className="w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-200 flex items-center justify-center">
        <CheckCircle size={36} className="text-emerald-600" />
      </div>
      <div>
        <p className="text-emerald-700 font-bold text-lg">تم الحجز بنجاح!</p>
        <p className="text-gray-500 text-xs mt-1">طلبك وصل للبائع وهو يراجعه الآن</p>
      </div>
      <div className="w-full max-w-xs space-y-1.5">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[11px] text-gray-400">نافذة التأكيد: {countdown} ثانية متبقية</p>
      </div>
      <button
        onClick={onClose}
        className="w-full max-w-xs py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors"
      >
        متابعة في الطلبات ←
      </button>
    </div>
  )
}
