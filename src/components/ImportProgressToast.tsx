import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, AlertTriangle, XCircle, Loader2, Sparkles,
  ChevronRight, X, RotateCcw, Eye, Info,
} from 'lucide-react'
import { useImportProgress, rememberActiveBatch } from '../hooks/useImportProgress'
import { importsApi } from '../api/imports.api'

/**
 * Rotating reassurance tips shown while the worker is processing.
 *
 * Why: pharmacists watching a 10 k-row upload will get bored and worried.
 * Live text that explains *what* the AI is doing keeps trust high.
 * Keep each tip ≤ 80 chars so it fits the toast without truncation.
 */
const TIPS_AR: string[] = [
  'الذكاء الاصطناعي يقارن الباركود والاسم العربي والإنجليزي…',
  'نتحقق من اسم الشركة المصنّعة والتركيز والشكل الصيدلاني…',
  'المنتجات عالية الثقة يتم ربطها تلقائياً بالكتالوج الوطني.',
  'يمكنك متابعة عملك بشكل طبيعي — سنخبرك فور الانتهاء.',
  'المنتجات المشكوك بها ستظهر في قائمة "بحاجة لمراجعة".',
  'لا داعي للقلق — لن نفقد أي صف من ملفك.',
]

const KIND_LABEL_AR: Record<string, string> = {
  csv_upload:    'رفع ملف مخزون',
  tenant_rematch:'الربط الذكي',
  admin_cascade: 'تحديث الكتالوج',
}

interface Props {
  batchId:   string
  onDismiss: () => void
}

/**
 * Sticky bottom-right (RTL: bottom-left visually) progress card.
 *
 * Lifecycle:
 *   queued/matching → live progress bar + counters + rotating tip + cancel
 *   completed       → green success card with "افتح المراجعة" CTA
 *   failed          → red error card with "إعادة المحاولة" hint
 *   cancelled       → neutral card, auto-dismiss in 6 s
 *
 * The toast is intentionally non-blocking: pharmacists keep working while
 * AI runs. Persists across reloads via rememberActiveBatch() in localStorage.
 */
