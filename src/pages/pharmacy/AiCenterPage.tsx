import { useState, useMemo, createContext, useContext } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Inbox, Users, ShieldCheck,
  Sparkles, TrendingDown, XCircle, AlertOctagon, Clock,
  Archive, Link as LinkIcon, ShoppingCart, Package,
  AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft,
  AlertCircle, Info, Loader2, X, Edit3,
  Store, Eye, RefreshCw,
} from 'lucide-react'
import {
  aiCenterApi,
  type Approval, type ApprovalPriority, type DashboardWidget,
  type ConfidenceLabel, type ApprovalEvent, type Agent,
} from '../../api/ai-center.api'

// ── helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_LABEL_AR: Record<ApprovalPriority, string> = {
  critical: 'حرج',
  high:     'مرتفع',
  medium:   'متوسط',
  low:      'منخفض',
}

const PRIORITY_STYLE: Record<ApprovalPriority, string> = {
  critical: 'bg-red-50 border-red-300 text-red-800',
  high:     'bg-amber-50 border-amber-300 text-amber-800',
  medium:   'bg-sky-50 border-sky-300 text-sky-800',
  low:      'bg-gray-50 border-gray-300 text-gray-700',
}

const CONFIDENCE_LABEL_AR: Record<ConfidenceLabel, string> = {
  very_high: 'ثقة عالية جداً',
  high:      'ثقة عالية',
  medium:    'ثقة متوسطة',
  low:       'ثقة منخفضة',
}

const CONFIDENCE_STYLE: Record<ConfidenceLabel, string> = {
  very_high: 'bg-emerald-100 text-emerald-800',
  high:      'bg-emerald-50 text-emerald-700',
  medium:    'bg-amber-50 text-amber-700',
  low:       'bg-gray-100 text-gray-600',
}

const WIDGET_ICON: Record<string, React.ElementType> = {
  'trending-down':  TrendingDown,
  'x-circle':       XCircle,
  'alert-octagon':  AlertOctagon,
  'clock':          Clock,
  'archive':        Archive,
  'link':           LinkIcon,
  'inbox':          Inbox,
}

const AGENT_ICON: Record<string, React.ElementType> = {
  'package':       Package,
  'shopping-cart': ShoppingCart,
  'link':          LinkIcon,
  'archive':       Archive,
  'clock-alert':   Clock,
  'store':         Store,
  'sparkles':      Sparkles,
}

const SEVERITY_BG: Record<DashboardWidget['severity'], string> = {
  danger:  'from-red-50 to-white border-red-200',
  warning: 'from-amber-50 to-white border-amber-200',
  info:    'from-sky-50 to-white border-sky-200',
  success: 'from-emerald-50 to-white border-emerald-200',
}

const SEVERITY_ICON_BG: Record<DashboardWidget['severity'], string> = {
  danger:  'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info:    'bg-sky-100 text-sky-700',
  success: 'bg-emerald-100 text-emerald-700',
}

const formatRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)       return 'الآن'
  if (m < 60)      return `قبل ${m} د`
  const h = Math.floor(m / 60)
  if (h < 24)      return `قبل ${h} س`
  const d = Math.floor(h / 24)
  if (d < 30)      return `قبل ${d} يوم`
  return new Date(iso).toLocaleDateString('ar-EG')
}

// ── tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'approvals' | 'tasks' | 'agents' | 'audit'

const TABS: Array<{ key: Tab; labelAr: string; icon: React.ElementType; tip?: string }> = [
  { key: 'dashboard', labelAr: 'لوحة العمل',     icon: LayoutDashboard, tip: 'نظرة سريعة على أهم المؤشرات التشغيلية اليوم' },
  { key: 'approvals', labelAr: 'مركز الموافقات', icon: Inbox,           tip: 'كل ما يقترحه مساعدوك وينتظر قرارك' },
  { key: 'tasks',     labelAr: 'مهامي',           icon: CheckCircle2,    tip: 'عرض مرتّب حسب نوع المهمة: شراء، ربط، تنبيهات' },
  { key: 'agents',    labelAr: 'مساعدوك الأذكياء', icon: Users,    tip: 'إدارة أي مساعد فعّال ومستوى ثقته المطلوب' },
  { key: 'audit',     labelAr: 'السجل والشفافية', icon: ShieldCheck,    tip: 'سجل كامل لكل قرار وتعديل وتنفيذ' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Toast + Confirm primitives (used by every action that mutates state)
// ─────────────────────────────────────────────────────────────────────────────

type ToastKind = 'success' | 'error' | 'info'
type ToastMsg  = { id: number; kind: ToastKind; text: string }

function useToasts() {
  const [items, setItems] = useState<ToastMsg[]>([])
  const push = (kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random()
    setItems(prev => [...prev, { id, kind, text }])
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), kind === 'error' ? 5000 : 3000)
  }
  return { items, push }
}

function ToastStack({ items }: { items: ToastMsg[] }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      {items.map(t => {
        const style =
          t.kind === 'success' ? 'bg-emerald-600 text-white' :
          t.kind === 'error'   ? 'bg-red-600 text-white'     :
                                 'bg-violet-600 text-white'
        const Icon =
          t.kind === 'success' ? CheckCircle2 :
          t.kind === 'error'   ? AlertOctagon :
                                 Info
        return (
          <div key={t.id}
            className={`${style} px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-top-2`}>
            <Icon size={15} />
            {t.text}
          </div>
        )
      })}
    </div>
  )
}

type ConfirmTone = 'danger' | 'warning' | 'primary'
type ConfirmState = {
  title: string
  body: string
  confirmLabel: string
  tone: ConfirmTone
  onConfirm: () => void
} | null

