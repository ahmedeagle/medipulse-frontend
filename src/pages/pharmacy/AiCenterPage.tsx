import { useState, useMemo, useRef, createContext, useContext } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Inbox, Users, ShieldCheck,
  Sparkles, TrendingDown, XCircle, AlertOctagon, Clock,
  Archive, Link as LinkIcon, ShoppingCart, Package,
  AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft,
  AlertCircle, Info, Loader2, X, Edit3,
  Store, Eye, RefreshCw, Activity, Ban, Zap, Settings,
  ShieldAlert, Banknote, PartyPopper, ExternalLink,
} from 'lucide-react'
import {
  aiCenterApi,
  type Approval, type ApprovalPriority, type DashboardWidget,
  type ConfidenceLabel, type ApprovalEvent, type Agent,
  type AgentDefinition,
} from '../../api/ai-center.api'
import { posApi } from '../../api/pos.api'
import { useInfiniteList, InfiniteScrollSentinel } from '../../hooks/useInfiniteList'
import { TabBar } from '../../components/ui/TabBar'

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
  'shield-alert':  ShieldAlert,
  'banknote':      Banknote,
  'alert-circle':  AlertCircle,
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

function approvalActionDescription(approval: Approval): string {
  const p = approval.payload ?? {}
  if (approval.subjectType === 'smart_procurement') {
    const price   = p.p2pPrice   ? `${Number(p.p2pPrice).toFixed(2)} جنيه/وحدة` : '؟'
    const saving  = p.savingsPct > 0 ? ` (توفير ${p.savingsPct}%)` : ''
    const seller  = p.sellerName ?? 'صيدلية محلية'
    const city    = p.sellerCity ? ` في ${p.sellerCity}` : ''
    return `سيتم تسجيل موافقتك على الشراء من ${seller}${city} بسعر ${price}${saving}.\n\nبعد الموافقة، انتقل إلى تبويب "فرص الشراء الذكي" لإتمام الطلب مباشرةً من البورصة الدوائية.`
  }
  if (approval.subjectType === 'recommendation') {
    const recType = (p.recType as string | undefined) ?? ''
    switch (recType) {
      case 'reorder': {
        const qty      = p.suggestedReorderQty ?? p.deficit ?? '؟'
        const supplier = p.supplierName ?? 'أفضل مورد متاح'
        return `سيتم إنشاء مسودة طلب شراء من ${supplier} بكمية ${qty} وحدة.\n\nستجدها في صفحة المشتريات بانتظار مراجعتك النهائية قبل الإرسال للمورد.`
      }
      case 'smart_procurement': {
        const price = p.p2pPrice ? `${Number(p.p2pPrice).toFixed(2)} جنيه` : '؟'
        const saving = p.savingsPct > 0 ? ` (توفير ${p.savingsPct}%)` : ''
        return `سيتم توجيهك فوراً إلى سوق البورصة الدوائية لشراء هذا المنتج بسعر ${price}${saving}.\n\nالشراء عبر P2P أسرع وأوفر من الموردين التقليديين.`
      }
      case 'p2p_listing_suggestion':
      case 'dead_stock_alert': {
        const disc = p.discountPct ?? p.suggestedDiscountPct ?? 10
        return `سيتم إدراج المنتج تلقائياً في البورصة الدوائية بخصم ${disc}%.\n\nستجده تحت "قوائم البيع" في صفحة P2P.`
      }
      case 'expired_quarantine':
        return 'سيتم تصفير كمية هذا المنتج فوراً وعزله من المخزون النشط.\n\nتأكد أن هذا الإجراء صحيح — لا يمكن التراجع عنه.'
      case 'price_comparison':
        return 'سيتم تسجيل ملاحظة بمقارنة الأسعار بين الموردين.\n\nلا يوجد إجراء تلقائي — يمكنك فتح كتالوج الموردين لمقارنة الأسعار يدوياً.'
      case 'alternative':
        return 'سيتم تسجيل إشعار بتوافر بديل مناسب.\n\nلا يوجد إجراء تلقائي — يمكنك مراجعة بدائل المنتج في كتالوج الموردين.'
      case 'consumption_spike':
        return 'سيتم تسجيل إشعار بالارتفاع المفاجئ في الاستهلاك.\n\nراجع مستوى المخزون وفكر في تسريع أمر الشراء التالي.'
      case 'forecast_alert':
        return 'سيتم تسجيل تنبيه توقعات الطلب.\n\nلا يوجد إجراء تلقائي — راجع تحليلات التوقعات لمزيد من التفاصيل.'
      case 'reorder_schedule':
        return 'سيتم تسجيل تذكير بموعد إعادة الطلب المقرر.\n\nتوجّه إلى لوحة المشتريات لمتابعة الجدول الزمني.'
      case 'insufficient_data':
        return 'سيتم تسجيل إشعار بنقص البيانات التاريخية.\n\nمع تراكم بيانات المبيعات (28 يوماً+) ستصبح التوصيات أكثر دقة.'
      default:
        return 'سيقوم النظام بتسجيل ملاحظة بهذه التوصية.\n\nراجع لوحة التحليلات لمزيد من التفاصيل.'
    }
  }
  if (approval.subjectType === 'procurement_draft') {
    const qty      = p.quantity ?? '؟'
    const supplier = p.supplierName ?? 'المورد'
    const price    = p.unitPrice ? `بسعر ${Number(p.unitPrice).toFixed(2)} ${p.currency ?? 'EGP'} للوحدة` : ''
    return `سيتم تأكيد طلب شراء ${qty} وحدة من ${supplier} ${price}.\n\nسيُرسل الطلب مباشرةً بعد موافقتك — ستجده في صفحة المشتريات.`
  }
  if (approval.subjectType === 'inventory_item') {
    const name = p.suggestedProductName ?? 'المنتج المقترح'
    return `سيتم ربط هذا الصنف بـ "${name}" في الكتالوج الموحد.\n\nستظهر بياناته في الفواتير والمخزون فوراً — يمكنك التحقق في صفحة إدارة المخزون.`
  }
  if (approval.subjectType === 'p2p_order_action') {
    const productName = (p as any)?.orderSummary?.productName ?? 'الطلب'
    const action      = (p as any)?.action as string
    if (action === 'cancel')        return `سيتم إلغاء طلب "${productName}" تلقائياً نيابةً عنك.\n\nسيتم إخطار الطرف الآخر وإعادة الكمية للمخزون.`
    if (action === 'complete')      return `سيتم تأكيد استلام طلب "${productName}" تلقائياً.\n\nستضاف الكميات لمخزونك فوراً.`
    if (action === 'remind_seller') return `سيتم إرسال تذكير للبائع بشحن طلب "${productName}".\n\nسيظهر الإشعار فوراً في واجهة الصيدلية البائعة.`
    return 'سيتم تنفيذ الإجراء المقترح على هذا الطلب.'
  }
  if (approval.subjectType === 'expiry_liquidation') {
    const qty         = (p as any)?.quantity ?? ''
    const productName = (p as any)?.productName ?? 'المنتج'
    const discountPct = (p as any)?.discountPct ?? ''
    const price       = Number((p as any)?.suggestedPrice)
    const days        = (p as any)?.daysToExpiry ?? ''
    const priceStr    = price > 0 ? `${price} ج.م` : 'سعر غير محدد — أدخله في حقل التعديل قبل الموافقة'
    return `سيتم فوراً إدراج ${qty} وحدة من "${productName}" في سوق التبادل كعرض تصفية بخصم ${discountPct}%.\nالسعر: ${priceStr}\n\nالمنتج ينتهي في ${days} يوم — الإدراج الآن يسترد قيمته قبل الهلاك التام.\n\nملاحظة: إن كانت هناك صيدليات مسجّلة في نفس المدينة ولديها طلب سابق على هذا المنتج أو مخزون منخفض منه، ستصلها إشعارات تلقائية (حتى 20 صيدلية).`
  }
  if (approval.subjectType === 'low_stock') {
    const productName = (p as any)?.productName ?? 'المنتج'
    const qty         = (p as any)?.quantity ?? 0
    const minThreshold = (p as any)?.minThreshold ?? 0
    const deficit     = (p as any)?.deficit ?? (minThreshold - qty)
    return `المخزون وصل للحد الأدنى: ${qty} وحدة متوفرة من أصل ${minThreshold} (عجز ${deficit} وحدة).\n\nعند الموافقة سيتحقق النظام من توفّر "${productName}" في البورصة الدوائية المحلية بسعر أفضل.\n\n• إن وُجد: ستُفتح لك صفحة السوق مباشرةً للشراء\n• إن لم يُوجد: ستُحوَّل لصفحة المشتريات لإنشاء طلب من المورد`
  }
  if (approval.subjectType === 'dead_stock_clearance') {
    const qty         = (p as any)?.quantity ?? ''
    const productName = (p as any)?.productName ?? 'المنتج'
    const discountPct = (p as any)?.suggestedDiscountPct ?? ''
    const urgency     = (p as any)?.urgencyScore ?? ''
    return `سيتم إدراج ${qty} وحدة من "${productName}" في سوق التبادل كعرض تصفية بخصم ${discountPct}%.\n\nالمنتج لم يتحرك لفترة طويلة (مستوى الخطر: ${urgency}/100).\n\nملاحظة: إن كانت هناك صيدليات مسجّلة في نفس المدينة ولديها طلب سابق على هذا المنتج أو مخزون منخفض، ستصلها إشعارات تلقائية (حتى 20 صيدلية).`
  }
  if (approval.subjectType === 'pos_shift_action') {
    const cashier  = p.cashierName ?? 'الكاشير'
    if (p.scenario === 'cash_mismatch') {
      const variance = Number(p.variance ?? 0).toFixed(2)
      const declared = Number(p.declaredBalance ?? 0).toFixed(2)
      const expected = Number(p.systemExpected ?? 0).toFixed(2)
      return `الموافقة هنا تعني تسجيل اطلاعك على الفرق النقدي في شفت ${cashier}.\n\nالمُعلن: ${declared} | المتوقع: ${expected} | الفرق: ${variance}\n\nلا إجراء تلقائي — يُنصح بمراجعة الكاشير وطلب توضيح.`
    }
    if (p.scenario === 'high_refund_rate') {
      const rate = Number(p.refundRate ?? 0).toFixed(1)
      return `الموافقة هنا تعني تسجيل اطلاعك على نسبة مرتجعات ${rate}% في شفت ${cashier}.\n\nراجع قائمة المرتجعات في سجل المبيعات للتحقق من صحتها.`
    }
    return 'سيتم تسجيل اطلاعك على هذا التنبيه.\n\nراجع سجل الشفت في نقطة البيع لمزيد من التفاصيل.'
  }
  return 'سيبدأ النظام تنفيذ الإجراء فوراً. هل أنت متأكّد؟'
}