export function ImportProgressToast({ batchId, onDismiss }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { batch, isPending, isTerminal, isComplete, isFailed, isCancelled, percent } =
    useImportProgress(batchId)

  const [tipIdx, setTipIdx] = useState(0)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  // Rotate the reassurance tip every 4 s while the job is running.
  useEffect(() => {
    if (!isPending) return
    const t = setInterval(() => setTipIdx(i => (i + 1) % TIPS_AR.length), 4_000)
    return () => clearInterval(t)
  }, [isPending])

  // Auto-dismiss the cancelled state after 6 s — the user already knows.
  useEffect(() => {
    if (!isCancelled) return
    const t = setTimeout(() => {
      rememberActiveBatch(null)
      onDismiss()
    }, 6_000)
    return () => clearTimeout(t)
  }, [isCancelled, onDismiss])

  // When the job becomes terminal, clear the persisted active batch so a
  // page reload doesn't bring back a finished toast.
  useEffect(() => {
    if (isTerminal) rememberActiveBatch(null)
  }, [isTerminal])

  const cancelMutation = useMutation({
    mutationFn: () => importsApi.cancel(batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-batch', batchId] })
      setConfirmingCancel(false)
    },
  })

  const handleReview = () => {
    rememberActiveBatch(null)
    onDismiss()
    navigate(`/pharmacy/inventory?linkStatus=suggested&batchId=${batchId}`)
  }

  const handleViewAll = () => {
    rememberActiveBatch(null)
    onDismiss()
    navigate(`/pharmacy/inventory?batchId=${batchId}`)
  }

  if (!batch) {
    // First-load skeleton — keep it tiny so it doesn't flash awkwardly.
    return (
      <Frame>
        <div className="flex items-center gap-3 py-2">
          <Loader2 size={18} className="animate-spin text-teal-600" />
          <span className="text-sm text-gray-600">جاري الاتصال بالخادم…</span>
        </div>
      </Frame>
    )
  }

  // ── Completed ──────────────────────────────────────────────────────────────
  if (isComplete) {
    const hasReview = (batch.suggested ?? 0) > 0
    return (
      <Frame accent="success">
        <Header
          icon={<CheckCircle2 size={20} className="text-emerald-600" />}
          title="اكتمل بنجاح ✨"
          subtitle={`${KIND_LABEL_AR[batch.kind] ?? 'معالجة'} · ${batch.processed} صف`}
          onClose={() => { rememberActiveBatch(null); onDismiss() }}
        />
        <CountersGrid batch={batch} compact />
        {hasReview ? (
          <button
            onClick={handleReview}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl shadow-sm transition-all"
          >
            <Eye size={15} />
            افتح المراجعة ({batch.suggested})
            <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleViewAll}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl"
          >
            عرض المخزون
            <ChevronRight size={14} />
          </button>
        )}
      </Frame>
    )
  }

  // ── Failed ─────────────────────────────────────────────────────────────────
  if (isFailed) {
    return (
      <Frame accent="error">
        <Header
          icon={<XCircle size={20} className="text-red-600" />}
          title="فشلت المعالجة"
          subtitle="حدث خطأ أثناء معالجة الملف"
          onClose={() => { rememberActiveBatch(null); onDismiss() }}
        />
        <div className="mt-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed">
          {batch.errorMessage || 'خطأ غير معروف. حاول مرة أخرى أو راجع الدعم الفني.'}
        </div>
        <p className="mt-2 text-[11px] text-gray-500 flex items-center gap-1">
          <Info size={11} /> الصفوف المعالجة قبل الخطأ تم حفظها في المخزون.
        </p>
      </Frame>
    )
  }

  // ── Cancelled ──────────────────────────────────────────────────────────────
  if (isCancelled) {
    return (
      <Frame accent="neutral">
        <Header
          icon={<XCircle size={20} className="text-gray-500" />}
          title="تم الإلغاء"
          subtitle={`عُولج ${batch.processed} من ${batch.total} صف قبل الإلغاء`}
          onClose={() => { rememberActiveBatch(null); onDismiss() }}
        />
      </Frame>
    )
  }

  // ── In progress (queued / matching) ────────────────────────────────────────
  return (
    <Frame accent="working">
      <Header
        icon={<Sparkles size={20} className="text-teal-600 animate-pulse" />}
        title={batch.status === 'queued' ? 'في قائمة الانتظار…' : 'جاري الربط الذكي…'}
        subtitle={`${KIND_LABEL_AR[batch.kind] ?? 'معالجة'}${batch.sourceFile ? ` · ${batch.sourceFile}` : ''}`}
        onClose={() => onDismiss()}
        hideClose
      />

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs font-medium text-gray-600 mb-1">
          <span>{batch.processed.toLocaleString('ar-EG')} / {batch.total.toLocaleString('ar-EG')}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-teal-100/60 overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-teal-500 via-cyan-500 to-emerald-500 transition-[width] duration-700 ease-out relative"
            style={{ width: `${Math.max(2, percent)}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        </div>
      </div>

      <CountersGrid batch={batch} />

      {/* Rotating reassurance tip */}
      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-teal-700 bg-teal-50/70 border border-teal-100 rounded-lg px-2.5 py-1.5 leading-relaxed">
        <Sparkles size={11} className="mt-0.5 shrink-0 text-teal-500" />
        <span key={tipIdx} className="animate-in fade-in duration-500">{TIPS_AR[tipIdx]}</span>
      </p>

      {/* Cancel control */}
      {confirmingCancel ? (
        <div className="mt-3 p-2.5 rounded-lg border border-amber-200 bg-amber-50">
          <p className="text-xs text-amber-800 mb-2">
            هل تريد فعلاً إلغاء المعالجة؟ الصفوف التي تم معالجتها ستظل محفوظة.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmingCancel(false)}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
            >
              متابعة المعالجة
            </button>
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="flex-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg"
            >
              {cancelMutation.isPending ? 'جاري الإلغاء…' : 'نعم، ألغِ'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmingCancel(true)}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-red-600 transition-colors py-1.5"
        >
          <RotateCcw size={11} />
          إلغاء المعالجة
        </button>
      )}
    </Frame>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

type AccentKey = 'working' | 'success' | 'error' | 'neutral'

const FRAME_ACCENT: Record<AccentKey, string> = {
  working: 'border-teal-200/80 ring-teal-100',
  success: 'border-emerald-200 ring-emerald-100',
  error:   'border-red-200 ring-red-100',
  neutral: 'border-gray-200 ring-gray-100',
}

function Frame({ children, accent = 'working' }: { children: React.ReactNode; accent?: AccentKey }) {
  return (
    <div
      className={`fixed bottom-5 end-5 z-[60] w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border ${FRAME_ACCENT[accent]} ring-4 p-4 animate-in slide-in-from-bottom-4 duration-300`}
      role="status"
      aria-live="polite"
    >
      {children}
    </div>
  )
}

function Header({
  icon, title, subtitle, onClose, hideClose,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  onClose: () => void
  hideClose?: boolean
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="p-1.5 bg-gray-50 rounded-lg shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{title}</p>
        {subtitle && <p className="text-[11px] text-gray-500 truncate mt-0.5">{subtitle}</p>}
      </div>
      {!hideClose && (
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-700 shrink-0 rounded-md hover:bg-gray-100"
          aria-label="إخفاء"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function CountersGrid({ batch, compact }: { batch: any; compact?: boolean }) {
  const items = useMemo(() => ([
    { label: 'ربط تلقائي', value: batch.autoLinked ?? 0, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    { label: 'بحاجة لمراجعة', value: batch.suggested ?? 0, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
    { label: 'جديد', value: batch.unlinked ?? 0, cls: 'bg-sky-50 border-sky-200 text-sky-700' },
    { label: 'تم تخطيه', value: batch.skipped ?? 0, cls: 'bg-gray-50 border-gray-200 text-gray-600' },
  ]), [batch.autoLinked, batch.suggested, batch.unlinked, batch.skipped])

  return (
    <div className={`grid grid-cols-4 gap-1.5 ${compact ? 'mt-2' : 'mt-3'}`}>
      {items.map(it => (
        <div key={it.label} className={`px-2 py-1.5 rounded-lg border text-center ${it.cls}`}>
          <div className="text-sm font-bold tabular-nums">{it.value}</div>
          <div className="text-[10px] opacity-80 leading-tight mt-0.5">{it.label}</div>
        </div>
      ))}
    </div>
  )
}