function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  if (!state) return null
  const toneBtn =
    state.tone === 'danger'  ? 'bg-red-600 hover:bg-red-700 text-white'           :
    state.tone === 'warning' ? 'bg-amber-600 hover:bg-amber-700 text-white'        :
                                'bg-emerald-600 hover:bg-emerald-700 text-white'
  const ToneIcon = state.tone === 'danger' ? AlertOctagon
                 : state.tone === 'warning' ? AlertTriangle
                 : CheckCircle2
  const toneIconBg = state.tone === 'danger'  ? 'bg-red-100 text-red-700'
                  : state.tone === 'warning' ? 'bg-amber-100 text-amber-700'
                  :                            'bg-emerald-100 text-emerald-700'
  return (
    <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-md w-full p-5"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${toneIconBg}`}>
            <ToneIcon size={18} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-base mb-1">{state.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{state.body}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 justify-end mt-4">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100">
            إلغاء
          </button>
          <button onClick={() => { state.onConfirm(); onClose() }}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${toneBtn}`}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface ActionsCtx {
  toast: (kind: ToastKind, text: string) => void
  confirm: (s: NonNullable<ConfirmState>) => void
}
const ActionsContext = createContext<ActionsCtx | null>(null)
function useActions(): ActionsCtx {
  const v = useContext(ActionsContext)
  if (!v) throw new Error('ActionsContext missing')
  return v
}

export default function AiCenterPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as Tab) ?? 'dashboard'
  const setActiveTab = (k: Tab) => setSearchParams({ tab: k })

  const counts = useQuery({
    queryKey: ['ai-center', 'counts'],
    queryFn:  aiCenterApi.approvalCounts,
    refetchInterval: 30_000,
  })

  const qc = useQueryClient()
  const toasts = useToasts()
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)
  const actions: ActionsCtx = useMemo(() => ({
    toast:   (kind, text) => toasts.push(kind, text),
    confirm: (s)          => setConfirmState(s),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const sync = useMutation({
    mutationFn: () => aiCenterApi.syncNow(),
    onSuccess: (res) => {
      const total =
        res.recommendations.created + res.procurement.created + res.catalog.created
      toasts.push(
        total > 0 ? 'success' : 'info',
        total > 0
          ? `تمت إضافة ${total} قراراً جديداً للمراجعة.`
          : `لا توجد إشارات جديدة تستدعي قراراً بعد.`,
      )
      qc.invalidateQueries({ queryKey: ['ai-center'] })
    },
    onError: () => toasts.push('error', 'تعذّرت المزامنة — راجع حالة الاتصال والصلاحيات.'),
  })

  return (
    <ActionsContext.Provider value={actions}>
      <ToastStack items={toasts.items} />
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    <div className="space-y-5">
      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-md">
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">مركز الذكاء التشغيلي</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              مساعدوك الأذكياء يراقبون صيدليتك ويقترحون قرارات — وأنت من يقرر دائماً.
            </p>
          </div>
        </div>
        {(counts.data?.pendingCritical ?? 0) > 0 && (
          <div className="px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-2">
            <AlertCircle size={16} />
            {counts.data!.pendingCritical} قرار{counts.data!.pendingCritical > 1 ? '' : ''} حرج بانتظارك
          </div>
        )}
        <Tooltip text="ابحث عن إشارات جديدة (توصيات، أوامر شراء مقترحة، روابط منتجات) وأضفها للمراجعة دون انتظار الجدولة.">
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="px-3 py-2 rounded-xl border border-violet-200 bg-white text-violet-700 hover:bg-violet-50 text-sm font-medium flex items-center gap-2 disabled:opacity-60"
          >
            {sync.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
            مزامنة الآن
          </button>
        </Tooltip>
      </div>

      {/* ── Tab strip ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-2xl p-1 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          const badge = tab.key === 'approvals' ? counts.data?.pending : undefined
          return (
            <Tooltip key={tab.key} text={tab.tip}>
              <button
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                  active
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={16} />
                {tab.labelAr}
                {badge !== undefined && badge > 0 && (
                  <span className={`ms-1 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center font-bold ${
                    active ? 'bg-white text-violet-700' : 'bg-violet-100 text-violet-700'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            </Tooltip>
          )
        })}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'approvals' && <ApprovalsTab />}
      {activeTab === 'tasks'     && <TasksTab />}
      {activeTab === 'agents'    && <AgentsTab />}
      {activeTab === 'audit'     && <AuditTab />}
    </div>
    </ActionsContext.Provider>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═════════════════════════════════════════════════════════════════════════════