interface ExecNav { message: string; linkLabel: string; linkHref: string }

function executionNav(approval: Approval, executionResult: any): ExecNav | null {
  if (!executionResult) return null

  if (executionResult.failed) return null

  if (executionResult.draftId) return {
    message:   'تم إنشاء مسودة طلب الشراء بنجاح ✓',
    linkLabel: 'عرض في صفحة المشتريات',
    linkHref:  '/pharmacy/procurement',
  }
  if (approval.subjectType === 'expiry_liquidation' && executionResult.listingId) return {
    message:   'تم نشر عرض التصفية في سوق التبادل — صيدليات قريبة تلقّت إشعاراً ✓',
    linkLabel: 'شاهد عرض التصفية',
    linkHref:  '/pharmacy/p2p?tab=sell',
  }
  if (approval.subjectType === 'dead_stock_clearance' && executionResult.listingId) return {
    message:   'تم نشر عرض تصفية المخزون الراكد في سوق التبادل ✓',
    linkLabel: 'شاهد عرضك في السوق',
    linkHref:  '/pharmacy/p2p?tab=sell',
  }
  if (approval.subjectType === 'low_stock') {
    if (executionResult.action === 'p2p_available') return {
      message:   `"${(approval.payload as any)?.productName ?? 'المنتج'}" متاح للشراء من صيدليات في مدينتك ✓`,
      linkLabel: 'اشترِ من البورصة الدوائية',
      linkHref:  executionResult.deepLink ?? `/pharmacy/p2p?tab=marketplace&productId=${(approval.payload as any)?.productId ?? ''}`,
    }
    if (executionResult.action === 'reorder') return {
      message:   `"${(approval.payload as any)?.productName ?? 'المنتج'}" غير متوفر في البورصة حالياً — أنشئ طلب شراء`,
      linkLabel: 'أنشئ طلب شراء',
      linkHref:  '/pharmacy/procurement',
    }
  }
  if (executionResult.listingId) return {
    message:   'تم إدراج المنتج في سوق تبادل الأدوية بنجاح ✓',
    linkLabel: 'عرض عروضك في السوق',
    linkHref:  '/pharmacy/p2p?tab=sell',
  }
  if (executionResult.quarantinedItemId) return {
    message:   'تم عزل المنتج وتصفير كميته من المخزون النشط ✓',
    linkLabel: 'عرض في إدارة المخزون',
    linkHref:  '/pharmacy/inventory',
  }
  if (executionResult.action === 'navigate_to_p2p_marketplace') return {
    message:   'موافقتك مسجّلة — توجّه الآن لإتمام الشراء من سوق الأدوية',
    linkLabel: 'اذهب لسوق الأدوية',
    linkHref:  executionResult.deepLink ?? '/pharmacy/p2p?tab=buy',
  }
  if (executionResult.note === 'already_listed') return {
    message:   'المنتج مدرج بالفعل في السوق — لا حاجة لإجراء إضافي ✓',
    linkLabel: 'عرض عروضك في السوق',
    linkHref:  '/pharmacy/p2p?tab=sell',
  }
  if (approval.subjectType === 'procurement_draft') return {
    message:   'تم تأكيد طلب الشراء بنجاح ✓',
    linkLabel: 'عرض في صفحة المشتريات',
    linkHref:  '/pharmacy/procurement',
  }
  if (approval.subjectType === 'inventory_item') return {
    message:   'تم ربط الصنف بالمنتج في الكتالوج الموحد ✓',
    linkLabel: 'عرض في إدارة المخزون',
    linkHref:  '/pharmacy/inventory',
  }
  if (approval.subjectType === 'p2p_order_action') {
    const orderId = (approval.payload as any)?.orderId as string | undefined
    const action  = (approval.payload as any)?.action as string
    const msgs: Record<string, string> = {
      cancel:        'تم إلغاء الطلب بنجاح ✓',
      complete:      'تم تأكيد الاستلام وإضافة الكميات للمخزون ✓',
      remind_seller: 'تم إرسال التذكير للبائع بنجاح ✓',
    }
    return {
      message:   msgs[action] ?? 'تم تنفيذ الإجراء ✓',
      linkLabel: 'عرض الطلب',
      linkHref:  `/pharmacy/p2p?tab=orders&highlight=${orderId ?? ''}`,
    }
  }
  if (approval.subjectType === 'pos_shift_action') {
    const p = approval.payload as any
    return {
      message:   executionResult.acknowledged
        ? `تم تسجيل اطلاعك على التنبيه ✓`
        : 'تم تسجيل المراجعة ✓',
      linkLabel: 'عرض سجل الشفتات',
      linkHref:  '/pharmacy/pos/shifts',
    }
  }
  if (executionResult.warning) return {
    message:   `تنبيه: ${String(executionResult.warning)}\n\nتم البحث في كتالوج الموردين والبورصة الدوائية ولم يُعثر على مصدر متاح. أضف هذا المنتج إلى كتالوج المورد المناسب ثم أعد المحاولة. ستظهر بطاقة موافقة جديدة في المزامنة التالية.`,
    linkLabel: 'اذهب إلى كتالوج الموردين',
    linkHref:  '/pharmacy/catalog',
  }
  if (executionResult.note === 'acknowledged') {
    const recType = (approval.payload?.recType as string | undefined) ?? ''
    const isProc = recType === 'reorder_schedule' || recType === 'forecast_alert'
    return {
      message:   'تم تسجيل ملاحظتك ✓\n\nهذه التوصية ذات طابع استشاري — لا إجراء تلقائي مطلوب.',
      linkLabel: isProc ? 'عرض لوحة المشتريات' : 'عرض التحليلات',
      linkHref:  isProc ? '/pharmacy/procurement' : '/pharmacy/analytics',
    }
  }
  if (executionResult.note === 'rec_not_found') return {
    message:   'تعذّر تنفيذ الإجراء — لم يُعثر على التوصية المرتبطة.',
    linkLabel: 'عودة إلى مركز الذكاء',
    linkHref:  '/pharmacy/ai-center',
  }
  return null
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
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-md mx-4 w-full p-5"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${toneIconBg}`}>
            <ToneIcon size={18} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-base mb-1">{state.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{state.body}</p>
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
      <TabBar
        tabs={TABS.map(tab => ({
          key: tab.key,
          labelAr: tab.labelAr,
          labelEn: tab.labelAr,
          icon: tab.icon,
          badge: tab.key === 'approvals' ? counts.data?.pending : undefined,
        }))}
        active={activeTab}
        onChange={setActiveTab}
        isRTL
        color="emerald"
      />

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

function MissedRevenueWidget() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['missed-demand-report', 7],
    queryFn: () => posApi.getMissedDemandReport(7),
    staleTime: 10 * 60_000,
    retry: false,
  })

  if (!data || data.totalMissedEntries === 0) return null

  const topProduct = data.topMissedProducts[0]

  return (
    <button
      onClick={() => navigate('/pharmacy/reports/missed-revenue')}
      className="w-full text-start p-4 rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white hover:shadow-md hover:border-rose-300 transition-all group flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
        <TrendingDown size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-rose-900">
          إيراد ضائع هذا الأسبوع: {data.topMissedProducts.length > 0
            ? data.totalEstimatedLoss.toLocaleString('ar-EG', { maximumFractionDigits: 0 }) + ' ج.م'
            : `${data.totalMissedEntries} طلب لم يُلَبَّ`}
        </p>
        <p className="text-[11px] text-rose-700/80 mt-0.5">
          {topProduct
            ? `أكثر المطلوبات: "${topProduct.productName}" (${topProduct.missCount} مرة)`
            : `${data.totalMissedEntries} طلب عميل لم تتمكن من تلبيته — شاهد التقرير`}
        </p>
      </div>
      <ChevronLeft size={14} className="text-rose-300 group-hover:text-rose-500 rtl:rotate-180 shrink-0" />
    </button>
  )
}

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

      {/* Expiry financial risk banner */}
      {data.expiryRiskEgp > 0 && (
        <div className="p-4 rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-900">
              قد تخسر {data.expiryRiskEgp.toLocaleString('ar-EG')} جنيه من مخزون سينتهي قريباً
            </p>
            <p className="text-[11px] text-red-700 mt-0.5">
              قيمة المخزون الذي سينتهي خلال 180 يوماً — عرضه في P2P أو بيعه بخصم يقلل الخسارة
            </p>
          </div>
          <button
            onClick={() => navigate('/pharmacy/p2p?tab=sell&preset=near_expiry')}
            className="shrink-0 px-3 py-1.5 text-[11px] font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors whitespace-nowrap"
          >
            أدرج للبيع ←
          </button>
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
              className="text-start p-4 rounded-2xl border border-gray-200 bg-white hover:shadow-md hover:border-gray-300 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${SEVERITY_ICON_BG[w.severity]}`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-2xl font-bold text-gray-900 leading-tight tabular-nums">{w.count.toLocaleString('ar-EG')}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">{w.titleAr}</div>
                </div>
                <ChevronLeft size={14} className="text-gray-300 group-hover:text-gray-500 rtl:rotate-180 shrink-0" />
              </div>
              {w.count === 0 && w.emptyMessageAr && (
                <div className="text-[10px] text-emerald-600 mt-2.5 flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  {w.emptyMessageAr}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Missed revenue insight widget */}
      <MissedRevenueWidget />

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
  const [statusFilter, setStatusFilter] = useState<'pending' | 'modified' | 'approved' | 'rejected' | 'failed' | 'all'>('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const qc = useQueryClient()
  const { toast, confirm } = useActions()

  const list = useQuery({
    queryKey: ['ai-center', 'approvals', statusFilter],
    queryFn:  async () => {
      // 'failed' is a synthetic client-side filter over status=executed.
      if (statusFilter === 'failed') {
        const r = await aiCenterApi.listApprovals({ status: 'executed', limit: 200 })
        return { ...r, data: r.data.filter(a => a.executionResult?.failed === true) }
      }
      return aiCenterApi.listApprovals(
        statusFilter === 'all' ? {} : { status: statusFilter }
      )
    },
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

  // Fallback: if the focused approval moved to a different status (e.g. pending→modified
  // after the user edits it), the filtered list won't contain it. Fetch individually so
  // the detail panel stays open and the user can still approve/reject.
  const focusedInList = list.data?.data.find(a => a.id === focusId)
  const needsFallback = !!focusId && list.isSuccess && !focusedInList
  const focusedFallback = useQuery({
    enabled: needsFallback,
    queryKey: ['ai-center', 'approval-single', focusId],
    queryFn:  () => aiCenterApi.getApproval(focusId!),
    staleTime: 5_000,
  })
  const focused = focusedInList
    ?? focusedFallback.data
    ?? (focusId ? (list.isLoading || focusedFallback.isLoading ? undefined : null) : undefined)

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
            { k: 'failed',   l: 'فشل التنفيذ' },
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
        <div className="font-medium text-gray-900 text-sm flex items-center gap-2 flex-wrap">
          <span className="truncate">{approval.title}</span>
          {approval.subjectType === 'recommendation' && (
            <RecommendationTypeBadge title={approval.title} />
          )}
          {approval.status === 'executed' && approval.executionResult?.failed && (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 text-[10px] font-semibold">
              <AlertOctagon size={10} />
              فشل التنفيذ
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{approval.summary}</div>
        {approval.status === 'executed' && approval.executionResult?.failed && (
          <div className="text-[11px] text-red-700 mt-1 line-clamp-1">
            السبب: {String(approval.executionResult.error ?? 'غير معروف')}
          </div>
        )}
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
  const navigate = useNavigate()
  const { toast, confirm } = useActions()
  const [note, setNote] = useState('')
  const [showModify, setShowModify] = useState(false)
  const [execNav, setExecNav] = useState<ExecNav | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  // Snapshot the last non-null approval so the celebration modal can still
  // reference it after qc.invalidateQueries makes the approval go null.
  const lastApprovalRef = useRef<Approval | null>(null)
  if (approval) lastApprovalRef.current = approval

  const events = useQuery({
    enabled: !!approval,
    queryKey: ['ai-center', 'approval-events', approval?.id],
    queryFn:  () => aiCenterApi.getApprovalEvents(approval!.id),
  })

  const approve = useMutation({
    mutationFn: () => aiCenterApi.approve(approval!.id, note || undefined),
    onSuccess: () => {
      const approvalSnap = approval!
      toast('info', 'جارٍ تنفيذ الإجراء…')
      setNote(''); setShowModify(false)

      let tries = 0
      const poll = async () => {
        tries++
        try {
          const fresh = await aiCenterApi.getApproval(approvalSnap.id)
          if (fresh.status === 'executed' && fresh.executionResult?.failed) {
            toast('error', `لم يتمكّن النظام من تنفيذ القرار: ${String(fresh.executionResult.error ?? 'سبب غير معروف')}`)
            qc.invalidateQueries({ queryKey: ['ai-center'] })
            return
          }
          if (fresh.status === 'executed') {
            const nav = executionNav(approvalSnap, fresh.executionResult)
            // Invalidate AFTER setting nav so the list query re-fetch doesn't
            // clear the focused approval before the success panel can render.
            if (nav) {
              setExecNav(nav)
              setShowCelebration(true)
            } else {
              toast('success', 'تم التنفيذ بنجاح ✓')
            }
            qc.invalidateQueries({ queryKey: ['ai-center'] })
            return
          }
        } catch { /* network blip — keep polling */ }
        if (tries < 8) setTimeout(poll, 1_000)
      }
      setTimeout(poll, 800)
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

  // Celebration modal must render BEFORE null guards: after qc.invalidateQueries
  // the approval prop goes null, but lastApprovalRef still holds the snapshot.
  if (showCelebration && execNav && lastApprovalRef.current) {
    return (
      <ExecutionCelebrationModal
        nav={execNav}
        approval={lastApprovalRef.current}
        onClose={() => setShowCelebration(false)}
      />
    )
  }

  if (approval === undefined) {
    return (
      <div className="hidden lg:flex items-center justify-center bg-white rounded-2xl border border-gray-200 border-dashed text-gray-400 text-sm">
        اختر قراراً من القائمة لعرض التفاصيل
      </div>
    )
  }
  if (approval === null && execNav) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-4 bg-emerald-50 space-y-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-emerald-900 leading-relaxed whitespace-pre-line">{execNav.message}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setExecNav(null); navigate(execNav.linkHref) }}
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 flex items-center justify-center gap-2"
            >
              <ChevronLeft size={15} />
              {execNav.linkLabel}
            </button>
            <button
              onClick={() => { setExecNav(null); onClose() }}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
            >
              إغلاق
            </button>
          </div>
        </div>
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
    <>
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

      {execNav && (
        <div className="border-t border-emerald-100 p-4 bg-emerald-50 space-y-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-emerald-900 leading-relaxed">{execNav.message}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setExecNav(null); navigate(execNav.linkHref) }}
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 flex items-center justify-center gap-2"
            >
              <ChevronLeft size={15} />
              {execNav.linkLabel}
            </button>
            <button
              onClick={() => setExecNav(null)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {canDecide && !execNav && (
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
                confirm({
                  title: 'ماذا سيحدث عند الموافقة؟',
                  body:  approvalActionDescription(approval),
                  confirmLabel: 'تأكيد الموافقة وتنفيذ',
                  tone: approval.priority === 'critical' ? 'warning' : 'primary',
                  onConfirm: () => approve.mutate(),
                })
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
    </>
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

function subjectTypeLabelAr(t: string): string {
  switch (t) {
    case 'recommendation':      return 'توصية مخزون'
    case 'procurement_draft':   return 'طلب شراء'
    case 'inventory_item':      return 'ربط منتج'
    case 'smart_procurement':   return 'فرصة شراء ذكية P2P'
    case 'listing_suggestion':  return 'اقتراح إدراج P2P'
    case 'expired_quarantine':  return 'عزل منتهي صلاحية'
    case 'order':               return 'طلب'
    default:                    return t
  }
}

function agentCodeLabelAr(code: string): string {
  switch (code) {
    case 'inventory_expert':   return 'خبير المخزون'
    case 'purchase_expert':    return 'خبير الشراء'
    case 'catalog_expert':     return 'خبير الكاتالوج'
    case 'pricing_expert':     return 'خبير التسعير'
    case 'expiry_expert':      return 'خبير الصلاحيات'
    case 'compliance_expert':  return 'خبير الامتثال'
    default:                   return code
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// AGENTS TAB
// ═════════════════════════════════════════════════════════════════════════════

function AgentsTab() {
  const qc = useQueryClient()
  const { toast } = useActions()
  const list = useQuery({ queryKey: ['ai-center', 'agents'], queryFn: aiCenterApi.listAgents })
  const usage = useQuery({
    queryKey: ['ai-center', 'token-usage', 'today'],
    queryFn:  aiCenterApi.tokenUsageToday,
    refetchInterval: 60_000,
  })
  const [definitionCode, setDefinitionCode] = useState<string | null>(null)

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
      <TokenBudgetBanner usage={usage.data} loading={usage.isLoading} />

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
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDefinitionCode(a.code)}
                            title="عرض تعليمات المساعد"
                            className="p-1 rounded-md text-gray-400 hover:text-violet-700 hover:bg-violet-50 transition"
                          >
                            <Settings size={14} />
                          </button>
                          <ToggleSwitch
                            checked={a.enabled}
                            disabled={dimmed || toggle.isPending}
                            onChange={() => toggle.mutate(a)}
                          />
                        </div>
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

      {definitionCode && (
        <AgentDefinitionDrawer
          code={definitionCode}
          onClose={() => setDefinitionCode(null)}
        />
      )}
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

// ── Agent definition drawer (PRD §13 Phase 4a-1) ──────────────────────────

function AgentDefinitionDrawer({ code, onClose }: { code: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useActions()
  const q = useQuery<AgentDefinition>({
    queryKey: ['ai-center', 'agent-definition', code],
    queryFn:  () => aiCenterApi.getAgentDefinition(code),
  })

  const [prompt, setPrompt] = useState<string>('')
  const [schemaText, setSchemaText] = useState<string>('')
  const [dirty, setDirty] = useState(false)

  // Seed local state once data arrives
  useMemo(() => {
    if (q.data && !dirty) {
      setPrompt(q.data.systemPromptAr ?? '')
      setSchemaText(JSON.stringify(q.data.outputSchema ?? {}, null, 2))
    }
  }, [q.data, dirty])

  const save = useMutation({
    mutationFn: () => {
      let outputSchema: Record<string, any>
      try {
        outputSchema = JSON.parse(schemaText || '{}')
      } catch {
        throw new Error('صيغة JSON غير صحيحة في مخطط الإخراج.')
      }
      return aiCenterApi.updateAgentDefinition(code, {
        systemPromptAr: prompt.trim() === '' ? null : prompt,
        outputSchema,
      })
    },
    onSuccess: () => {
      toast('success', 'تم حفظ تعليمات المساعد. تم رفع رقم الإصدار للسجل التدقيقي.')
      setDirty(false)
      qc.invalidateQueries({ queryKey: ['ai-center', 'agent-definition', code] })
      qc.invalidateQueries({ queryKey: ['ai-center', 'agents'] })
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? e?.message ?? 'تعذّر الحفظ.'
      toast('error', typeof msg === 'string' ? msg : 'تعذّر الحفظ.')
    },
  })

  const def = q.data
  const isBuiltIn = def?.tenantScope === 'global'

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative ms-auto w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">
              {def ? `تعليمات ${def.nameAr}` : 'تحميل…'}
            </h2>
            {def && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                <span className="font-mono">{def.code}</span>
                <span>·</span>
                <span>الإصدار {def.version}</span>
                {isBuiltIn && (
                  <>
                    <span>·</span>
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">مدمج</span>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        {q.isLoading && (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <Loader2 className="animate-spin" size={20} />
          </div>
        )}

        {q.error && (
          <div className="m-6 p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-900">
            تعذّر تحميل التعليمات — {q.error instanceof Error ? q.error.message : 'حاول لاحقاً.'}
          </div>
        )}

        {def && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {isBuiltIn && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 leading-relaxed">
                هذا مساعد مدمج. التعديل يتطلّب صلاحية مسؤول النظام.
                للتخصيص المحلي لصيدليتك، أنشئ نسخة خاصة (متاح في الإصدار القادم).
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                تعليمات النظام (System Prompt — عربي)
              </label>
              <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
                النص الذي يُرسل إلى نموذج الذكاء الاصطناعي في بداية كل محادثة. يُستخدم لتعريف شخصية المساعد وحدود عمله.
                كل تعديل يرفع رقم الإصدار ويُختم على كل قرار في سجل التدقيق.
              </p>
              <textarea
                value={prompt}
                onChange={e => { setPrompt(e.target.value); setDirty(true) }}
                rows={10}
                dir="rtl"
                placeholder="مثال: أنت خبير مخزون صيدليات. مهمتك اقتراح إعادة الطلب…"
                className="w-full px-3 py-2 text-sm font-mono leading-relaxed border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <div className="mt-1 text-[10px] text-gray-400 text-right">
                {prompt.length} حرف
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                مخطط الإخراج (JSON Schema)
              </label>
              <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
                يُستخدم للتحقق من مخرجات النموذج قبل إنشاء طلب موافقة. اتركه فارغاً <code>{'{}'}</code> لتعطيل التحقق.
              </p>
              <textarea
                value={schemaText}
                onChange={e => { setSchemaText(e.target.value); setDirty(true) }}
                rows={8}
                dir="ltr"
                spellCheck={false}
                className="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>

            <div className="text-[11px] text-gray-500 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
              <div><span className="text-gray-400">نوع المخرج:</span> {def.outputSubjectType ?? '—'}</div>
              <div><span className="text-gray-400">حد الثقة:</span> {Math.round(def.minConfidence * 100)}%</div>
            </div>
          </div>
        )}

        {def && (
          <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md text-gray-700 hover:bg-gray-200"
            >
              إغلاق
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
              className="px-4 py-1.5 text-sm rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {save.isPending && <Loader2 className="animate-spin" size={14} />}
              حفظ ورفع الإصدار
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TokenBudgetBanner({
  usage, loading,
}: {
  usage:   import('../../api/ai-center.api').TokenUsageToday | undefined
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-2" />
        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
      </div>
    )
  }
  if (!usage) return null

  const fmt = (n: number) => n.toLocaleString('ar-EG')
  const danger  = usage.percent >= 90
  const warn    = usage.percent >= 70 && !danger
  const ok      = !warn && !danger

  const toneBar = danger ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-emerald-500'
  const toneBg  = danger ? 'border-red-200 bg-red-50' :
                  warn   ? 'border-amber-200 bg-amber-50' :
                           'border-emerald-200 bg-emerald-50'
  const toneText = danger ? 'text-red-900' : warn ? 'text-amber-900' : 'text-emerald-900'

  return (
    <div className={`rounded-2xl border ${toneBg} p-4`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Zap size={16} className={toneText} />
          <h3 className={`text-sm font-semibold ${toneText}`}>استهلاك الذكاء الاصطناعي اليوم</h3>
          <Tooltip text="حدّ يومي على رموز الإخراج (Output Tokens) لكل صيدلية — يحمي من أي استهلاك غير متوقع. يعاد ضبطه تلقائياً عند منتصف الليل بتوقيت UTC.">
            <Info size={12} className={`${toneText} opacity-60 cursor-help`} />
          </Tooltip>
        </div>
        <div className={`text-xs font-medium ${toneText} tabular-nums`}>
          {fmt(usage.outputTokens)} / {fmt(usage.cap)} رمز ({usage.percent}٪)
        </div>
      </div>

      <div className="h-2 rounded-full bg-white/70 overflow-hidden mb-2">
        <div className={`h-full ${toneBar} transition-all`} style={{ width: `${Math.min(100, usage.percent)}%` }} />
      </div>

      <div className={`flex items-center justify-between text-[11px] ${toneText} opacity-80`}>
        <span>{fmt(usage.calls)} استدعاء · مُدخَل: {fmt(usage.inputTokens)}</span>
        <span>
          {danger ? '⚠️ اقترب من الحدّ اليومي — قد يتحول النظام إلى وضع القواعد فقط.' :
           warn   ? 'استهلاك مرتفع — راقب نشاط المساعدين.' :
           ok     ? `متبقي: ${fmt(usage.remaining)} رمز اليوم.` : ''}
        </span>
      </div>
    </div>
  )
}

function ToggleSwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {  return (
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
  const [view, setView] = useState<'decisions' | 'runs'>('decisions')
  const [days, setDays] = useState<7 | 30>(7)

  const events = useInfiniteList<ApprovalEvent>({
    queryKey: ['ai-center', 'audit', 'events'],
    fetchPage: ({ limit, offset }) => aiCenterApi.approvalEvents(limit, offset),
  })
  const stats = useQuery({
    queryKey: ['ai-center', 'audit', 'ai-stats', days],
    queryFn:  () => aiCenterApi.aiRunStats(days),
  })
  const runs = useInfiniteList<any>({
    queryKey: ['ai-center', 'audit', 'ai-runs'],
    fetchPage: ({ limit, offset }) => aiCenterApi.aiRuns(limit, offset),
    enabled:  view === 'runs',
  })

  const fmtNum = (n: number) => n.toLocaleString('ar-EG')
  const fmtMs  = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)} ث` : `${n} مللي`

  return (
    <div className="space-y-5">
      {/* AI generation stats banner */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-violet-600" />
            <h2 className="text-base font-semibold text-gray-900">أداء مساعديك الأذكياء</h2>
            <Tooltip text="مقاييس استدعاءات الذكاء الاصطناعي خلال الفترة المختارة. تساعدك على التحقق من سلامة وكفاءة عمل المساعدين.">
              <Info size={13} className="text-gray-400 cursor-help" />
            </Tooltip>
          </div>
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setDays(7)}
              className={`px-3 py-1 rounded-md text-xs font-medium ${days === 7 ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >آخر ٧ أيام</button>
            <button
              onClick={() => setDays(30)}
              className={`px-3 py-1 rounded-md text-xs font-medium ${days === 30 ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >آخر ٣٠ يوم</button>
          </div>
        </div>

        {stats.isLoading ? (
          <div className="p-5"><SkeletonRows /></div>
        ) : stats.data ? (
          stats.data.totalRuns === 0 ? (
            <div className="p-8 text-center">
              <Activity size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-700">لا توجد استدعاءات للذكاء الاصطناعي في هذه الفترة</p>
              <p className="text-xs text-gray-500 mt-1">
                المعدّاد صفر لأنه لم يتم تشغيل أي توصية خلال آخر {days} أيام — وليس بسبب خلل.
                شغّل توصية من تبويب “التوصيات” لتظهر القياسات هنا.
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 p-4">
            <StatCard label="إجمالي العمليات" value={fmtNum(stats.data.totalRuns)}        icon={Activity}     tone="violet" />
            <StatCard label="ناجحة"          value={fmtNum(stats.data.success)}          icon={CheckCircle2} tone="emerald" />
            <StatCard label="فشلت"           value={fmtNum(stats.data.failed)}           icon={XCircle}      tone="red" />
            <StatCard label="مُحجوبة"         value={fmtNum(stats.data.blocked)}          icon={Ban}          tone="amber"
              hint="استدعاءات منعتها بوابة الأمان (محتوى مرفوض، أو تجاوز حدود الاستهلاك)." />
            <StatCard label="متوسط الزمن"     value={fmtMs(stats.data.avgLatencyMs)}      icon={Clock}        tone="sky"
              hint={`P95: ${fmtMs(stats.data.p95LatencyMs)} — أبطأ ٥٪ من الاستدعاءات.`} />
            <StatCard label="رموز مُنتَجة"    value={fmtNum(stats.data.totalOutputTokens)} icon={Zap}          tone="fuchsia"
              hint={`المُدخَلة: ${fmtNum(stats.data.totalInputTokens)} — إجمالي رموز الإخراج هو ما يُحاسَب عليه عادةً.`} />
          </div>
          )
        ) : null}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-violet-600" />
            <h2 className="text-base font-semibold text-gray-900">السجل الكامل (شفافية تامة)</h2>
          </div>
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('decisions')}
              className={`px-3 py-1 rounded-md text-xs font-medium ${view === 'decisions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >قرارات الاعتماد</button>
            <button
              onClick={() => setView('runs')}
              className={`px-3 py-1 rounded-md text-xs font-medium ${view === 'runs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >استدعاءات الذكاء</button>
          </div>
        </div>

        {view === 'decisions' ? (
          events.isLoading ? <SkeletonRows /> :
          events.items.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              iconCls="bg-violet-100 text-violet-700"
              title="السجل فارغ"
              body="عندما يقترح مساعدوك إجراءات وتتخذ قرارات بشأنها، ستظهر هنا — كل خطوة، كل قرار، كل تعديل."
            />
          ) : (
            <ul className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
              {events.items.map(ev => (
                <li key={ev.id} className="px-5 py-3 text-sm flex items-start gap-3">
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    ev.toStatus === 'approved'    ? 'bg-emerald-500' :
                    ev.toStatus === 'rejected'    ? 'bg-red-500' :
                    ev.toStatus === 'modified'    ? 'bg-amber-500' :
                    ev.toStatus === 'executed'    ? 'bg-violet-500' :
                    ev.toStatus === 'expired'     ? 'bg-gray-400' :
                                                    'bg-sky-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    {/* WHAT — subject of the decision (title + type pill) */}
                    {ev.approvalTitle && (
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-gray-900 text-xs truncate">{ev.approvalTitle}</span>
                        {ev.approvalSubjectType && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 border border-gray-200 shrink-0">
                            {subjectTypeLabelAr(ev.approvalSubjectType)}
                          </span>
                        )}
                        {ev.approvalPriority && ev.approvalPriority !== 'medium' && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border shrink-0 ${PRIORITY_STYLE[ev.approvalPriority]}`}>
                            {PRIORITY_LABEL_AR[ev.approvalPriority]}
                          </span>
                        )}
                      </div>
                    )}
                    {/* WHO + ACTION */}
                    <div className="text-gray-700 text-[11px]">
                      {transitionLabelAr(ev.fromStatus, ev.toStatus, ev.actorType)}
                      {ev.agentCode && (
                        <span className="text-gray-400"> · {agentCodeLabelAr(ev.agentCode)}</span>
                      )}
                    </div>
                    {/* PAYLOAD DIFF (modified events) */}
                    {ev.payloadDiff && Object.keys(ev.payloadDiff).length > 0 && (
                      <div className="mt-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                        {Object.entries(ev.payloadDiff).slice(0, 3).map(([k, v]) => (
                          <div key={k} className="truncate">
                            <span className="font-medium">{k}:</span> {JSON.stringify(v.from)} → {JSON.stringify(v.to)}
                          </div>
                        ))}
                      </div>
                    )}
                    {ev.note && (
                      <div className="text-gray-500 text-[11px] mt-0.5 italic">«{ev.note}»</div>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                      <span>{new Date(ev.createdAt).toLocaleString('ar-EG')}</span>
                      <span>·</span>
                      <span className="font-mono text-gray-300">#{ev.approvalId.slice(0, 8)}</span>
                    </div>
                  </div>
                </li>
              ))}
              <li>
                <InfiniteScrollSentinel
                  hasNextPage={events.hasNextPage}
                  isFetchingNextPage={events.isFetchingNextPage}
                  onLoadMore={() => events.fetchNextPage()}
                />
              </li>
            </ul>
          )
        ) : (
          // RUNS view
          runs.isLoading ? <SkeletonRows /> :
          runs.items.length === 0 ? (
            <EmptyState
              icon={Activity}
              iconCls="bg-violet-100 text-violet-700"
              title="لم تُسجَّل أي استدعاءات بعد"
              body="ستظهر هنا تفاصيل كل استدعاء للذكاء الاصطناعي: الحالة، الزمن، الرموز المستهلكة، والإصدار المستخدم."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-start px-4 py-2.5 font-medium">الوقت</th>
                    <th className="text-start px-4 py-2.5 font-medium">الحالة</th>
                    <th className="text-start px-4 py-2.5 font-medium">الإصدار</th>
                    <th className="text-start px-4 py-2.5 font-medium">التوصيات</th>
                    <th className="text-start px-4 py-2.5 font-medium">الزمن</th>
                    <th className="text-start px-4 py-2.5 font-medium">المُدخَل / المُخرَج</th>
                    <th className="text-start px-4 py-2.5 font-medium">حُجِب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runs.items.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-2.5">
                        <RunStatusBadge status={r.status} />
                        {r.errorMessage && (
                          <Tooltip text={r.errorMessage}>
                            <span className="ms-1.5 text-[10px] text-red-600 underline cursor-help">السبب</span>
                          </Tooltip>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono text-[10px]">{r.promptVersion}</td>
                      <td className="px-4 py-2.5 text-gray-700 tabular-nums">{r.recommendationsGenerated}</td>
                      <td className="px-4 py-2.5 text-gray-700 tabular-nums">{fmtMs(r.latencyMs)}</td>
                      <td className="px-4 py-2.5 text-gray-600 tabular-nums">
                        {fmtNum(r.inputTokens)} / <span className="text-fuchsia-700 font-medium">{fmtNum(r.outputTokens)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 tabular-nums">
                        {r.outputsBlocked > 0
                          ? <span className="text-amber-700 font-medium">{r.outputsBlocked}</span>
                          : <span className="text-gray-300">٠</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <InfiniteScrollSentinel
                hasNextPage={runs.hasNextPage}
                isFetchingNextPage={runs.isFetchingNextPage}
                onLoadMore={() => runs.fetchNextPage()}
              />
            </div>
          )
        )}
      </div>
    </div>
  )
}

function StatCard({
  label, value, icon: Icon, tone, hint,
}: {
  label: string
  value: string
  icon:  React.ComponentType<any>
  tone:  'violet' | 'emerald' | 'red' | 'amber' | 'sky' | 'fuchsia'
  hint?: string
}) {
  const tones: Record<string, string> = {
    violet:  'bg-violet-50 text-violet-700 border-violet-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    sky:     'bg-sky-50 text-sky-700 border-sky-200',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  }
  const inner = (
    <div className={`rounded-xl border p-3 min-w-0 ${tones[tone]} ${hint ? 'cursor-help' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <Icon size={14} />
        {hint && <Info size={11} className="opacity-50" />}
      </div>
      <div className="text-[11px] opacity-80 mb-0.5 truncate">{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight truncate">{value}</div>
    </div>
  )
  return hint ? <Tooltip text={hint} block>{inner}</Tooltip> : inner
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { ar: string; cls: string }> = {
    success:        { ar: 'ناجح',         cls: 'bg-emerald-100 text-emerald-700' },
    failed:         { ar: 'فشل',          cls: 'bg-red-100 text-red-700' },
    blocked_input:  { ar: 'حُجب الإدخال', cls: 'bg-amber-100 text-amber-700' },
    blocked_output: { ar: 'حُجب الإخراج', cls: 'bg-amber-100 text-amber-700' },
    rate_limited:   { ar: 'تجاوز الحدّ',  cls: 'bg-orange-100 text-orange-700' },
  }
  const m = map[status] ?? { ar: status, cls: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m.cls}`}>
      {m.ar}
    </span>
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

function Tooltip({ text, children, block = false }: { text?: string; children: React.ReactNode; block?: boolean }) {
  if (!text) return <>{children}</>
  // `block=true` is for callers that wrap a full-width card (the StatCard
  // grid). The default is inline-block so wrapping a small icon next to a
  // heading does not push the heading to a new line.
  return (
    <span className={`relative group ${block ? 'inline-block w-full' : 'inline-block align-middle'}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute z-50 bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-[10.5px] leading-snug w-max max-w-[220px] whitespace-normal text-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
      >
        {text}
      </span>
    </span>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ─── Celebration modal shown after successful AI task execution ───────────────
function ExecutionCelebrationModal({ nav, approval, onClose }: {
  nav:      ExecNav
  approval: Approval
  onClose:  () => void
}) {
  const navigate = useNavigate()
  const p = (approval.payload ?? {}) as any

  // Build a human-friendly summary of what was accomplished
  const lines: string[] = []
  if (approval.subjectType === 'expiry_liquidation') {
    if (p.quantity)    lines.push(`${p.quantity} وحدة تم إدراجها للبيع`)
    if (p.discountPct) lines.push(`خصم ${p.discountPct}%`)
    if (p.suggestedPrice > 0) lines.push(`بسعر ${p.suggestedPrice} ج.م`)
  } else if (approval.subjectType === 'procurement_draft') {
    if (p.quantity) lines.push(`طلب ${p.quantity} وحدة`)
  } else if (approval.subjectType === 'listing_suggestion' || approval.subjectType === 'smart_procurement') {
    lines.push('تم إرسال العرض لسوق التبادل')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex items-center justify-center w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-100 mx-auto">
          <PartyPopper size={36} className="text-emerald-500" />
        </div>

        {/* Heading */}
        <div>
          <h2 className="text-xl font-bold text-gray-900">تم التنفيذ بنجاح 🎉</h2>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">{nav.message}</p>
        </div>

        {/* Stats pills */}
        {lines.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {lines.map((l, i) => (
              <span key={i} className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                {l}
              </span>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={() => { onClose(); navigate(nav.linkHref) }}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors"
          >
            <ExternalLink size={15} />
            {nav.linkLabel}
          </button>
          <button
            onClick={onClose}
            className="w-full px-5 py-2.5 rounded-2xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-type badge for "recommendation" approvals (risk tab) ─────────────────
function RecommendationTypeBadge({ title }: { title: string }) {
  if (title.startsWith('انتهاء قريب:'))
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Clock size={9} />انتهاء قريب</span>
  if (title.startsWith('مخزون راكد:'))
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200"><Archive size={9} />مخزون راكد</span>
  if (title.startsWith('خطر نفاد المخزون:'))
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200"><TrendingDown size={9} />خطر نفاد</span>
  return null
}

// MODIFY FORM — PRD §11 "تعديل قبل الموافقة": let the user override the AI's
// numeric proposal (qty, unit price, reorder qty) before approving, so the
// audit trail clearly distinguishes "AI suggestion" from "human-approved".
// ═════════════════════════════════════════════════════════════════════════════

const MODIFIABLE_SUBJECT_TYPES = new Set(['procurement_draft', 'recommendation', 'expiry_liquidation', 'dead_stock_clearance'])

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
    if (approval.subjectType === 'expiry_liquidation') {
      return {
        quantity:       String(p.quantity       ?? ''),
        discountPct:    String(p.discountPct    ?? ''),
        suggestedPrice: String(p.suggestedPrice ?? ''),
      }
    }
    if (approval.subjectType === 'dead_stock_clearance') {
      return {
        quantity:            String(p.quantity            ?? ''),
        suggestedDiscountPct: String(p.suggestedDiscountPct ?? ''),
      }
    }
    return {}
  })

  const set = (k: string, v: string) => {
    setFields(f => {
      const next = { ...f, [k]: v }
      // Auto-recalc suggestedPrice when discountPct changes (if basePrice is known)
      if (k === 'discountPct' && approval.subjectType === 'expiry_liquidation') {
        const base = Number((approval.payload as any)?.basePrice) || 0
        const disc = Number(v) || 0
        if (base > 0) next.suggestedPrice = (base * (1 - disc / 100)).toFixed(2)
      }
      return next
    })
  }

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
    : approval.subjectType === 'expiry_liquidation'
      ? [
          { key: 'quantity',       labelAr: 'الكمية المراد إدراجها', suffix: 'وحدة',
            help: 'يمكنك إدراج كمية أقل من المخزون الكلي إذا أردت الاحتفاظ ببعضه.' },
          { key: 'discountPct',    labelAr: 'نسبة الخصم',            suffix: '%',
            help: 'خصم أعلى = بيع أسرع. تغيير هذا الحقل يعيد احتساب السعر تلقائياً.' },
          { key: 'suggestedPrice', labelAr: 'سعر البيع للمشتري',     suffix: 'ج.م',
            help: 'السعر الفعلي الذي سيظهر للمشترين. أدخله يدوياً إذا لم يكن مسجلاً في المخزون.' },
        ]
    : approval.subjectType === 'dead_stock_clearance'
      ? [
          { key: 'quantity',             labelAr: 'الكمية المراد إدراجها', suffix: 'وحدة',
            help: 'يمكنك إدراج كمية أقل من المخزون الكلي إذا أردت الاحتفاظ ببعضه.' },
          { key: 'suggestedDiscountPct', labelAr: 'نسبة الخصم',            suffix: '%',
            help: 'خصم أعلى يزيد فرصة البيع. المخزون الراكد لا يملك موعداً للانتهاء، لذا الخصم المعقول يكفي.' },
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

type TaskKind = 'purchase' | 'linking' | 'risk' | 'p2p' | 'p2p_monitor' | 'pos_integrity' | 'expiry_clearance' | 'low_stock' | 'dead_stock'

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
    key: 'p2p',
    labelAr: 'فرص شراء ذكية',
    hintAr:  'صيدليات قريبة منك تبيع بأسعار أقل من مورّدك — النظام يكتشفها لك',
    subjectType: 'smart_procurement',
    icon: Store,
    tone:       'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50',
    toneActive: 'border-emerald-500 bg-emerald-100',
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
  {
    key: 'p2p_monitor',
    labelAr: 'طلبات تبادل الأدوية',
    hintAr:  'طلب شراء من صيدلية أخرى تأخر أو لم يرد عليه — قرارك ينهي الأمر',
    subjectType: 'p2p_order_action',
    icon: AlertTriangle,
    tone:       'border-orange-200 bg-orange-50/60 hover:bg-orange-50',
    toneActive: 'border-orange-500 bg-orange-100',
  },
  {
    key: 'pos_integrity',
    labelAr: 'سلامة الكاشير',
    hintAr:  'فوارق نقدية أو معدلات مرتجعات غير طبيعية تستوجب مراجعتك',
    subjectType: 'pos_shift_action',
    icon: ShieldCheck,
    tone:       'border-rose-200 bg-rose-50/60 hover:bg-rose-50',
    toneActive: 'border-rose-500 bg-rose-100',
  },
  {
    key: 'expiry_clearance',
    labelAr: 'تصفية قريبة الانتهاء',
    hintAr:  'منتجات تنتهي قريباً — أدرجها للبيع بخصم ذكي واسترد قيمتها قبل الهلاك',
    subjectType: 'expiry_liquidation',
    icon: Package,
    tone:       'border-amber-200 bg-amber-50/60 hover:bg-amber-50',
    toneActive: 'border-amber-500 bg-amber-100',
  },
  {
    key: 'low_stock',
    labelAr: 'نقص مخزون',
    hintAr:  'منتجات وصل مخزونها للحد الأدنى — قرّر: شراء من البورصة أو طلب من المورد',
    subjectType: 'low_stock',
    icon: AlertCircle,
    tone:       'border-red-200 bg-red-50/60 hover:bg-red-50',
    toneActive: 'border-red-500 bg-red-100',
  },
  {
    key: 'dead_stock',
    labelAr: 'مخزون راكد',
    hintAr:  'منتجات لا تتحرك — أدرجها في السوق بخصم لتسييل رأس المال المجمّد',
    subjectType: 'dead_stock_clearance',
    icon: Archive,
    tone:       'border-gray-200 bg-gray-50/60 hover:bg-gray-50',
    toneActive: 'border-gray-500 bg-gray-100',
  },
]

function TasksTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId   = searchParams.get('id')
  const taskParam = (searchParams.get('task') as TaskKind | null) ?? 'purchase'
  const setTask = (k: TaskKind) => setSearchParams({ tab: 'tasks', task: k })

  const def = TASK_DEFS.find(d => d.key === taskParam) ?? TASK_DEFS[0]

  // Counts per task type — fetch both pending + modified (both need user action).
  const allPending = useQuery({
    queryKey: ['ai-center', 'approvals', 'pending+modified', 'all'],
    queryFn:  async () => {
      const [p, m] = await Promise.all([
        aiCenterApi.listApprovals({ status: 'pending',  limit: 200 }),
        aiCenterApi.listApprovals({ status: 'modified', limit: 200 }),
      ])
      return { ...p, data: [...p.data, ...m.data], total: p.total + m.total }
    },
    refetchInterval: 30_000,
  })

  const counts: Record<TaskKind, number> = useMemo(() => {
    const c: Record<TaskKind, number> = { purchase: 0, linking: 0, risk: 0, p2p: 0, p2p_monitor: 0, pos_integrity: 0, expiry_clearance: 0, low_stock: 0, dead_stock: 0 }
    for (const a of allPending.data?.data ?? []) {
      const t = TASK_DEFS.find(d => d.subjectType === a.subjectType)?.key
      if (t) c[t]++
    }
    return c
  }, [allPending.data])

  const list = useQuery({
    queryKey: ['ai-center', 'approvals', 'pending+modified', def.subjectType],
    queryFn:  async () => {
      const [p, m] = await Promise.all([
        aiCenterApi.listApprovals({ status: 'pending',  subjectType: def.subjectType }),
        aiCenterApi.listApprovals({ status: 'modified', subjectType: def.subjectType }),
      ])
      return { ...p, data: [...p.data, ...m.data], total: p.total + m.total }
    },
    refetchInterval: 30_000,
  })

  const focused = list.data?.data.find(a => a.id === focusId)
    ?? (focusId ? (list.isLoading ? undefined : null) : undefined)

  return (
    <div className="space-y-5">
      {/* Task selector cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
            <span>
              {def.labelAr}
              {def.key === 'p2p'
                ? ' — قرارات الشراء الذكي'
                : ' — بانتظار قرارك'}
            </span>
          </div>
          {list.isLoading ? (
            <SkeletonRows />
          ) : (list.data?.data.length ?? 0) === 0 ? (
            def.key === 'p2p' ? (
              <div className="py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                  <Store size={22} className="text-emerald-600" />
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">لا توجد فرص شراء تنتظر قرارك الآن</p>
                <p className="text-xs text-gray-500 mb-4 max-w-[300px] mx-auto leading-relaxed">
                  يُحلل النظام مخزونك يومياً ويُنشئ قرارات عندما يجد فرصاً في البورصة أوفر بنسبة معينة من مورّديك.
                  يمكنك تصفح جميع الفرص المتاحة الآن مباشرةً في صفحة البورصة.
                </p>
                <a
                  href="/pharmacy/p2p?tab=insights"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors"
                >
                  <Store size={13} /> تصفح فرص الشراء الذكي
                </a>
              </div>
            ) : def.key === 'purchase' ? (
              <div className="py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto mb-3">
                  <ShoppingCart size={22} className="text-sky-600" />
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">لا توجد مهام شراء بانتظارك الآن</p>
                <p className="text-xs text-gray-500 mb-4 max-w-[320px] mx-auto leading-relaxed">
                  يراقب النظام مخزونك باستمرار ويُنشئ توصيات شراء تلقائياً عند قرب نفاد أي صنف أو اقتراب انتهاء صلاحيته.
                  التوصيات تصل هنا مع تفاصيل السعر والمورّد الأنسب — جاهزة لموافقتك بضغطة واحدة.
                </p>
                <a
                  href="/pharmacy/inventory"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-xl transition-colors"
                >
                  <ShoppingCart size={13} /> استعرض المخزون الحالي
                </a>
              </div>
            ) : def.key === 'linking' ? (
              <div className="py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-3">
                  <LinkIcon size={22} className="text-violet-600" />
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">جميع منتجاتك مُربوطة بالكتالوج الموحّد</p>
                <p className="text-xs text-gray-500 mb-4 max-w-[320px] mx-auto leading-relaxed">
                  عند إضافة أصناف جديدة للمخزون، يحاول النظام ربطها تلقائياً بكتالوج الأدوية.
                  إن وجد أصنافاً متشابهة تحتاج تأكيدك — للدمج أو الإبقاء منفصلة — ستظهر هنا لتقرر بنفسك.
                </p>
              </div>
            ) : def.key === 'risk' ? (
              <div className="py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3">
                  <AlertOctagon size={22} className="text-red-600" />
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">لا توجد تنبيهات مخزون الآن</p>
                <p className="text-xs text-gray-500 mb-4 max-w-[320px] mx-auto leading-relaxed">
                  يراقب النظام مستويات مخزونك يومياً. حين يصل صنف لحد التنبيه أو يقترب موعد انتهاء صلاحيته،
                  يُرسل تنبيهاً هنا في الوقت المناسب حتى لا يفاجئك نفاد أو خسارة.
                </p>
                <a
                  href="/pharmacy/inventory"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors"
                >
                  <AlertOctagon size={13} /> تفقّد حدود التنبيه في المخزون
                </a>
              </div>
            ) : def.key === 'p2p_monitor' ? (
              <div className="py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle size={22} className="text-orange-600" />
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">جميع طلبات التبادل تسير بانتظام</p>
                <p className="text-xs text-gray-500 mb-4 max-w-[320px] mx-auto leading-relaxed">
                  يراقب النظام طلبات الشراء بين الصيدليات تلقائياً كل 15 دقيقة.
                  إن تأخّر رد أو توقّف طلب دون مبرر، تصلك إشعار هنا مع خيار الإلغاء أو المتابعة — لا يمر شيء دون علمك.
                </p>
                <a
                  href="/pharmacy/p2p?tab=orders"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded-xl transition-colors"
                >
                  <AlertTriangle size={13} /> تصفح طلبات التبادل
                </a>
              </div>
            ) : (
              <EmptyState
                icon={CheckCircle2}
                iconCls="bg-emerald-100 text-emerald-700"
                title="لا توجد مهام في هذه الفئة"
                body="هذا يعني أن مساعدك أنجز ما يخص هذا النوع — أو أنه لم يجد ما يستدعي قراراً منك بعد."
              />
            )
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