function DashboardTab() {
  const navigate = useNavigate()
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['ai-center', 'workforce'],
    queryFn:  aiCenterApi.workforceSummary,
    refetchInterval: 60_000,
    retry: 1,
  })

  if (isLoading) return <SkeletonGrid />

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl border border-red-200 bg-red-50 text-red-900 flex items-start gap-3">
        <AlertOctagon size={20} className="shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1">تعذّر تحميل لوحة العمل</h3>
          <p className="text-xs leading-relaxed text-red-900/80">
            {error instanceof Error ? error.message : 'لم يستجب الخادم. راجع حالة تسجيل الدخول أو أعد المحاولة.'}
          </p>
          <button onClick={() => refetch()} disabled={isFetching}
            className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-1.5">
            {isFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  const totalSignals =
    data.widgets.reduce((s, w) => s + w.count, 0) + data.pendingApprovals.total

  return (
    <div className="space-y-5">
      {totalSignals === 0 && (
        <div className="p-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 size={22} />
          </div>
          <div className="flex-1 text-sm leading-relaxed">
            <h3 className="font-semibold text-emerald-900 text-base mb-0.5">لم يكتشف مساعدوك أي مخاطر اليوم</h3>
            <p className="text-emerald-900/80">
              هذا لا يعني أن النظام متوقف — بل أن البيانات الحالية لا تستدعي إجراءً. استمر في تسجيل المبيعات وإدخال الفواتير، وسنُخطرك فور الحاجة.
            </p>
            <p className="text-emerald-900/60 text-[11px] mt-1.5">
              تلميح: اضغط «مزامنة الآن» في أعلى الصفحة لسحب الإشارات الأخيرة فوراً.
            </p>
          </div>
        </div>
      )}

      {/* KPI widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {data.widgets.map(w => {
          const Icon = WIDGET_ICON[w.iconKey] ?? Sparkles
          return (
            <button
              key={w.key}
              onClick={() => navigate(w.deepLink)}
              className={`text-start p-4 rounded-2xl border bg-gradient-to-br ${SEVERITY_BG[w.severity]} hover:shadow-md transition group`}
            >
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${SEVERITY_ICON_BG[w.severity]}`}>
                  <Icon size={18} />
                </div>
                <ChevronLeft size={16} className="text-gray-400 group-hover:text-gray-700 rtl:rotate-180" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-gray-900">{w.count.toLocaleString('ar-EG')}</div>
                <div className="text-sm text-gray-600 mt-0.5">{w.titleAr}</div>
                {w.count === 0 && w.emptyMessageAr && (
                  <div className="text-[11px] text-emerald-600 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 size={11} />
                    {w.emptyMessageAr}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Top pending approvals preview */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox size={18} className="text-violet-600" />
            <h2 className="text-base font-semibold text-gray-900">قرارات بانتظارك</h2>
            {data.pendingApprovals.total > 0 && (
              <span className="ms-1 px-2 py-0.5 rounded-full text-xs bg-violet-50 text-violet-700">
                {data.pendingApprovals.total}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/pharmacy/ai-center?tab=approvals')}
            className="text-sm text-violet-700 hover:text-violet-900 font-medium flex items-center gap-1"
          >
            عرض الكل <ChevronLeft size={14} className="rtl:rotate-180" />
          </button>
        </div>
        {data.topApprovals.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            iconCls="bg-emerald-100 text-emerald-700"
            title="كل شيء تحت السيطرة"
            body="لا توجد قرارات بانتظارك الآن — سنُخطرك فور وجود أي مستجد."
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.topApprovals.map(a => (
              <li
                key={a.id}
                className="px-5 py-3.5 hover:bg-gray-50 cursor-pointer flex items-start gap-3"
                onClick={() => navigate(`/pharmacy/ai-center?tab=approvals&id=${a.id}`)}
              >
                <span className={`mt-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium border ${PRIORITY_STYLE[a.priority]}`}>
                  {PRIORITY_LABEL_AR[a.priority]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{a.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{a.summary}</div>
                </div>
                <div className="text-[11px] text-gray-400 whitespace-nowrap">{formatRelative(a.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// APPROVALS TAB
// ═════════════════════════════════════════════════════════════════════════════

function ApprovalsTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('id')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'modified' | 'approved' | 'rejected' | 'all'>('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const qc = useQueryClient()
  const { toast, confirm } = useActions()

  const list = useQuery({
    queryKey: ['ai-center', 'approvals', statusFilter],
    queryFn:  () => aiCenterApi.listApprovals(
      statusFilter === 'all' ? {} : { status: statusFilter }
    ),
    refetchInterval: 30_000,
  })

  const bulkApprove = useMutation({
    mutationFn: () => aiCenterApi.bulkApprove(Array.from(selected)),
    onSuccess: (r) => {
      toast('success', `تمت الموافقة على ${r.approved} قراراً${r.skipped ? ` (تم تجاوز ${r.skipped})` : ''}.`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['ai-center'] })
    },
    onError: (e: any) => toast('error', e?.message ?? 'تعذّرت الموافقة الجماعية.'),
  })

  const bulkReject = useMutation({
    mutationFn: () => aiCenterApi.bulkReject(Array.from(selected)),
    onSuccess: (r) => {
      toast('success', `تمّ رفض ${r.rejected} قراراً${r.skipped ? ` (تم تجاوز ${r.skipped})` : ''}.`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['ai-center'] })
    },
    onError: (e: any) => toast('error', e?.message ?? 'تعذّر الرفض الجماعي.'),
  })

  const toggleAll = () => {
    if (!list.data) return
    if (selected.size === list.data.data.length) setSelected(new Set())
    else setSelected(new Set(list.data.data.map(a => a.id)))
  }

  const focused = list.data?.data.find(a => a.id === focusId)
    ?? (focusId ? null : undefined)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5">
      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Status pills */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 overflow-x-auto">
          {([
            { k: 'pending',  l: 'بانتظار قرارك' },
            { k: 'modified', l: 'بعد تعديلك' },
            { k: 'approved', l: 'موافَق عليه' },
            { k: 'rejected', l: 'مرفوض' },
            { k: 'all',      l: 'الكل' },
          ] as const).map(p => (
            <button
              key={p.k}
              onClick={() => { setStatusFilter(p.k); setSelected(new Set()) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                statusFilter === p.k
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.l}
            </button>
          ))}
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="px-4 py-2.5 bg-violet-50 border-b border-violet-200 flex items-center justify-between text-sm">
            <span className="text-violet-900 font-medium">
              تم تحديد {selected.size} عنصراً
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => bulkReject.mutate()}
                disabled={bulkReject.isPending}
                className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium disabled:opacity-50"
              >
                رفض المُحدَّد
              </button>
              <button
                onClick={() => bulkApprove.mutate()}
                disabled={bulkApprove.isPending}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-medium disabled:opacity-50"
              >
                موافقة دفعة واحدة
              </button>
            </div>
          </div>
        )}

        {/* Items */}
        {list.isLoading ? (
          <SkeletonRows />
        ) : (list.data?.data.length ?? 0) === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            iconCls="bg-emerald-100 text-emerald-700"
            title="لا توجد عناصر هنا"
            body="عندما يقترح مساعدوك إجراءً، ستجده هنا — تستطيع الموافقة عليه أو تعديله قبل الموافقة."
          />
        ) : (
          <>
            {statusFilter === 'pending' && (list.data?.data.length ?? 0) > 1 && (
              <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={selected.size === list.data!.data.length}
                  onChange={toggleAll}
                  className="rounded"
                />
                تحديد الكل
              </div>
            )}
            <ul className="divide-y divide-gray-100 max-h-[calc(100vh-22rem)] overflow-y-auto">
              {list.data!.data.map(a => (
                <ApprovalRow
                  key={a.id}
                  approval={a}
                  selected={selected.has(a.id)}
                  focused={focusId === a.id}
                  onToggleSelect={() => {
                    const next = new Set(selected)
                    next.has(a.id) ? next.delete(a.id) : next.add(a.id)
                    setSelected(next)
                  }}
                  onFocus={() => setSearchParams({ tab: 'approvals', id: a.id })}
                  showCheckbox={statusFilter === 'pending'}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Detail */}
      <ApprovalDetail
        approval={focused ?? null}
        onClose={() => setSearchParams({ tab: 'approvals' })}
      />
    </div>
  )
}

function ApprovalRow({
  approval, selected, focused, onToggleSelect, onFocus, showCheckbox,
}: {
  approval: Approval
  selected: boolean
  focused:  boolean
  onToggleSelect: () => void
  onFocus: () => void
  showCheckbox: boolean
}) {
  return (
    <li
      className={`px-4 py-3.5 cursor-pointer transition flex items-start gap-3 ${
        focused ? 'bg-violet-50' : 'hover:bg-gray-50'
      }`}
      onClick={onFocus}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          checked={selected}
          onClick={e => e.stopPropagation()}
          onChange={onToggleSelect}
          className="mt-1 rounded"
        />
      )}
      <span className={`mt-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap ${PRIORITY_STYLE[approval.priority]}`}>
        {PRIORITY_LABEL_AR[approval.priority]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 text-sm">{approval.title}</div>
        <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{approval.summary}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <Tooltip text={approval.confidenceReason ?? 'درجة ثقة المساعد بالاقتراح بناءً على البيانات المتوفرة.'}>
            <span className={`px-1.5 py-0.5 rounded text-[10px] cursor-help ${CONFIDENCE_STYLE[approval.confidenceLabel]}`}>
              {CONFIDENCE_LABEL_AR[approval.confidenceLabel]}
            </span>
          </Tooltip>
          <span className="text-[10px] text-gray-400">·</span>
          <span className="text-[10px] text-gray-500">{formatRelative(approval.createdAt)}</span>
        </div>
      </div>
    </li>
  )
}

function ApprovalDetail({ approval, onClose }: { approval: Approval | null | undefined; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast, confirm } = useActions()
  const [note, setNote] = useState('')
  const [showModify, setShowModify] = useState(false)

  const events = useQuery({
    enabled: !!approval,
    queryKey: ['ai-center', 'approval-events', approval?.id],
    queryFn:  () => aiCenterApi.getApprovalEvents(approval!.id),
  })

  const approve = useMutation({
    mutationFn: () => aiCenterApi.approve(approval!.id, note || undefined),
    onSuccess: () => {
      toast('success', 'تمت الموافقة — جارٍ تنفيذ الإجراء.')
      setNote(''); setShowModify(false)
      qc.invalidateQueries({ queryKey: ['ai-center'] })
    },
    onError: (e: any) => toast('error', e?.message ?? 'تعذّرت الموافقة.'),
  })

  const reject = useMutation({
    mutationFn: () => aiCenterApi.reject(approval!.id, note || undefined),
    onSuccess: () => {
      toast('success', 'تمّ الرفض — لن يتم تنفيذ أي إجراء.')
      setNote(''); setShowModify(false)
      qc.invalidateQueries({ queryKey: ['ai-center'] })
    },
    onError: (e: any) => toast('error', e?.message ?? 'تعذّر الرفض.'),
  })

  const modify = useMutation({
    mutationFn: (payload: Record<string, any>) =>
      aiCenterApi.modifyApproval(approval!.id, payload, note || undefined),
    onSuccess: () => {
      toast('success', 'تمّ حفظ تعديلاتك — يمكنك الآن الموافقة.')
      setNote(''); setShowModify(false)
      qc.invalidateQueries({ queryKey: ['ai-center'] })
    },
    onError: (e: any) => toast('error', e?.message ?? 'تعذّر حفظ التعديل.'),
  })

  if (approval === undefined) {
    return (
      <div className="hidden lg:flex items-center justify-center bg-white rounded-2xl border border-gray-200 border-dashed text-gray-400 text-sm">
        اختر قراراً من القائمة لعرض التفاصيل
      </div>
    )
  }
  if (approval === null) {
    return (
      <div className="hidden lg:flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-200 border-dashed text-gray-500 text-sm p-6 text-center">
        <Info className="text-gray-300 mb-2" size={28} />
        لم يعد هذا القرار متاحاً — ربما تمت معالجته من جلسة أخرى.
        <button onClick={onClose} className="mt-3 text-violet-600 hover:text-violet-800 text-xs">عودة للقائمة</button>
      </div>
    )
  }

  const canDecide = approval.status === 'pending' || approval.status === 'modified'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[calc(100vh-12rem)]">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Tooltip text={`أولوية ${PRIORITY_LABEL_AR[approval.priority]} — تعكس مدى الإلحاح، وليس أهمية المحتوى.`}>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border cursor-help ${PRIORITY_STYLE[approval.priority]}`}>
                {PRIORITY_LABEL_AR[approval.priority]}
              </span>
            </Tooltip>
            <Tooltip text={approval.confidenceReason ?? 'درجة ثقة المساعد بالاقتراح.'}>
              <span className={`px-2 py-0.5 rounded text-[10px] cursor-help ${CONFIDENCE_STYLE[approval.confidenceLabel]}`}>
                {CONFIDENCE_LABEL_AR[approval.confidenceLabel]}
              </span>
            </Tooltip>
          </div>
          <h3 className="font-semibold text-gray-900 text-base">{approval.title}</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="إغلاق">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
        {approval.status === 'executed' && approval.executionResult?.failed && (
          <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 flex items-start gap-2.5">
            <AlertOctagon size={16} className="text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-red-900 text-xs mb-0.5">فشل التنفيذ</div>
              <p className="text-red-900/80 text-[11px] leading-relaxed break-words">
                {String(approval.executionResult.error ?? 'لم يتمكّن النظام من تنفيذ هذا القرار بعد موافقتك. راجع السجل أدناه أو حاول تنفيذ الإجراء يدوياً.')}
              </p>
            </div>
          </div>
        )}
        <Section title="ملخص" body={approval.summary} />

        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 text-violet-900 font-medium text-xs mb-1.5">
            <Sparkles size={13} />
            لماذا هذا الاقتراح؟
          </div>
          <p className="text-violet-900/90 text-xs leading-relaxed whitespace-pre-line">
            {approval.rationale}
          </p>
          {approval.confidenceReason && (
            <div className="mt-2.5 pt-2.5 border-t border-violet-200/70">
              <div className="flex items-center gap-1.5 text-violet-900 font-medium text-[11px] mb-1">
                <Info size={11} />
                لماذا هذه الثقة؟
              </div>
              <p className="text-violet-900/80 text-[11px] leading-relaxed">
                {approval.confidenceReason}
              </p>
            </div>
          )}
        </div>

        {Object.keys(approval.payload ?? {}).length > 0 && (
          <details className="rounded-xl border border-gray-200 overflow-hidden">
            <summary className="px-3.5 py-2.5 text-xs font-medium text-gray-700 bg-gray-50 cursor-pointer flex items-center gap-1.5">
              <Eye size={12} />
              تفاصيل الاقتراح (للمراجعة الفنية)
            </summary>
            <pre dir="ltr" className="p-3 text-[10px] text-gray-600 overflow-x-auto bg-gray-50/50">
              {JSON.stringify(approval.payload, null, 2)}
            </pre>
          </details>
        )}

        {approval.originalPayload && (
          <details className="rounded-xl border border-amber-200 overflow-hidden">
            <summary className="px-3.5 py-2.5 text-xs font-medium text-amber-800 bg-amber-50 cursor-pointer flex items-center gap-1.5">
              <Edit3 size={12} />
              ما كان مقترح المساعد الأصلي (قبل تعديلك)
            </summary>
            <pre dir="ltr" className="p-3 text-[10px] text-amber-900 overflow-x-auto bg-amber-50/40">
              {JSON.stringify(approval.originalPayload, null, 2)}
            </pre>
          </details>
        )}

        {/* Decision history */}
        <div className="rounded-xl border border-gray-200">
          <div className="px-3.5 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-700 flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-gray-500" />
            سجل القرار (شفافية كاملة)
          </div>
          <ul className="divide-y divide-gray-100">
            {(events.data ?? []).map(ev => (
              <li key={ev.id} className="px-3.5 py-2 text-[11px] flex items-center gap-2">
                <span className="text-gray-400">{formatRelative(ev.createdAt)}</span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-700">
                  {transitionLabelAr(ev.fromStatus, ev.toStatus, ev.actorType)}
                </span>
                {ev.note && <span className="text-gray-500">— {ev.note}</span>}
              </li>
            ))}
            {events.isLoading && (
              <li className="px-3.5 py-3 text-[11px] text-gray-400 flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> جارٍ التحميل…
              </li>
            )}
          </ul>
        </div>
      </div>

      {canDecide && (
        <div className="border-t border-gray-100 p-4 space-y-2.5 bg-gray-50/50">
          {showModify && isModifiable(approval) && (
            <ModifyForm
              approval={approval}
              onCancel={() => setShowModify(false)}
              onSubmit={(p) => modify.mutate(p)}
              submitting={modify.isPending}
            />
          )}
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="ملاحظة اختيارية (سبب قرارك)…"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-violet-400"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => confirm({
                title: 'تأكيد رفض القرار',
                body:  'سيصبح هذا الاقتراح مرفوضاً ولن يتم تنفيذ أي إجراء. الإجراء لا يمكن التراجع عنه.',
                confirmLabel: 'رفض',
                tone: 'danger',
                onConfirm: () => reject.mutate(),
              })}
              disabled={reject.isPending}
              className="flex-1 px-3 py-2.5 rounded-xl border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <X size={15} /> رفض
            </button>
            {isModifiable(approval) && !showModify && (
              <button
                onClick={() => setShowModify(true)}
                className="flex-1 px-3 py-2.5 rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 text-sm font-medium flex items-center justify-center gap-2"
              >
                <Edit3 size={15} /> تعديل قبل الموافقة
              </button>
            )}
            <button
              onClick={() => {
                const isCritical = approval.priority === 'critical' || approval.priority === 'high'
                if (isCritical) {
                  confirm({
                    title: 'تأكيد الموافقة على قرار ' + (approval.priority === 'critical' ? 'حرج' : 'مرتفع الأولوية'),
                    body:  'سيبدأ النظام تنفيذ الإجراء فوراً. هل أنت متأكّد؟',
                    confirmLabel: 'موافقة وتنفيذ',
                    tone: 'warning',
                    onConfirm: () => approve.mutate(),
                  })
                } else {
                  approve.mutate()
                }
              }}
              disabled={approve.isPending}
              className="flex-1 px-3 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={15} /> موافقة
            </button>
          </div>
          <p className="text-[10px] text-gray-500 text-center leading-relaxed">
            أنت من يقرر دائماً. لا يقوم النظام بأي إجراء قبل موافقتك.
          </p>
        </div>
      )}
    </div>
  )
}

function transitionLabelAr(from: string | null, to: string, actor: string): string {
  const actorAr = actor === 'user' ? 'أنت' : actor === 'agent' ? 'المساعد' : actor === 'scheduler' ? 'النظام (تلقائي)' : 'النظام'
  if (!from)                  return `أنشأه ${actorAr}`
  if (to === 'modified')      return `عدّله ${actorAr}`
  if (to === 'approved')      return `وافق عليه ${actorAr}`
  if (to === 'rejected')      return `رفضه ${actorAr}`
  if (to === 'executed')      return `نُفِّذ بواسطة ${actorAr}`
  if (to === 'expired')       return `انتهت صلاحيته`
  return `${from} → ${to}`
}

// ═════════════════════════════════════════════════════════════════════════════
// AGENTS TAB
// ═════════════════════════════════════════════════════════════════════════════

function AgentsTab() {
  const qc = useQueryClient()
  const { toast } = useActions()
  const list = useQuery({ queryKey: ['ai-center', 'agents'], queryFn: aiCenterApi.listAgents })

  const toggle = useMutation({
    mutationFn: (a: Agent) => aiCenterApi.updateAgent(a.code, { enabled: !a.enabled }),
    onSuccess: (_, a) => {
      toast('success', a.enabled ? `تم إيقاف ${a.nameAr}` : `تم تفعيل ${a.nameAr}`)
      qc.invalidateQueries({ queryKey: ['ai-center', 'agents'] })
    },
    onError: (e: any) => toast('error', e?.message ?? 'تعذّر تغيير حالة المساعد.'),
  })

  const groups = useMemo(() => {
    const m: Record<number, Agent[]> = {}
    for (const a of list.data ?? []) (m[a.phase] = m[a.phase] ?? []).push(a)
    return m
  }, [list.data])

  if (list.isLoading) return <SkeletonGrid />
  if (list.error) return (
    <div className="p-6 rounded-2xl border border-red-200 bg-red-50 text-red-900 text-sm">
      تعذّر تحميل قائمة المساعدين — {list.error instanceof Error ? list.error.message : 'حاول لاحقاً.'}
    </div>
  )

  return (
    <div className="space-y-6">
      {[1, 2, 3].map(phase => groups[phase] && (
        <div key={phase}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              {phase === 1 ? 'متاح الآن' : phase === 2 ? 'قريباً' : 'مستقبلاً'}
            </h2>
            {phase > 1 && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px]">
                مرحلة لاحقة
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groups[phase].map(a => {
              const Icon = AGENT_ICON[a.iconKey] ?? Sparkles
              const dimmed = phase > 1
              return (
                <div
                  key={a.code}
                  className={`p-4 rounded-2xl border bg-white transition ${
                    a.enabled && !dimmed
                      ? 'border-gray-200 hover:shadow-md'
                      : 'border-gray-200 opacity-70'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      a.enabled ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-gray-900 text-sm">{a.nameAr}</h3>
                        <ToggleSwitch
                          checked={a.enabled}
                          disabled={dimmed || toggle.isPending}
                          onChange={() => toggle.mutate(a)}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{a.descriptionAr}</p>
                      {a.skills.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {a.skills.slice(0, 4).map(s => (
                            <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                              {skillLabelAr(s)}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2.5 text-[10px] text-gray-500">
                        🔒 لا يستطيع تنفيذ أي قرار دون موافقتك
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// Translate well-known skill codes; fall back to the code itself for unknown ones.
function skillLabelAr(code: string): string {
  const map: Record<string, string> = {
    demand_forecasting: 'توقّع الطلب',
    stock_analysis:     'تحليل المخزون',
    risk_detection:     'كشف المخاطر',
    po_drafting:        'إنشاء أوامر شراء',
    supplier_ranking:   'تقييم الموردين',
    timing_optimization:'توقيت الشراء',
    duplicate_detection:'كشف التكرار',
    product_matching:   'مطابقة المنتجات',
    catalog_scoring:    'تقييم الكتالوج',
    movement_analysis:  'تحليل الحركة',
    liquidation_planning:'تخطيط التصريف',
    expiry_risk_scoring:'مخاطر الصلاحية',
    fefo_optimization:  'الأقدم انتهاءً أولاً',
    surplus_detection:  'كشف الفائض',
    listing_pricing:    'تسعير العرض',
  }
  return map[code] ?? code
}

function ToggleSwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-10 h-6 rounded-full transition shrink-0 ${
        checked ? 'bg-emerald-500' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`absolute top-0.5 ${checked ? 'end-0.5' : 'start-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
    </button>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// AUDIT TAB
// ═════════════════════════════════════════════════════════════════════════════

function AuditTab() {
  const [view, setView] = useState<'ai' | 'all'>('ai')
  const events = useQuery({
    queryKey: ['ai-center', 'audit', view],
    queryFn:  () => aiCenterApi.approvalEvents(200, 0),
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-violet-600" />
          <h2 className="text-base font-semibold text-gray-900">سجل القرارات (شفافية كاملة)</h2>
        </div>
        <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setView('ai')}
            className={`px-3 py-1 rounded-md text-xs font-medium ${view === 'ai' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
          >
            قرارات الذكاء فقط
          </button>
          <button
            onClick={() => setView('all')}
            className={`px-3 py-1 rounded-md text-xs font-medium ${view === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
          >
            كل الإجراءات
          </button>
        </div>
      </div>

      {view === 'all' && (
        <div className="px-5 py-3 bg-sky-50 border-b border-sky-100 text-sky-900 text-xs flex items-center gap-2">
          <Info size={13} />
          عرض الإجراءات على مستوى النظام بالكامل سيُتاح قريباً. حالياً نعرض القرارات المتعلقة بالمساعدين الأذكياء.
        </div>
      )}

      {events.isLoading ? (
        <SkeletonRows />
      ) : (events.data?.data.length ?? 0) === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          iconCls="bg-violet-100 text-violet-700"
          title="السجل فارغ"
          body="عندما يقترح مساعدوك إجراءات وتتخذ قرارات بشأنها، ستظهر هنا — كل خطوة، كل قرار، كل تعديل."
        />
      ) : (
        <ul className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
          {events.data!.data.map(ev => (
            <li key={ev.id} className="px-5 py-3 text-sm flex items-start gap-3">
              <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                ev.toStatus === 'approved'    ? 'bg-emerald-500' :
                ev.toStatus === 'rejected'    ? 'bg-red-500' :
                ev.toStatus === 'modified'    ? 'bg-amber-500' :
                ev.toStatus === 'executed'    ? 'bg-violet-500' :
                ev.toStatus === 'expired'     ? 'bg-gray-400' :
                                                'bg-sky-500'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-gray-900 text-xs">
                  {transitionLabelAr(ev.fromStatus, ev.toStatus, ev.actorType)}
                </div>
                {ev.note && <div className="text-gray-500 text-[11px] mt-0.5">{ev.note}</div>}
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(ev.createdAt).toLocaleString('ar-EG')}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-gray-500 mb-1">{title}</div>
      <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  )
}

function SkeletonRows() {
  return (
    <ul className="divide-y divide-gray-100">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="p-4">
          <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-gray-100 rounded animate-pulse mt-2" />
        </li>
      ))}
    </ul>
  )
}

function EmptyState({ icon: Icon, iconCls, title, body }: {
  icon: React.ElementType
  iconCls: string
  title: string
  body: string
}) {
  return (
    <div className="px-6 py-12 text-center">
      <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${iconCls}`}>
        <Icon size={22} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">{body}</p>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TOOLTIP — tiny CSS-only hover help; explains AI jargon without a heavy dep.
// PRD §16: "ترجمة المصطلحات التقنية إلى لغة المالك".
// ═════════════════════════════════════════════════════════════════════════════

function Tooltip({ text, children }: { text?: string; children: React.ReactNode }) {
  if (!text) return <>{children}</>
  // Tooltip is portal-free; uses pure CSS hover. To avoid being clipped by
  // scroll containers we render two copies (top + bottom) and let CSS pick
  // the side via `top:auto` fallback when there's no room below.
  return (
    <span className="relative inline-flex group align-middle">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute z-50 bottom-[calc(100%+6px)] start-1/2 -translate-x-1/2 rtl:translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-[10.5px] leading-snug w-max max-w-[240px] whitespace-normal text-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
      >
        {text}
      </span>
    </span>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MODIFY FORM — PRD §11 "تعديل قبل الموافقة": let the user override the AI's
// numeric proposal (qty, unit price, reorder qty) before approving, so the
// audit trail clearly distinguishes "AI suggestion" from "human-approved".
// ═════════════════════════════════════════════════════════════════════════════

const MODIFIABLE_SUBJECT_TYPES = new Set(['procurement_draft', 'recommendation'])

function isModifiable(a: Approval): boolean {
  return MODIFIABLE_SUBJECT_TYPES.has(a.subjectType)
}

function ModifyForm({
  approval, onCancel, onSubmit, submitting,
}: {
  approval:   Approval
  onCancel:   () => void
  onSubmit:   (payload: Record<string, any>) => void
  submitting: boolean
}) {
  // Editable fields per subjectType — only safe numeric edits.
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const p = approval.payload ?? {}
    if (approval.subjectType === 'procurement_draft') {
      return {
        quantity:  String(p.quantity  ?? ''),
        unitPrice: String(p.unitPrice ?? ''),
      }
    }
    if (approval.subjectType === 'recommendation') {
      return {
        suggestedReorderQty: String(p.suggestedReorderQty ?? ''),
      }
    }
    return {}
  })

  const set = (k: string, v: string) => setFields(f => ({ ...f, [k]: v }))

  const submit = () => {
    const merged = { ...(approval.payload ?? {}) }
    for (const [k, v] of Object.entries(fields)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) merged[k] = n
    }
    if (approval.subjectType === 'procurement_draft') {
      const qty   = Number(merged.quantity)  || 0
      const price = Number(merged.unitPrice) || 0
      merged.subtotal = +(qty * price).toFixed(2)
    }
    onSubmit(merged)
  }

  const fieldsCfg: Array<{ key: string; labelAr: string; suffix?: string; help?: string }> =
    approval.subjectType === 'procurement_draft'
      ? [
          { key: 'quantity',  labelAr: 'الكمية',     suffix: 'وحدة',
            help: 'يمكنك خفض أو رفع الكمية بناءً على معرفتك بالموسم أو السوق.' },
          { key: 'unitPrice', labelAr: 'سعر الوحدة', suffix: approval.payload?.currency ?? 'ر.س',
            help: 'إذا حصلت على عرض أفضل من المورد، اضبط السعر هنا.' },
        ]
      : [
          { key: 'suggestedReorderQty', labelAr: 'الكمية المقترحة للشراء', suffix: 'وحدة',
            help: 'عدّل التوصية حسب طاقة التخزين والسيولة المتاحة.' },
        ]

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3.5 space-y-3">
      <div className="flex items-center gap-1.5 text-amber-900 font-medium text-xs">
        <Edit3 size={13} />
        تعديل قبل الموافقة
      </div>
      <p className="text-[11px] text-amber-900/80 leading-relaxed">
        ستُحفظ نسخة المساعد الأصلية في السجل. ما تُعدّله هنا هو ما سيُنفَّذ عند الموافقة.
      </p>
      <div className="space-y-2.5">
        {fieldsCfg.map(f => (
          <div key={f.key} className="grid grid-cols-[1fr_auto] items-center gap-2">
            <label className="text-[11px] font-medium text-amber-900">
              {f.labelAr}
              {f.help && (
                <Tooltip text={f.help}>
                  <Info size={11} className="inline-block ms-1 text-amber-700/70 cursor-help" />
                </Tooltip>
              )}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={fields[f.key] ?? ''}
                onChange={e => set(f.key, e.target.value)}
                className="w-28 px-2 py-1.5 rounded-md border border-amber-300 bg-white text-xs text-end focus:outline-none focus:border-amber-500"
              />
              {f.suffix && <span className="text-[10px] text-amber-800/80">{f.suffix}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-2 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100/50 text-xs font-medium"
        >
          إلغاء
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex-1 px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          حفظ التعديل
        </button>
      </div>
      <p className="text-[10px] text-amber-800/70 text-center leading-relaxed">
        بعد الحفظ، اضغط <strong>موافقة</strong> لتنفيذ النسخة المعدّلة.
      </p>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TASKS TAB — PRD §10: same approvals, grouped by *task type* so the user can
// pick a single workstream ("today I'll handle purchase drafts") instead of
// scanning a mixed list. Visual: 3 colored cards as filters → single filtered
// list of approvals.
// ═════════════════════════════════════════════════════════════════════════════

type TaskKind = 'purchase' | 'linking' | 'risk'

const TASK_DEFS: Array<{
  key:        TaskKind
  labelAr:    string
  hintAr:     string
  subjectType: string
  icon:       React.ElementType
  tone:       string
  toneActive: string
}> = [
  {
    key: 'purchase',
    labelAr: 'مهام شراء',
    hintAr:  'أوامر شراء مقترحة بانتظار موافقتك',
    subjectType: 'procurement_draft',
    icon: ShoppingCart,
    tone:       'border-sky-200 bg-sky-50/60 hover:bg-sky-50',
    toneActive: 'border-sky-500 bg-sky-100',
  },
  {
    key: 'linking',
    labelAr: 'مهام ربط منتجات',
    hintAr:  'أصناف يبدو أنها نفس المنتج وتحتاج تأكيدك',
    subjectType: 'inventory_item',
    icon: LinkIcon,
    tone:       'border-violet-200 bg-violet-50/60 hover:bg-violet-50',
    toneActive: 'border-violet-500 bg-violet-100',
  },
  {
    key: 'risk',
    labelAr: 'تنبيهات نفاد ومخاطر',
    hintAr:  'منتجات مهددة بالنفاد قريباً',
    subjectType: 'recommendation',
    icon: AlertOctagon,
    tone:       'border-red-200 bg-red-50/60 hover:bg-red-50',
    toneActive: 'border-red-500 bg-red-100',
  },
]

function TasksTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId   = searchParams.get('id')
  const taskParam = (searchParams.get('task') as TaskKind | null) ?? 'purchase'
  const setTask = (k: TaskKind) => setSearchParams({ tab: 'tasks', task: k })

  const def = TASK_DEFS.find(d => d.key === taskParam) ?? TASK_DEFS[0]

  // Counts per task type — one cheap pending fetch.
  const allPending = useQuery({
    queryKey: ['ai-center', 'approvals', 'pending', 'all'],
    queryFn:  () => aiCenterApi.listApprovals({ status: 'pending', limit: 200 }),
    refetchInterval: 30_000,
  })

  const counts: Record<TaskKind, number> = useMemo(() => {
    const c: Record<TaskKind, number> = { purchase: 0, linking: 0, risk: 0 }
    for (const a of allPending.data?.data ?? []) {
      const t = TASK_DEFS.find(d => d.subjectType === a.subjectType)?.key
      if (t) c[t]++
    }
    return c
  }, [allPending.data])

  const list = useQuery({
    queryKey: ['ai-center', 'approvals', 'pending', def.subjectType],
    queryFn:  () => aiCenterApi.listApprovals({ status: 'pending', subjectType: def.subjectType }),
    refetchInterval: 30_000,
  })

  const focused = list.data?.data.find(a => a.id === focusId)
    ?? (focusId ? null : undefined)

  return (
    <div className="space-y-5">
      {/* Task selector cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TASK_DEFS.map(d => {
          const Icon = d.icon
          const active = d.key === taskParam
          const n = counts[d.key]
          return (
            <button
              key={d.key}
              onClick={() => setTask(d.key)}
              className={`text-start p-4 rounded-2xl border transition ${active ? d.toneActive : d.tone}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  active ? 'bg-white shadow-sm' : 'bg-white/70'
                }`}>
                  <Icon size={20} className="text-gray-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm">{d.labelAr}</h3>
                    <span className={`min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                      n > 0 ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {n}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{d.hintAr}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Filtered list + detail (reuse same layout as ApprovalsTab) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 text-xs text-gray-600">
            <def.icon size={14} className="text-gray-500" />
            <span>{def.labelAr} — بانتظار قرارك</span>
          </div>
          {list.isLoading ? (
            <SkeletonRows />
          ) : (list.data?.data.length ?? 0) === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              iconCls="bg-emerald-100 text-emerald-700"
              title="لا توجد مهام في هذه الفئة"
              body="هذا يعني أن مساعدك أنجز ما يخص هذا النوع — أو أنه لم يجد ما يستدعي قراراً منك بعد."
            />
          ) : (
            <ul className="divide-y divide-gray-100 max-h-[calc(100vh-26rem)] overflow-y-auto">
              {list.data!.data.map(a => (
                <ApprovalRow
                  key={a.id}
                  approval={a}
                  selected={false}
                  focused={focusId === a.id}
                  onToggleSelect={() => {}}
                  onFocus={() => setSearchParams({ tab: 'tasks', task: taskParam, id: a.id })}
                  showCheckbox={false}
                />
              ))}
            </ul>
          )}
        </div>
        <ApprovalDetail
          approval={focused ?? null}
          onClose={() => setSearchParams({ tab: 'tasks', task: taskParam })}
        />
      </div>
    </div>
  )
}

