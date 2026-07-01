import { useState, useMemo, useRef, useEffect, createContext, useContext } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Inbox, Users, ShieldCheck,
  Sparkles, TrendingDown, TrendingUp, XCircle, AlertOctagon, Clock,
  Archive, Link as LinkIcon, ShoppingCart, Package,
  AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft,
  AlertCircle, Info, Loader2, X, Edit3,
  Store, Eye, RefreshCw, Activity, Ban, Zap, Settings,
  ShieldAlert, Banknote, PartyPopper, ExternalLink, Wallet,
  CalendarClock, BarChart3, FileText,
} from 'lucide-react'
import {
  aiCenterApi,
  type Approval, type ApprovalPriority, type DashboardWidget,
  type ConfidenceLabel, type ApprovalEvent, type Agent,
  type AgentDefinition,
  type TokenUsageBreakdownRow,
  type ReportPeriod, type ReportBucket,
} from '../../api/ai-center.api'
import { inventoryApi } from '../../api/inventory.api'
import { posApi } from '../../api/pos.api'
import { supplierApi } from '../../api/supplier.api'
import { procurementApi } from '../../api/procurement.api'
import { forecastingApi } from '../../api/forecasting.api'
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

const SEVERITY_HOVER: Record<DashboardWidget['severity'], string> = {
  danger:  'hover:bg-red-50 hover:border-red-200',
  warning: 'hover:bg-amber-50 hover:border-amber-200',
  info:    'hover:bg-sky-50 hover:border-sky-200',
  success: 'hover:bg-emerald-50 hover:border-emerald-200',
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
  return new Date(iso).toLocaleDateString('en-US')
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
    // Some legacy recommendations don't set recType but include `rulesTriggered`
    // or `suggestedReorderQty` — treat them as a reorder so the user sees the
    // real supplier-search behaviour instead of the vague default.
    const looksLikeReorder = !recType && (
      (Array.isArray(p.rulesTriggered) && p.rulesTriggered.includes('reorder')) ||
      p.suggestedReorderQty != null
    )
    const effective = looksLikeReorder ? 'reorder' : recType
    switch (effective) {
      case 'reorder': {
        const qty      = p.suggestedReorderQty ?? p.deficit ?? '؟'
        const product  = p.productName ?? 'هذا المنتج'
        const eco = p.economics as
          | { profitVelocity?: number; marginPct?: number | null; restockCost?: number; priorityTier?: string; priorityLabel?: string }
          | undefined
        let priorityHint = ''
        if (eco && (eco.profitVelocity != null || eco.restockCost != null)) {
          const tierEmoji = eco.priorityTier === 'high' ? '🔥' : eco.priorityTier === 'medium' ? '⭐' : '▫️'
          const parts: string[] = []
          if (eco.priorityLabel) parts.push(`${tierEmoji} ${eco.priorityLabel}`)
          if (eco.marginPct != null) parts.push(`هامش الربح: ${eco.marginPct}%`)
          if (eco.profitVelocity != null && eco.profitVelocity > 0) parts.push(`ربح يومي مُعرّض للضياع عند النفاد: ${eco.profitVelocity} ج.م/يوم`)
          if (eco.restockCost != null && eco.restockCost > 0) parts.push(`تكلفة إعادة الطلب: ${eco.restockCost} ج.م`)
          if (parts.length) priorityHint = `\n\n💡 أولوية الشراء عند ضيق السيولة:\n${parts.map((x) => `• ${x}`).join('\n')}`
        }
        return `سيبحث النظام عن أفضل مصدر لـ«${product}» بكمية ${qty} وحدة، بالترتيب:\n• البورصة الدوائية (P2P) إن وفّرت سعرًا أفضل\n• كتالوج الموردين المعتمدين لديك\n\n‏عند العثور على مصدر: تُنشَأ مسودة طلب شراء تلقائيًّا بانتظار موافقتك النهائية.\n‏إن لم يُعثر على مصدر: ستتلقّى تنبيهًا واضحًا بإضافة هذا المنتج إلى كتالوج أحد مورديك.${priorityHint}`
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
        return 'سيتم فورًا:\n• تصفير كمية هذا المنتج وعزله من المخزون النشط.\n• تسجيل خسارة بتكلفة الوحدة في الدفاتر المحاسبية.\n• إضافته إلى سجل إتلاف الدواء المنتهي للتدقيق لاحقًا.\n\n‏تبقّى تحت تصرّفك اتّخاذ خطوة تالية يدويًا:\n• فتح إجراء إرجاع للمورد إن سمحت سياسته\n• عرضه للإتلاف عبر جهة إتلاف دواء معتمدة\n\n‏تأكد أن الإجراء صحيح — لا يمكن التراجع عن تصفير الكمية.'
      case 'price_comparison':
        return 'سيتم تسجيل ملاحظة بمقارنة الأسعار بين الموردين.\n\nلا يوجد إجراء تلقائي — يمكنك فتح كتالوج الموردين لمقارنة الأسعار يدوياً.'
      case 'alternative':
        return 'سيتم تسجيل إشعار بتوافر بديل مناسب.\n\nلا يوجد إجراء تلقائي — يمكنك مراجعة بدائل المنتج في كتالوج الموردين.'
      case 'consumption_spike':
        return 'سيتم تسجيل إشعار بالارتفاع المفاجئ في الاستهلاك.\n\nراجع مستوى المخزون وفكر في تسريع أمر الشراء التالي.'
      case 'forecast_alert':
        return 'سيتم تسجيل تنبيه توقعات الطلب.\n\nلا يوجد إجراء تلقائي — راجع تحليلات التوقعات لمزيد من التفاصيل.'
      case 'reorder_schedule':
        return 'سيتم تسجيل تذكير بموعد إعادة الطلب المقرر.\n\nتوجّه إلى فواتير الشراء لمتابعة الجدول الزمني.'
      case 'insufficient_data':
        return 'سيتم تسجيل إشعار بنقص البيانات التاريخية.\n\nمع تراكم بيانات المبيعات (28 يوماً+) ستصبح التوصيات أكثر دقة.'
      default:
        return 'ستُسجَّل موافقتك على هذه التوصية دون تنفيذ تلقائي.\n\n‏لم يربط الذكاء إجراءً تلقائياً بهذا النوع بعد — ستظهر التوصية في سجل التوصيات لتراجعها يدوياً من تبويب التحليلات.'
    }
  }
  if (approval.subjectType === 'procurement_draft') {
    const qty      = p.quantity ?? '؟'
    const supplier = p.supplierName ?? 'المورد'
    const price    = p.unitPrice ? `بسعر ${Number(p.unitPrice).toFixed(2)} ${p.currency ?? 'EGP'} للوحدة` : ''
    return `سيتم إنشاء طلب شراء داخلي لـ ${qty} وحدة من ${supplier} ${price}.\n\nسيظهر الطلب في صفحة «المشتريات» بحالة «بانتظار الإرسال» — راجع تفاصيله وأرسله للمورد عبر القناة المتفق عليها (واتساب/بريد/منصة المورد).`
  }
  if (approval.subjectType === 'procurement_basket') {
    const items    = Array.isArray(p.items) ? p.items : []
    const supplier = p.supplierName ?? 'المورد'
    const subtotalN = Number(p.subtotal ?? 0)
    const subtotal = subtotalN.toFixed(2)
    const currency = p.currency ?? 'EGP'
    const lines    = items.slice(0, 5).map((it: any) => `• ${it.productName} × ${it.quantity}`).join('\n')
    const more     = items.length > 5 ? `\nو‌${items.length - 5} أصناف أخرى…` : ''
    const minOrder = Number(p.minOrderAmount ?? 0)
    const toMin    = Number(p.amountToMinimum ?? 0)
    const minHint  = minOrder > 0
      ? (p.belowMinimum
          ? `\n\n⚠️ الحد الأدنى لطلب هذا المورد هو ${minOrder.toFixed(2)} ${currency}. تنقصك ${toMin.toFixed(2)} ${currency} للوصول إليه — أضف أصنافاً أخرى لنفس المورد لتفادي رفض الطلب أو رسوم شحن إضافية.`
          : `\n\n✓ تجاوزتَ الحد الأدنى لطلب هذا المورد (${minOrder.toFixed(2)} ${currency}) — الطلب جاهز للإرسال في شحنة واحدة.`)
      : ''
    return `سيتم إنشاء طلب شراء واحد مدمج يشمل ${items.length} منتجات من ${supplier} بإجمالي ${subtotal} ${currency} (قبل الضريبة):\n\n${lines}${more}${minHint}\n\nسيظهر الطلب في صفحة «المشتريات» بحالة «بانتظار الإرسال» — راجع التفاصيل ثم أرسله للمورد عبر القناة المتفق عليها (واتساب/بريد/منصة المورد) لتأكيد الشحنة الواحدة.`
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

/** Plain-language "why this matters" per approval type — shown in the detail so
 * the pharmacist knows the value of acting, not just the action itself. */
function impactText(approval: Approval): string | null {
  switch (approval.subjectType) {
    case 'inventory_item':
      return 'سيُربط المنتج بقاعدة البيانات الموحّدة، فيصبح متاحاً للتنبؤ بالطلب والشراء الذكي، وتظهر بياناته بدقة في الفواتير والمخزون والتقارير.'
    case 'smart_procurement':
    case 'procurement_draft':
    case 'procurement_basket':
      return 'يتحوّل الاقتراح إلى طلب شراء جاهز للإرسال بأفضل سعر — توفير على الشراء ومنع نفاد الصنف.'
    case 'low_stock':
      return 'إعادة التوفير قبل أن ينفد الصنف — تحمي مبيعاتك ولا تفقد العميل.'
    case 'recommendation':
      return 'توصية تحمي مخزونك وربحك — تنفيذها يقلّل النفاد أو الركود ويحسّن قراراتك.'
    case 'expiry_liquidation':
    case 'dead_stock_clearance':
      return 'استرداد قيمة المخزون قبل أن يخسر صلاحيته أو يركد — تحويل الخسارة المحتملة إلى نقد.'
    case 'expired_quarantine':
      return 'عزل المنتَج المنتهي من المخزون النشط وتسجيل الخسارة بدقة في الدفاتر للتدقيق.'
    case 'p2p_order_action':
      return 'إنهاء حالة طلب عالق في سوق التبادل — لا يبقى أي طلب دون تصرّف.'
    case 'pos_shift_action':
      return 'حماية إيراداتك من الفروقات النقدية والأخطاء في الكاشير قبل أن تتراكم.'
    default:
      return null
  }
}

interface ExecNav { message: string; linkLabel: string; linkHref: string }

function executionNav(approval: Approval, executionResult: any): ExecNav | null {
  if (!executionResult) return null

  if (executionResult.failed) return null

  if (executionResult.draftId) return {
    message:   'تم إنشاء مسودة طلب الشراء بنجاح ✓',
    linkLabel: 'عرض في صفحة المشتريات',
    linkHref:  '/pharmacy/purchases/invoices',
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
      linkHref:  '/pharmacy/purchases/invoices',
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
    linkHref:  '/pharmacy/purchases/invoices',
  }
  if (approval.subjectType === 'procurement_basket') return {
    message:   'تم إنشاء طلب شراء مدمج بنجاح — جميع الأصناف في فاتورة واحدة ✓',
    linkLabel: 'عرض في صفحة المشتريات',
    linkHref:  '/pharmacy/purchases/invoices',
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
      linkLabel: isProc ? 'عرض فواتير الشراء' : 'عرض التحليلات',
      linkHref:  isProc ? '/pharmacy/purchases/invoices' : '/pharmacy/analytics',
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

type Tab = 'dashboard' | 'approvals' | 'report' | 'tasks' | 'agents' | 'audit'

const TABS: Array<{ key: Tab; labelAr: string; icon: React.ElementType; tip?: string }> = [
  { key: 'dashboard', labelAr: 'لوحة العمل',     icon: LayoutDashboard, tip: 'نظرة سريعة على أهم المؤشرات التشغيلية اليوم' },
  { key: 'approvals', labelAr: 'مركز الموافقات', icon: Inbox,           tip: 'كل ما يقترحه مساعدوك وينتظر قرارك' },
  { key: 'report',    labelAr: 'التقرير',         icon: BarChart3,       tip: 'ماذا أنجز مساعدوك، كم وفّروا، وما الذي فاتك' },
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
          ? `تمت مزامنة ${total} إشارة جديدة. القرارات التي تحتاج موافقتك تظهر كبطاقات مهام بالأسفل، أما تنبيهات نقص المخزون وقرب انتهاء الصلاحية والمخزون الراكد فتظهر في جرس الإشعارات وصفحة المخزون.`
          : `كل شيء محدّث — لا توجد إشارات جديدة تستدعي قراراً الآن. تنبيهات المخزون (إن وُجدت) تجدها في جرس الإشعارات وصفحة المخزون.`,
      )
      qc.invalidateQueries({ queryKey: ['ai-center'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
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
      {activeTab === 'report'    && <ReportTab />}
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

// ─── Seasonal demand banner (Hijri calendar — works with zero sales history) ──

const SEASON_CATEGORY_AR: Record<string, string> = {
  antibiotic: 'مضادات حيوية',
  antibiotics: 'مضادات حيوية',
  antidiarrheal: 'مضادات الإسهال',
  diarrhea: 'مضادات الإسهال',
  analgesic: 'مسكّنات',
  pain: 'مسكّنات',
  antimalarial: 'مضادات الملاريا',
  electrolyte: 'محاليل ومعالجة الجفاف',
  hydration: 'محاليل ومعالجة الجفاف',
  ors: 'محاليل الجفاف الفموية',
  iv: 'محاليل وريدية',
  wound: 'عناية بالجروح',
  antifungal: 'مضادات الفطريات',
  respiratory: 'أدوية الجهاز التنفسي',
  gi: 'أدوية الجهاز الهضمي',
  gastrointestinal: 'أدوية الجهاز الهضمي',
  antacid: 'مضادات الحموضة',
  digestive: 'أدوية الهضم',
  headache: 'أدوية الصداع',
  migraine: 'أدوية الشقيقة',
  vitamin: 'فيتامينات',
  supplement: 'مكمّلات غذائية',
  pediatric: 'أدوية الأطفال',
  antipyretic: 'خافضات الحرارة',
  antihistamine: 'مضادات الهيستامين',
  cough: 'أدوية السعال',
  cold: 'أدوية البرد',
  flu: 'أدوية الإنفلونزا',
}

interface SeasonCategory { category: string; multiplier: number; upliftPct: number }
interface SeasonInfo { event: string; arabicName: string; daysUntil?: number; categories: SeasonCategory[] }

function categoryLabelAr(key: string): string {
  return SEASON_CATEGORY_AR[key.toLowerCase()] ?? key
}

function SeasonalDemandBanner() {
  const { data } = useQuery({
    queryKey: ['seasonality-active'],
    queryFn: () => forecastingApi.getSeasonality().then((r) => r.data as { active: SeasonInfo | null; upcoming: SeasonInfo | null }),
    staleTime: 6 * 60 * 60_000, // 6h — seasons change slowly
    retry: false,
  })

  if (!data) return null

  // Prefer an active season; otherwise show an upcoming one so the pharmacy can prepare.
  const active = data.active && data.active.categories.length > 0 ? data.active : null
  const upcoming = !active && data.upcoming && data.upcoming.categories.length > 0 ? data.upcoming : null
  const season = active ?? upcoming
  if (!season) return null

  const isUpcoming = !active
  const topCats = season.categories.slice(0, 4)

  return (
    <div className={`p-4 rounded-2xl border flex items-start gap-4 ${
      isUpcoming
        ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-white'
        : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
    }`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
        isUpcoming ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
      }`}>
        <CalendarClock size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${isUpcoming ? 'text-amber-900' : 'text-emerald-900'}`}>
          {isUpcoming
            ? `موسم ${season.arabicName} يبدأ خلال ${season.daysUntil} يوم — استعد الآن`
            : `موسم ${season.arabicName} نشط الآن — ارتفاع متوقع في الطلب`}
        </p>
        <p className={`text-[11px] mt-0.5 leading-relaxed ${isUpcoming ? 'text-amber-700/80' : 'text-emerald-700/80'}`}>
          {isUpcoming
            ? 'يُنصح برفع مخزون الفئات التالية مبكراً لتفادي النقص وارتفاع الأسعار:'
            : 'تأكد من توفّر مخزون كافٍ من الفئات التالية الأكثر طلباً خلال هذا الموسم:'}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {topCats.map((c) => (
            <span
              key={c.category}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isUpcoming ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {categoryLabelAr(c.category)} +{c.upliftPct}%
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

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
            ? data.totalEstimatedLoss.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ج.م'
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

// ─── POS Integrity / Loss-Prevention widget ──────────────────────────────────
// Surfaces the Isolation-Forest + rule-based cashier-shift anomalies (cash
// mismatches, high refund rates, behavioural drift) on the dashboard instead of
// burying them inside the approvals queue. This is the loss-prevention hook that
// keeps an owner logging in daily.

const POS_SCENARIO_AR: Record<string, string> = {
  cash_mismatch:    'فروقات نقدية في الخزينة',
  high_refund_rate: 'نسبة مرتجعات مرتفعة',
  behavioral_anomaly: 'سلوك غير معتاد في الوردية',
}

function PosIntegrityWidget() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['pos-integrity-pending'],
    queryFn: () => aiCenterApi.listApprovals({ subjectType: 'pos_shift_action', status: 'pending', limit: 50 }),
    staleTime: 5 * 60_000,
    retry: false,
  })

  if (!data || data.total === 0) return null

  // Break down by scenario so the owner instantly knows the type of risk.
  const counts = new Map<string, number>()
  for (const a of data.data) {
    const scenario = (a.payload?.scenario as string) ?? 'behavioral_anomaly'
    counts.set(scenario, (counts.get(scenario) ?? 0) + 1)
  }
  const breakdown = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const critical = data.data.filter((a) => a.priority === 'critical').length

  return (
    <button
      onClick={() => navigate('/pharmacy/ai-center?tab=approvals')}
      className="w-full text-start p-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white hover:shadow-md hover:border-amber-300 transition-all group flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
        <ShieldAlert size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          {data.total} وردية بيع تحتاج مراجعتك
          {critical > 0 && <span className="ms-1 text-red-700">({critical} حرجة)</span>}
        </p>
        <p className="text-[11px] text-amber-700/80 mt-0.5">
          رصد الذكاء الاصطناعي أنماطاً قد تعني خسارة نقدية أو خطأ في الكاشير — راجعها قبل أن تتراكم
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {breakdown.map(([scenario, n]) => (
            <span key={scenario} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
              {POS_SCENARIO_AR[scenario] ?? scenario} ×{n}
            </span>
          ))}
        </div>
      </div>
      <ChevronLeft size={14} className="text-amber-300 group-hover:text-amber-500 rtl:rotate-180 shrink-0" />
    </button>
  )
}

// ─── Financial Health Cards (Sprint 3c) ──────────────────────────────────────
function FinancialHealthCards() {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['financial-health-snapshot'],
    queryFn: () => supplierApi.getFinancialHealthSnapshot().then((r) => r.data),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const { data: atRisk } = useQuery({
    queryKey: ['market-at-risk-products'],
    queryFn: () => supplierApi.getAtRiskProducts().then((r) => r.data),
    staleTime: 10 * 60_000,
    retry: 1,
  })

  if (isLoading) return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[1,2,3,4].map(i => (
        <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 animate-pulse">
          <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
          <div className="h-7 bg-gray-100 rounded w-1/2" />
        </div>
      ))}
    </div>
  )

  if (isError || !data) return (
    <div className="flex items-center justify-between px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm text-gray-500">
      <span>تعذّر تحميل الصحة المالية</span>
      <button onClick={() => refetch()} className="text-xs text-teal-700 hover:text-teal-900 font-medium">إعادة المحاولة</button>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">الصحة المالية والمخزون</h3>
        <button
          onClick={() => navigate('/pharmacy/price-intelligence')}
          className="text-xs text-teal-700 hover:text-teal-900 font-medium"
        >
          ذكاء الأسعار ←
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total inventory value */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-[11px] text-gray-500 mb-1">قيمة المخزون الكلي</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">
            {data.totalInventoryValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م
          </p>
        </div>

        {/* Dead stock */}
        <div className={`rounded-2xl border p-4 ${data.deadStockPct > 30 ? 'border-red-200 bg-red-50' : 'bg-white border-gray-200'}`}>
          <p className="text-[11px] text-gray-500 mb-1">مخزون راكد</p>
          <p className={`text-xl font-bold tabular-nums ${data.deadStockPct > 30 ? 'text-red-700' : 'text-gray-900'}`}>
            {data.deadStockPct.toFixed(1)}%
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">{data.deadStockSkus} صنف</p>
          {data.deadStockPct > 30 && (
            <p className="text-[10px] text-red-600 mt-1 font-medium">⚠ يتجاوز الحد المقبول 30%</p>
          )}
        </div>

        {/* Near expiry */}
        <div className={`rounded-2xl border p-4 ${data.nearExpirySkus > 0 ? 'border-amber-200 bg-amber-50' : 'bg-white border-gray-200'}`}>
          <p className="text-[11px] text-gray-500 mb-1">سينتهي خلال 30 يوم</p>
          <p className={`text-xl font-bold tabular-nums ${data.nearExpirySkus > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
            {data.nearExpiryValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">{data.nearExpirySkus} صنف</p>
        </div>

        {/* Credit utilization */}
        <div className={`rounded-2xl border p-4 ${data.cashRisk ? 'border-red-200 bg-red-50' : 'bg-white border-gray-200'}`}>
          <p className="text-[11px] text-gray-500 mb-1">استخدام الائتمان</p>
          <p className={`text-xl font-bold tabular-nums ${data.cashRisk ? 'text-red-700' : 'text-gray-900'}`}>
            {data.utilizationRate.toFixed(0)}%
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${data.utilizationRate > 90 ? 'bg-red-500' : data.utilizationRate > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, data.utilizationRate)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-600" />
          <ul className="space-y-0.5">
            {data.alerts.map((a, i) => <li key={i}>• {a}</li>)}
          </ul>
        </div>
      )}

      {/* Market at-risk products */}
      {atRisk && atRisk.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <h4 className="text-sm font-semibold text-gray-800">أدوية يقل المعروض منها في السوق</h4>
            </div>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
              عدد الموردين الذين يوفّرون هذه الأدوية منخفض حالياً. يُنصح بالشراء مبكراً قبل نفادها أو ارتفاع سعرها.
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {atRisk.slice(0, 5).map((item) => (
              <div key={item.productId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-700 font-medium truncate">{item.productName ?? 'منتج غير معروف'}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    item.status === 'red' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    متوفر لدى {Math.round(item.availabilityRate * 100)}% من الموردين
                  </span>
                  <span className="text-[10px] text-gray-400">{item.activeSuppliers}/{item.totalSuppliers} مورد</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Anti-miss strip: warns when pending decisions are about to expire unactioned. */
function ExpiryBacklogStrip() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['ai-center', 'report', 'week'],
    queryFn:  () => aiCenterApi.report('week'),
    refetchInterval: 60_000,
  })

  const expiring = data?.backlog.expiringNext24h ?? 0
  if (expiring <= 0) return null

  return (
    <button
      onClick={() => navigate('/pharmacy/ai-center?tab=approvals')}
      className="w-full text-right p-4 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white flex items-center gap-3 hover:shadow-md transition"
    >
      <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
        <CalendarClock size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-orange-900">
          {expiring} قرار{expiring > 1 ? 'اً' : ''} ينتهي وقته خلال ٢٤ ساعة
        </p>
        <p className="text-[11px] text-orange-700 mt-0.5">
          اعتمدها الآن قبل أن تُغلَق تلقائياً ويفوتك التصرف.
        </p>
      </div>
      <span className="shrink-0 px-3 py-1.5 text-[11px] font-semibold text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors whitespace-nowrap">
        راجعها ←
      </span>
    </button>
  )
}

/** One KPI widget card (shared by all dashboard sections). */
function WidgetCard({ w, onClick }: { w: DashboardWidget; onClick: () => void }) {
  const Icon = WIDGET_ICON[w.iconKey] ?? Sparkles
  const hot = w.count > 0
  const tone =
    w.severity === 'danger'  ? 'text-red-600 bg-red-50'
  : w.severity === 'warning' ? 'text-amber-600 bg-amber-50'
  : w.severity === 'info'    ? 'text-sky-600 bg-sky-50'
  :                            'text-emerald-600 bg-emerald-50'
  return (
    <button
      onClick={onClick}
      className="text-start p-5 rounded-2xl border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all group flex items-center gap-4"
    >
      <div className="flex-1 min-w-0 text-start">
        <p className={`text-3xl font-bold leading-none tabular-nums ${hot ? 'text-gray-900' : 'text-gray-300'}`}>{w.count.toLocaleString('en-US')}</p>
        <p className="font-semibold text-gray-800 text-sm mt-1.5">{w.titleAr}</p>
        {w.count === 0 && w.emptyMessageAr && (
          <p className="text-[11px] text-emerald-600 mt-1 leading-relaxed flex items-center gap-1">
            <CheckCircle2 size={10} />
            {w.emptyMessageAr}
          </p>
        )}
      </div>
      <div className={`shrink-0 w-12 h-12 rounded-full grid place-items-center ${tone}`}>
        <Icon size={20} />
      </div>
    </button>
  )
}

/** Section heading — gives every dashboard block a clear mental category. */
function SectionHead({ icon: Icon, title, subtitle, tone }: {
  icon: React.ElementType; title: string; subtitle?: string
  tone: 'red' | 'amber' | 'violet' | 'emerald' | 'sky'
}) {
  const toneCls: Record<string, string> = {
    red:     'bg-red-100 text-red-700',
    amber:   'bg-amber-100 text-amber-700',
    violet:  'bg-violet-100 text-violet-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky:     'bg-sky-100 text-sky-700',
  }
  return (
    <div className="flex items-center gap-2.5 mt-1">
      <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${toneCls[tone]}`}><Icon size={15} /></span>
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-gray-800 leading-tight">{title}</h2>
        {subtitle && <p className="text-[11px] text-gray-400 leading-tight">{subtitle}</p>}
      </div>
    </div>
  )
}

/**
 * Section 6 — AI Impact. Turns the AI Center from "more alerts" into "value
 * delivered": realised savings, decisions executed, and proposals this month.
 * Uses the existing report endpoint; renders nothing until there's a win to show.
 */
function AiImpactSection() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['ai-center', 'report', 'month'],
    queryFn:  () => aiCenterApi.report('month'),
    staleTime: 5 * 60_000,
    retry: false,
  })
  if (!data) return null
  const saved    = data.realizedSavingsEgp ?? 0
  const executed = data.executed ?? 0
  const proposed = data.proposed ?? 0
  if (saved <= 0 && executed <= 0) return null

  const stats = [
    { label: 'وفّرت هذا الشهر', value: `${saved.toLocaleString('en-US')} ج.م`, icon: Wallet },
    { label: 'قرارات نفّذها الذكاء', value: executed.toLocaleString('en-US'), icon: CheckCircle2 },
    { label: 'إجمالي المقترحات', value: proposed.toLocaleString('en-US'), icon: Sparkles },
  ]
  return (
    <div>
      <SectionHead icon={TrendingUp} title="أثر الذكاء الاصطناعي" subtitle="القيمة التي حقّقها مساعدوك هذا الشهر" tone="emerald" />
      <button
        onClick={() => navigate('/pharmacy/ai-center?tab=report')}
        className="mt-2 w-full text-start rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-white p-5 hover:shadow-md transition-all"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-emerald-100 grid place-items-center text-emerald-600 shrink-0">
                <s.icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-extrabold text-emerald-900 tabular-nums leading-tight">{s.value}</p>
                <p className="text-[11px] text-emerald-700/80 leading-tight">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-emerald-700/70 flex items-center gap-1">
          عرض تقرير الأثر الكامل <ChevronLeft size={12} className="rtl:rotate-180" />
        </p>
      </button>
    </div>
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

  // Bucket the flat widget list into clear mental categories (no data removed).
  const widgetByKey = new Map(data.widgets.map(w => [w.key, w]))
  const pickWidgets = (keys: string[]) =>
    keys.map(k => widgetByKey.get(k)).filter((w): w is DashboardWidget => !!w)
  const requiredWidgets = pickWidgets(['pending_approvals', 'catalog_issues'])
  const riskWidgets     = pickWidgets(['out_of_stock', 'stock_risk', 'expired'])
  const oppWidgets      = pickWidgets(['near_expiry', 'dead_stock'])
  const nearExpiryCount = widgetByKey.get('near_expiry')?.count ?? 0

  return (
    <div className="space-y-5">
      {/* Seasonal demand radar (Hijri calendar — works from day one, no sales history needed) */}
      <SeasonalDemandBanner />

      {/* Anti-miss strip — surfaces decisions about to expire unactioned */}
      <ExpiryBacklogStrip />

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

      {/* ── Section 1: Hero — expiry loss in money (strongest signal) ── */}
      {data.expiryRiskEgp > 0 && (
        <div className="p-4 rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-red-900">
              قد تخسر {data.expiryRiskEgp.toLocaleString('en-US')} جنيه من مخزون سينتهي قريباً
            </p>
            <p className="text-[11px] text-red-700 mt-0.5">
              {nearExpiryCount > 0 ? `${nearExpiryCount} صنف · ` : ''}قيمة المخزون الذي سينتهي خلال 180 يوماً — عرضه في P2P أو بيعه بخصم يقلّل الخسارة
            </p>
          </div>
          <button
            onClick={() => navigate('/pharmacy/p2p?tab=sell&preset=near_expiry')}
            className="shrink-0 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap"
          >
            أدرج للبيع ←
          </button>
        </div>
      )}

      {/* ── Section 2: Required Actions — needs your decision now ── */}
      <div className="space-y-2.5">
        <SectionHead icon={Inbox} title="إجراءات مطلوبة" subtitle="قرارات ومهام تنتظر تصرّفك" tone="violet" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {requiredWidgets.map(w => <WidgetCard key={w.key} w={w} onClick={() => navigate(w.deepLink)} />)}
        </div>
        <PosIntegrityWidget />
      </div>

      {/* ── Section 3: Critical Risks — money/patient risk ── */}
      <div className="space-y-2.5">
        <SectionHead icon={AlertOctagon} title="المخاطر الحرجة" subtitle="نفاد وانتهاء صلاحية يهدّد مبيعاتك" tone="red" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {riskWidgets.map(w => <WidgetCard key={w.key} w={w} onClick={() => navigate(w.deepLink)} />)}
        </div>
        <MissedRevenueWidget />
      </div>

      {/* ── Section 4: Opportunities — recover value before it's lost ── */}
      <div className="space-y-2.5">
        <SectionHead icon={PartyPopper} title="فرص وتقليل خسائر" subtitle="حوّل المخزون قبل أن يخسر قيمته" tone="amber" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {oppWidgets.map(w => <WidgetCard key={w.key} w={w} onClick={() => navigate(w.deepLink)} />)}
        </div>
      </div>

      {/* ── Section 5: AI Predictions — plan ahead ── */}
      <div className="space-y-2.5">
        <SectionHead icon={TrendingUp} title="توقّعات الذكاء" subtitle="خطّط قبل حدوث النقص" tone="sky" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/pharmacy/forecast')}
            className="text-start p-4 rounded-2xl border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all group flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <TrendingUp size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">توقّع الطلب</p>
              <p className="text-[11px] text-gray-500 mt-0.5">أعلى الأصناف المتوقّع زيادة الطلب عليها — تنبؤ ٧ و١٤ و٣٠ يوم</p>
            </div>
            <ChevronLeft size={14} className="text-gray-300 group-hover:text-emerald-500 rtl:rotate-180 shrink-0" />
          </button>
          <button
            onClick={() => navigate('/pharmacy/reorder')}
            className="text-start p-4 rounded-2xl border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all group flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
              <CalendarClock size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">جدول إعادة الطلب</p>
              <p className="text-[11px] text-gray-500 mt-0.5">الأصناف التي تقترب من نقطة إعادة الطلب وتاريخ النفاد المتوقّع</p>
            </div>
            <ChevronLeft size={14} className="text-gray-300 group-hover:text-sky-500 rtl:rotate-180 shrink-0" />
          </button>
        </div>
      </div>

      {/* Financial health + market availability snapshot */}
      <FinancialHealthCards />

      {/* ── Section 6: AI Impact — value delivered ── */}
      <AiImpactSection />

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
        {/* Summary breakdown chips — see the shape of the queue before scanning it */}
        {data.pendingApprovals.total > 0 && (
          <div className="px-5 pt-3 flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-violet-50 text-violet-700">
              {data.pendingApprovals.total} بانتظار الموافقة
            </span>
            {data.pendingApprovals.critical > 0 && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700">
                {data.pendingApprovals.critical} حرجة
              </span>
            )}
            {data.pendingApprovals.high > 0 && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700">
                {data.pendingApprovals.high} مرتفعة
              </span>
            )}
          </div>
        )}
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
  const detailRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusId && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [focusId])

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

  // Shared with the page header badge (same key → deduped by react-query).
  const counts = useQuery({
    queryKey: ['ai-center', 'counts'],
    queryFn:  aiCenterApi.approvalCounts,
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
    <div className="space-y-4">
      {/* Summary cards — see the queue shape and jump to a status in one tap */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { key: 'pending',  label: 'بانتظار قرارك', n: counts.data?.pending  ?? 0, active: 'border-violet-400 bg-violet-50',   num: 'text-violet-700' },
          { key: 'approved', label: 'موافق عليه',    n: counts.data?.approved ?? 0, active: 'border-emerald-400 bg-emerald-50', num: 'text-emerald-700' },
          { key: 'rejected', label: 'مرفوض',         n: counts.data?.rejected ?? 0, active: 'border-gray-300 bg-gray-50',      num: 'text-gray-700' },
        ] as const).map(c => (
          <button
            key={c.key}
            onClick={() => { setStatusFilter(c.key); setSelected(new Set()) }}
            className={`text-start p-4 rounded-2xl border transition-all ${
              statusFilter === c.key ? `${c.active} ring-2 ring-offset-1 ring-gray-100` : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
            }`}
          >
            <p className={`text-2xl font-extrabold tabular-nums leading-none ${c.num}`}>{c.n.toLocaleString('en-US')}</p>
            <p className="text-xs font-semibold text-gray-600 mt-1.5">{c.label}</p>
          </button>
        ))}
      </div>

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
      <div ref={detailRef}>
        <ApprovalDetail
          approval={focused ?? null}
          onClose={() => setSearchParams({ tab: 'approvals' })}
        />
      </div>
    </div>
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
          {Array.isArray((approval.payload as any)?.alternatives) && (approval.payload as any).alternatives.length > 0 && (
            <Tooltip text="وكلاء متعددون رصدوا نفس الحاجة لهذا المنتج — مدمجة في بطاقة واحدة">
              <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-semibold cursor-help">
                <Sparkles size={9} />
                +{(approval.payload as any).alternatives.length} مصدر
              </span>
            </Tooltip>
          )}
          {approval.status === 'executed' && approval.executionResult?.failed && (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 text-[10px] font-semibold">
              <AlertOctagon size={10} />
              فشل التنفيذ
            </span>
          )}
          {(() => {
            // P4 — quick verdict badges so users see finance/delay/overpay risk in the list view.
            const v = (approval.payload as any)?.planVerdicts as PlanVerdicts | null | undefined
            if (!v) return null
            const badges: JSX.Element[] = []
            if (v.financialStatus?.recommendation === 'delay_recommended') {
              badges.push(
                <Tooltip key="fin" text="محرّك القرار يرى أن السيولة محدودة — راجع التقييم المالي قبل الاعتماد.">
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 text-[10px] font-semibold cursor-help">
                    <Banknote size={9} /> ائتمان ضيق
                  </span>
                </Tooltip>,
              )
            } else if (v.financialStatus?.recommendation === 'approve_with_caution') {
              badges.push(
                <Tooltip key="fin" text="الوضع المالي مقبول لكن مع ضغط على الائتمان.">
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-semibold cursor-help">
                    <Banknote size={9} /> حذر مالي
                  </span>
                </Tooltip>,
              )
            }
            if (v.delayRecommendation && v.delayRecommendation.confidence !== 'low') {
              badges.push(
                <Tooltip key="delay" text={v.delayRecommendation.humanReason}>
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-semibold cursor-help">
                    <Clock size={9} /> تأجيل {v.delayRecommendation.recommendedDelayDays}ي
                  </span>
                </Tooltip>,
              )
            }
            if (v.overpaymentRecommendation && v.overpaymentRecommendation.overpaymentPct >= v.overpaymentRecommendation.thresholdPct) {
              badges.push(
                <Tooltip key="over" text={v.overpaymentRecommendation.humanReason}>
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-200 text-[10px] font-semibold cursor-help">
                    <AlertTriangle size={9} /> +{v.overpaymentRecommendation.overpaymentPct.toFixed(0)}٪
                  </span>
                </Tooltip>,
              )
            }
            return badges.length > 0 ? <>{badges}</> : null
          })()}
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

// ─── Alternatives panel ──────────────────────────────────────────────────────
// When multiple agents detect the SAME business need (e.g. low_stock + the
// inventory expert's reorder recommendation + a smart-procurement p2p match
// for the same product), the backend collapses them onto one approval and
// merges the others into `payload.alternatives[]`. We render them here so
// the pharmacist sees every angle in one place — instead of three duplicate
// task cards. Visual idiom matches FinancialStatusBar / DelayRecommendation:
// rounded-xl, soft colour palette, RTL Arabic copy.

const AGENT_LABEL_AR: Record<string, string> = {
  inventory_expert:        'خبير المخزون',
  low_stock_replenishment: 'تنبيه الحد الأدنى',
  smart_procurement:       'فرص الشراء الذكية',
  dead_stock_expert:       'تحليل المخزون الراكد',
  expiry_liquidation:      'تصفية الانتهاء',
  purchase_expert:         'محرّك الشراء',
}

// ─── P4: Plan Verdicts Panel (credit-aware gating + delay + overpayment) ──
// Renders verdicts produced by ProcurementOrchestrator and attached by
// agent-bridge.service.ts to `payload.planVerdicts`. When the draft predates
// the Decision Engine (legacy cheapest-only path), planVerdicts is null and
// the panel returns null — no visual noise.

interface PlanVerdicts {
  financialStatus: {
    creditAvailable:           number
    creditLimit:               number
    utilizationBeforePurchase: number
    utilizationAfterPurchase:  number
    cashRisk:                  'low' | 'medium' | 'high'
    recommendation:            'approve_now' | 'approve_with_caution' | 'delay_recommended'
  } | null
  delayRecommendation: {
    recommendedDelayDays: number
    reasonCode:           string
    humanReason:          string
    projectedInflow:      number
    daysToCoverCost:      number | null
    confidence:           'low' | 'medium' | 'high'
  } | null
  overpaymentRecommendation: {
    overpaymentPct:               number
    thresholdPct:                 number
    effectiveUnitPrice:           number
    marketAvgUnitPrice:           number
    bestAlternativeUnitPrice:     number | null
    bestAlternativeIsMarketplace: boolean
    humanReason:                  string
    confidence:                   'low' | 'medium' | 'high'
  } | null
  riskScore:         number | null
  planConfidence:    number | null
  signalFreshnessAt: string | null
}

function PlanVerdictsPanel({ approval }: { approval: Approval }) {
  const v = (approval.payload as any)?.planVerdicts as PlanVerdicts | null
  if (!v) return null

  const fin       = v.financialStatus
  const delay     = v.delayRecommendation
  const overpay   = v.overpaymentRecommendation
  const fresh     = v.signalFreshnessAt ? new Date(v.signalFreshnessAt) : null
  const staleMins = fresh ? Math.round((Date.now() - fresh.getTime()) / 60_000) : null
  const isStale   = staleMins != null && staleMins > 30

  const finTone =
    fin?.recommendation === 'delay_recommended'    ? 'red'
  : fin?.recommendation === 'approve_with_caution' ? 'amber'
  :                                                   'emerald'
  const finCls: Record<string, { box: string; text: string; bar: string }> = {
    red:     { box: 'bg-red-50 border-red-200',         text: 'text-red-900',     bar: 'bg-red-500'     },
    amber:   { box: 'bg-amber-50 border-amber-200',     text: 'text-amber-900',   bar: 'bg-amber-500'   },
    emerald: { box: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-900', bar: 'bg-emerald-500' },
  }
  const cls = finCls[finTone]
  const verdictAr: Record<string, string> = {
    approve_now:           'الوضع المالي يسمح بالاعتماد الآن',
    approve_with_caution:  'اعتمد بحذر — ضغط على الائتمان',
    delay_recommended:     'يُنصح بالتأجيل — السيولة محدودة',
  }
  const confidenceAr = (c: 'low' | 'medium' | 'high') =>
    c === 'high' ? 'عالية' : c === 'medium' ? 'متوسطة' : 'منخفضة'

  return (
    <div className="space-y-2">
      {fin && (
        <div className={`rounded-xl border ${cls.box} p-3.5`}>
          <div className={`flex items-center gap-1.5 ${cls.text} font-medium text-xs mb-2`}>
            <Banknote size={13} />
            التقييم المالي
          </div>
          <div className={`${cls.text} text-xs leading-relaxed mb-2`}>{verdictAr[fin.recommendation]}</div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className={`${cls.text} opacity-80`}>استخدام الائتمان</span>
            <span className={`${cls.text} font-semibold tabular-nums`}>
              {fin.utilizationBeforePurchase}٪ → {fin.utilizationAfterPurchase}٪
            </span>
          </div>
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div className={`h-full ${cls.bar} transition-all`} style={{ width: `${Math.min(100, fin.utilizationAfterPurchase)}%` }} />
          </div>
          {fin.creditLimit > 0 && (
            <div className={`mt-2 text-[10px] ${cls.text} opacity-70 tabular-nums`}>
              المتاح: {fin.creditAvailable.toLocaleString('en-US')} / {fin.creditLimit.toLocaleString('en-US')}
            </div>
          )}
        </div>
      )}

      {delay && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <div className="flex items-center gap-1.5 text-amber-900 font-medium text-xs mb-1.5">
            <Clock size={13} />
            هل نؤجّل؟ — اقتراح محرّك القرار
          </div>
          <p className="text-amber-900/90 text-xs leading-relaxed mb-2">{delay.humanReason}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-amber-900/80">
            <span>تأجيل مقترح: <b className="text-amber-900">{delay.recommendedDelayDays} يوم</b></span>
            {delay.projectedInflow > 0 && (
              <span>تدفقات نقدية مُتوقَّعة: <b className="text-amber-900 tabular-nums">{delay.projectedInflow.toLocaleString('en-US')}</b></span>
            )}
            {delay.daysToCoverCost != null && (
              <span>تغطية التكلفة خلال: <b className="text-amber-900">{delay.daysToCoverCost} يوم</b></span>
            )}
            <span className="opacity-70">ثقة: {confidenceAr(delay.confidence)}</span>
          </div>
        </div>
      )}

      {overpay && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3.5">
          <div className="flex items-center gap-1.5 text-orange-900 font-medium text-xs mb-1.5">
            <AlertTriangle size={13} />
            دفع زائد محتمل
          </div>
          <p className="text-orange-900/90 text-xs leading-relaxed mb-2">{overpay.humanReason}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-orange-900/80 tabular-nums">
            <span>السعر الحالي: <b>{overpay.effectiveUnitPrice.toFixed(2)}</b></span>
            <span>متوسط السوق: <b>{overpay.marketAvgUnitPrice.toFixed(2)}</b></span>
            <span className="text-orange-900 font-semibold">+{overpay.overpaymentPct.toFixed(1)}٪</span>
            {overpay.bestAlternativeUnitPrice != null && (
              <span>أفضل بديل: <b>{overpay.bestAlternativeUnitPrice.toFixed(2)}</b>{overpay.bestAlternativeIsMarketplace ? ' (P2P)' : ''}</span>
            )}
          </div>
        </div>
      )}

      {(v.riskScore != null || isStale) && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
          {v.riskScore != null && (
            <span className={`px-2 py-0.5 rounded-full border ${v.riskScore >= 70 ? 'bg-red-50 border-red-200 text-red-700' : v.riskScore >= 40 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
              مخاطرة الخطة: {v.riskScore}/100
            </span>
          )}
          {isStale && <RecomputePlanChip staleMins={staleMins!} />}
        </div>
      )}
    </div>
  )
}

/**
 * Stale-signal chip with an inline "recompute" button. Re-runs the
 * procurement orchestrator against current prices/stock and invalidates
 * both the cart query and the approvals list so the user immediately sees
 * a refreshed plan without leaving the AI Center.
 */
function RecomputePlanChip({ staleMins }: { staleMins: number }) {
  const qc = useQueryClient()
  const { toast } = useActions()
  const recompute = useMutation({
    mutationFn: () => procurementApi.recomputeCart().then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['procurement-cart'] })
      qc.invalidateQueries({ queryKey: ['ai-center'] })
      qc.invalidateQueries({ queryKey: ['approvals'] })
      const n = (data as any)?.recomputedProducts ?? 0
      if (n > 0) toast('success', `تم تحديث الخطة لـ ${n} منتج${n === 1 ? '' : 'ات'} بالأسعار والمخزون الحالي`)
      else        toast('info',    'الخطة محدَّثة بالفعل — لا توجد إشارات قديمة')
    },
    onError: (e: any) => toast('error', e?.message ?? 'تعذّرت إعادة الاحتساب'),
  })
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); recompute.mutate() }}
      disabled={recompute.isPending}
      title="إعادة احتساب الخطة بالأسعار والمخزون الحاليين"
      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 disabled:opacity-60 transition-colors text-[10px] font-medium"
    >
      {recompute.isPending
        ? <Loader2 size={9} className="animate-spin" />
        : <RefreshCw size={9} />}
      <span>الإشارات قديمة (منذ {staleMins} د) — إعادة احتساب</span>
    </button>
  )
}

function AlternativesPanel({ approval }: { approval: Approval }) {
  const alts = (approval.payload as any)?.alternatives as Array<{
    agentCode: string; title: string; summary: string; confidence: number
  }> | undefined
  if (!alts?.length) return null

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3.5 space-y-2.5">
      <div className="flex items-center gap-1.5 text-sky-900 font-medium text-xs">
        <Sparkles size={13} className="opacity-80" />
        وكلاء آخرون رصدوا نفس الحاجة ({alts.length})
      </div>
      <p className="text-[11px] text-sky-900/70 leading-relaxed">
        النظام جمع الإشارات المتداخلة في بطاقة واحدة لتجنّب التكرار. كل بديل أدناه يمثّل زاوية مختلفة لنفس المشكلة — راجع لاتخاذ قرار مدروس.
      </p>
      <ul className="space-y-2">
        {alts.map((a, i) => (
          <li key={i} className="rounded-lg bg-white border border-sky-200 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-sky-900">
                {AGENT_LABEL_AR[a.agentCode] ?? a.agentCode}
              </span>
              <span className="text-[10px] text-sky-700/70">
                ثقة {Math.round((a.confidence ?? 0) * 100)}%
              </span>
            </div>
            <div className="text-[11px] text-gray-800 mt-1 line-clamp-1">{a.title}</div>
            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{a.summary}</div>
          </li>
        ))}
      </ul>
    </div>
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

        {impactText(approval) && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 text-teal-900 font-medium text-xs mb-1">
              <Zap size={13} />
              التأثير
            </div>
            <p className="text-teal-900/90 text-xs leading-relaxed">{impactText(approval)}</p>
          </div>
        )}

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

        <PlanVerdictsPanel approval={approval} />

        <AlternativesPanel approval={approval} />

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
    case 'procurement_basket':  return 'سلة شراء (متعدد المنتجات)'
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
      <div className="px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 flex items-center gap-2.5 text-xs text-gray-600">
        <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
        <span>
          <strong className="text-gray-800">مبدأ أساسي:</strong> لا يُنفَّذ أي إجراء دون موافقتك الصريحة — كل مساعد يقترح فقط، وأنت من يقرر دائماً.
        </span>
      </div>

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
  const [view, setView]       = useState<'decisions' | 'runs'>('decisions')
  const [period, setPeriod]   = useState<7 | 30 | 'custom'>(30)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  // Compute effective days for aiRunStats: for custom, derive from date diff; clamp 1-90
  const effectiveDays: number = (() => {
    if (period !== 'custom') return period
    if (!customFrom || !customTo) return 30
    const diff = Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86_400_000)
    return Math.min(Math.max(diff, 1), 90)
  })()

  const days = effectiveDays // alias for display labels

  const events = useInfiniteList<ApprovalEvent>({
    queryKey: ['ai-center', 'audit', 'events', period, customFrom, customTo],
    fetchPage: ({ limit, offset }) => aiCenterApi.approvalEvents(limit, offset),
  })
  const stats = useQuery({
    queryKey: ['ai-center', 'audit', 'ai-stats', effectiveDays],
    queryFn:  () => aiCenterApi.aiRunStats(effectiveDays),
  })

  // P7: AI cost visibility — per-feature usage today (procurement / chat / etc).
  // 60s staleTime: the underlying ai_token_usage row is updated post every
  // AI call, but we don't need second-by-second resolution on a budget card.
  const budget = useQuery({
    queryKey: ['ai-center', 'audit', 'token-budget'],
    queryFn:  () => aiCenterApi.tokenUsageBreakdown(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  const runs = useInfiniteList<any>({
    queryKey: ['ai-center', 'audit', 'ai-runs'],
    fetchPage: ({ limit, offset }) => aiCenterApi.aiRuns(limit, offset),
    enabled:  view === 'runs',
  })

  const fmtNum = (n: number) => n.toLocaleString('en-US')
  const fmtMs  = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)} ث` : `${n} مللي`

  return (
    <div className="space-y-5">
      {/* ── P7: AI Budget Today (cost control widget) ─────────────────── */}
      <AiBudgetWidget data={budget.data} isLoading={budget.isLoading} />

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
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setPeriod(7)}
                className={`px-3 py-1 rounded-md text-xs font-medium ${period === 7 ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
              >آخر 7 أيام</button>
              <button
                onClick={() => setPeriod(30)}
                className={`px-3 py-1 rounded-md text-xs font-medium ${period === 30 ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
              >آخر 30 يوم</button>
              <button
                onClick={() => setPeriod('custom')}
                className={`px-3 py-1 rounded-md text-xs font-medium ${period === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
              >مخصص</button>
            </div>
            {period === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-emerald-400"
                />
                <span className="text-xs text-gray-400">—</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-emerald-400"
                />
              </div>
            )}
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
            <StatCard label="إجمالي الاستدعاءات" value={fmtNum(stats.data.totalRuns)}        icon={Activity}     tone="violet"
              hint={`عدد استدعاءات الذكاء الاصطناعي (LLM) خلال آخر ${days} يوم — ليس عدد الموافقات أو التوصيات.`} />
            <StatCard label="ناجحة"          value={fmtNum(stats.data.success)}          icon={CheckCircle2} tone="emerald" />
            <StatCard label="فشلت"           value={fmtNum(stats.data.failed)}           icon={XCircle}      tone="red" />
            <StatCard label="مُحجوبة"         value={fmtNum(stats.data.blocked)}          icon={Ban}          tone="amber"
              hint="استدعاءات منعتها بوابة الأمان (محتوى مرفوض، أو تجاوز حدود الاستهلاك)." />
            <StatCard label="متوسط الزمن"     value={fmtMs(stats.data.avgLatencyMs)}      icon={Clock}        tone="sky"
              hint={`P95: ${fmtMs(stats.data.p95LatencyMs)} — أبطأ 5٪ من الاستدعاءات.`} />
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
                      <span>{new Date(ev.createdAt).toLocaleString('en-US')}</span>
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
                        {new Date(r.createdAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
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
                          : <span className="text-gray-300">0</span>}
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

// ─────────────────────────────────────────────────────────────────────────────
// P7: AI Budget Today widget
// Shows per-feature token usage vs daily cap + estimated USD cost. Critical
// for cost-control: without this, runaway AI spend is invisible until billing.
// ─────────────────────────────────────────────────────────────────────────────

const FEATURE_LABELS_AR: Record<string, string> = {
  procurement: 'المشتريات الذكية',
  chat:        'المساعد المحادثي',
  migration:   'هجرة البيانات',
  whatsapp:    'واتساب',
  generic:     'متفرقات',
}

function AiBudgetWidget({
  data,
  isLoading,
}: {
  data:      TokenUsageBreakdownRow[] | undefined
  isLoading: boolean
}) {
  const fmtNum = (n: number) => n.toLocaleString('en-US')
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <SkeletonRows />
      </div>
    )
  }
  if (!data || data.length === 0) return null

  const totalCostUsd      = data.reduce((s, r) => s + r.totalCostUsd, 0)
  const totalCalls        = data.reduce((s, r) => s + r.calls,        0)
  const totalOutputTokens = data.reduce((s, r) => s + r.outputTokens, 0)
  const anyOverLimit      = data.some(r => r.percent >= 100)
  const anyNearLimit      = data.some(r => r.percent >= 80 && r.percent < 100)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-emerald-600" />
          <h2 className="text-base font-semibold text-gray-900">تكلفة الذكاء الاصطناعي اليوم</h2>
          <span className="text-xs text-gray-500 mr-2">
            (يُعاد ضبط الحدود تلقائياً عند منتصف الليل UTC)
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <div className="text-gray-500">إجمالي الاستدعاءات</div>
            <div className="font-semibold text-gray-900">{fmtNum(totalCalls)}</div>
          </div>
          <div className="text-right">
            <div className="text-gray-500">رموز الإخراج</div>
            <div className="font-semibold text-gray-900">{fmtNum(totalOutputTokens)}</div>
          </div>
          <div className="text-right">
            <div className="text-gray-500">التكلفة التقديرية</div>
            <div className="font-semibold text-emerald-700">${totalCostUsd.toFixed(4)}</div>
          </div>
        </div>
      </div>

      {anyOverLimit && (
        <div className="px-5 py-2.5 bg-red-50 border-b border-red-100 flex items-start gap-2 text-xs text-red-800">
          <AlertOctagon size={14} className="mt-0.5 shrink-0" />
          <span>
            تم تجاوز حد الاستهلاك اليومي في أحد المسارات — سيستخدم النظام القواعد فقط (بدون LLM)
            حتى منتصف الليل UTC. لرفع الحد عدّل المتغير
            <code className="bg-red-100 px-1 mx-1 rounded">AI_DAILY_OUTPUT_TOKEN_CAP</code>.
          </span>
        </div>
      )}
      {!anyOverLimit && anyNearLimit && (
        <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>اقتراب من حد الاستهلاك اليومي في أحد المسارات (≥80٪) — راقب الاستخدام.</span>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {data.map(row => {
          const tone =
            row.percent >= 100 ? 'red'
          : row.percent >= 80  ? 'amber'
          : row.percent >= 50  ? 'emerald'
          :                      'emerald'
          const barColor =
            row.percent >= 100 ? 'bg-red-500'
          : row.percent >= 80  ? 'bg-amber-500'
          :                      'bg-emerald-500'
          const label = FEATURE_LABELS_AR[row.feature] ?? row.feature
          return (
            <div key={row.feature} className="px-5 py-3">
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{label}</span>
                  <span className="text-gray-400">({row.feature})</span>
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                  <span>{fmtNum(row.calls)} استدعاء</span>
                  <span>{fmtNum(row.outputTokens)} / {fmtNum(row.cap)} رمز</span>
                  <span className={`font-semibold ${tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {row.percent}٪
                  </span>
                  <span className="text-gray-900 font-semibold tabular-nums w-20 text-left">
                    ${row.totalCostUsd.toFixed(4)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all`}
                  style={{ width: `${Math.min(100, row.percent)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-500 leading-relaxed">
        التكلفة تقديرية بناءً على أسعار OpenAI الافتراضية (gpt-4o-mini).
        لإعدادات أدقّ لكل نموذج استخدم المتغيرات
        <code className="bg-white border border-gray-200 px-1 mx-1 rounded">AI_PRICE_&lt;MODEL&gt;_INPUT_PER_MTOK</code>
        و
        <code className="bg-white border border-gray-200 px-1 mx-1 rounded">AI_PRICE_&lt;MODEL&gt;_OUTPUT_PER_MTOK</code>.
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
    violet:  'text-violet-600',
    emerald: 'text-emerald-600',
    red:     'text-red-600',
    amber:   'text-amber-600',
    sky:     'text-sky-600',
    fuchsia: 'text-fuchsia-600',
  }
  const inner = (
    <div className={`rounded-xl border border-gray-200 bg-white p-3 min-w-0 ${hint ? 'cursor-help' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <Icon size={14} className={tones[tone]} />
        {hint && <Info size={11} className="text-gray-300" />}
      </div>
      <div className="text-[11px] text-gray-500 mb-0.5 truncate">{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight truncate text-gray-900">{value}</div>
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
// CATALOG LINK PANEL — inline list of inventory items with linkStatus=suggested
// ═════════════════════════════════════════════════════════════════════════════

function CatalogLinkPanel({ items }: { items: { isLoading: boolean; isFetching?: boolean; data: any } }) {
  const navigate = useNavigate()

  // Treat first load (no data yet, even before isLoading flips) as a loading
  // state — prevents the empty «everything is linked» screen from flashing on
  // tab switch while the query is enabling itself.
  if (items.isLoading || (!items.data && items.isFetching)) return <SkeletonRows />

  const rows: any[] = items.data?.data ?? []

  if (rows.length === 0) {
    return (
      <div className="py-12 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 size={22} className="text-emerald-600" />
        </div>
        <p className="font-semibold text-gray-900 text-sm mb-1">جميع منتجاتك مُربوطة بالكتالوج المركزي</p>
        <p className="text-xs text-gray-500 max-w-[340px] mx-auto leading-relaxed">
          عند إضافة منتجات جديدة، يبحث الذكاء عن مطابق في الكتالوج المركزي تلقائياً.
          نتائج المطابقة المقترحة تظهر هنا للمراجعة.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="px-4 py-2.5 bg-violet-50 border-b border-violet-100 text-xs text-violet-800 flex items-center gap-2">
        <Sparkles size={12} />
        اقترح الذكاء مطابقة لـ {rows.length} منتج — راجع كل اقتراح وأكّده أو ابحث عن بديل
      </div>
      <ul className="divide-y divide-gray-100 max-h-[calc(100vh-26rem)] overflow-y-auto">
        {rows.map((item: any) => {
          const nameAr = item.product?.nameAr || item.product?.name || '—'
          const nameEn = item.product?.name || ''
          const score  = typeof item.matchScore === 'number' ? Math.round(item.matchScore * 100) : null
          const scoreCls =
            score === null    ? 'bg-gray-100 text-gray-500' :
            score >= 80       ? 'bg-emerald-100 text-emerald-700' :
            score >= 60       ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
          return (
            <li
              key={item.id}
              className="px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 cursor-pointer"
              onClick={() => navigate(`/pharmacy/inventory?linkStatus=suggested&highlight=${item.id}`)}
            >
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                <LinkIcon size={16} className="text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 text-sm truncate">{nameAr}</div>
                {nameEn && nameEn !== nameAr && (
                  <div className="text-[11px] text-gray-400 truncate" dir="ltr">{nameEn}</div>
                )}
              </div>
              {score !== null && (
                <Tooltip text={`درجة المطابقة المقترحة من الذكاء: ${score}% — كلما ارتفعت، زادت الثقة بالاقتراح`}>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold cursor-help ${scoreCls}`}>
                    {score}%
                  </span>
                </Tooltip>
              )}
              <button
                onClick={e => { e.stopPropagation(); navigate(`/pharmacy/inventory?linkStatus=suggested&highlight=${item.id}`) }}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold"
              >
                راجع الاقتراح
              </button>
            </li>
          )
        })}
      </ul>
      <div className="px-4 py-2.5 border-t border-gray-100 text-center">
        <button
          onClick={() => navigate('/pharmacy/inventory?linkStatus=suggested')}
          className="text-xs text-violet-600 hover:text-violet-800 font-medium inline-flex items-center gap-1"
        >
          <ExternalLink size={11} /> فتح صفحة المخزون لعرض الكل
        </button>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TASKS TAB — PRD §10: same approvals, grouped by *task type* so the user can
// pick a single workstream ("today I'll handle purchase drafts") instead of
// scanning a mixed list. Visual: 3 colored cards as filters → single filtered
// list of approvals.
// ═════════════════════════════════════════════════════════════════════════════

type DomainKind = 'purchasing' | 'inventory' | 'p2p' | 'pos'

const DOMAIN_DEFS: Array<{
  key: DomainKind
  labelAr: string
  hintAr: string
  icon: React.ElementType
}> = [
  {
    key: 'purchasing',
    labelAr: 'الشراء',
    hintAr: 'مسودات أوامر الشراء والشراء الذكي من الموردين والبورصة',
    icon: ShoppingCart,
  },
  {
    key: 'inventory',
    labelAr: 'المخزون والانتهاء',
    hintAr: 'النقص، الراكد، قرب الانتهاء، الربط بالكتالوج، وتوصيات الذكاء',
    icon: Package,
  },
  {
    key: 'p2p',
    labelAr: 'سوق P2P',
    hintAr: 'توصيات الإدراج وطلبات التبادل بين الصيدليات',
    icon: Store,
  },
  {
    key: 'pos',
    labelAr: 'الكاشير',
    hintAr: 'نزاهة الشفتات وفروقات النقد والتنبيهات المرتبطة بنقطة البيع',
    icon: ShieldCheck,
  },
]

function domainFromApproval(a: Approval): DomainKind | null {
  switch (a.subjectType) {
    case 'smart_procurement':
    case 'procurement_draft':
    case 'procurement_basket':
      return 'purchasing'
    case 'low_stock':
    case 'dead_stock_clearance':
    case 'expiry_liquidation':
    case 'expired_quarantine':
    case 'inventory_item':
    case 'recommendation':
      return 'inventory'
    case 'p2p_listing_suggestion':
    case 'listing_suggestion':
    case 'p2p_order_action':
      return 'p2p'
    case 'pos_shift_action':
      return 'pos'
    default:
      return null
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// REPORT TAB — impact & status report (funnel · missed · savings · backlog SLA)
// ═════════════════════════════════════════════════════════════════════════════

const REPORT_BUCKET_ICON: Record<ReportBucket['bucket'], React.ElementType> = {
  purchasing: ShoppingCart,
  inventory:  Package,
  p2p:        Store,
  pos:        Banknote,
  other:      Sparkles,
}

const fmtNum = (n: number) => n.toLocaleString('en-US')
const fmtEgp = (n: number) => `${n.toLocaleString('en-US')} ج.م`

function ReportTab() {
  const [, setSearchParams] = useSearchParams()
  const [period, setPeriod] = useState<ReportPeriod>('week')

  const q = useQuery({
    queryKey: ['ai-center', 'report', period],
    queryFn:  () => aiCenterApi.report(period),
    refetchInterval: 60_000,
  })

  const goApprovals = () => setSearchParams({ tab: 'approvals' })

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 size={22} className="animate-spin" />
      </div>
    )
  }
  if (q.isError || !q.data) {
    return (
      <div className="py-16 text-center text-gray-500">
        <AlertCircle size={28} className="mx-auto mb-2 text-gray-300" />
        تعذّر تحميل التقرير. حاول مرة أخرى.
      </div>
    )
  }

  const r = q.data
  const nothing = r.proposed === 0 && r.executed === 0 && r.missed === 0 && r.backlog.pending === 0

  return (
    <div className="space-y-6">
      {/* period toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">تقرير أداء مساعديك الأذكياء</h2>
          <p className="text-sm text-gray-500">
            ماذا أنجزوا، كم وفّروا لك، وما الذي كاد يفوتك — {period === 'week' ? 'آخر ٧ أيام' : 'آخر ٣٠ يوماً'}.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm">
          {(['week', 'month'] as ReportPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg font-medium transition ${
                period === p ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p === 'week' ? 'أسبوع' : 'شهر'}
            </button>
          ))}
        </div>
      </div>

      {nothing ? (
        <div className="py-16 text-center">
          <PartyPopper size={32} className="mx-auto mb-3 text-emerald-400" />
          <p className="font-semibold text-gray-800">كله تمام — لا يوجد نشاط لعرضه في هذه الفترة.</p>
          <p className="text-sm text-gray-500">هيظهر هنا كل ما ينجزه مساعدوك أول ما يبدأوا العمل.</p>
        </div>
      ) : (
        <>
          {/* hero cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5">
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                <Wallet size={16} /> وفّرنا لك
              </div>
              <div className="mt-2 text-3xl font-extrabold text-emerald-800">{fmtEgp(r.realizedSavingsEgp)}</div>
              <p className="mt-1 text-xs text-emerald-700/80">من أوامر الشراء المنفّذة بعد موافقتك.</p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
              <div className="flex items-center gap-2 text-blue-700 text-sm font-medium">
                <CheckCircle2 size={16} /> قرارات نُفّذت
              </div>
              <div className="mt-2 text-3xl font-extrabold text-blue-800">{fmtNum(r.executed)}</div>
              <p className="mt-1 text-xs text-blue-700/80">من إجمالي {fmtNum(r.proposed)} اقتراحاً في الفترة.</p>
            </div>
            <button
              onClick={goApprovals}
              className={`text-right rounded-2xl border p-5 transition ${
                r.missed > 0
                  ? 'border-red-200 bg-gradient-to-br from-red-50 to-orange-50 hover:shadow-md'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className={`flex items-center gap-2 text-sm font-medium ${r.missed > 0 ? 'text-red-700' : 'text-gray-500'}`}>
                <AlertOctagon size={16} /> فاتك (انتهت المهلة)
              </div>
              <div className={`mt-2 text-3xl font-extrabold ${r.missed > 0 ? 'text-red-700' : 'text-gray-800'}`}>
                {fmtNum(r.missed)}
              </div>
              <p className={`mt-1 text-xs ${r.missed > 0 ? 'text-red-700/80' : 'text-gray-400'}`}>
                {r.missed > 0 ? 'قرارات انتهى وقتها قبل ما تتصرف — راجعها.' : 'ممتاز — لم يفتك أي قرار.'}
              </p>
            </button>
          </div>

          {/* funnel */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-4">مسار القرارات</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'مُقترَح',  value: r.proposed, color: 'text-gray-800',    bg: 'bg-gray-50 border-gray-200' },
                { label: 'مُعتمَد',  value: r.approved, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                { label: 'مُنفَّذ',  value: r.executed, color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
                { label: 'مرفوض',   value: r.rejected, color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200' },
                { label: 'فات',     value: r.missed,   color: 'text-red-700',     bg: 'bg-red-50 border-red-200' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-3 text-center ${s.bg}`}>
                  <div className={`text-2xl font-extrabold ${s.color}`}>{fmtNum(s.value)}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* per-bucket */}
          {r.byBucket.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4">حسب المجال</h3>
              <div className="space-y-2">
                {r.byBucket.map(b => {
                  const Icon = REPORT_BUCKET_ICON[b.bucket]
                  return (
                    <div key={b.bucket} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                      <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-600">
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 font-medium text-gray-800 text-sm">{b.labelAr}</div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-gray-500">مقترَح <b className="text-gray-800">{fmtNum(b.created)}</b></span>
                        <span className="text-blue-600">نُفّذ <b>{fmtNum(b.executed)}</b></span>
                        {b.missed > 0 && <span className="text-red-600">فات <b>{fmtNum(b.missed)}</b></span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* backlog SLA strip */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">حالة قائمة الانتظار الآن</h3>
              <button onClick={goApprovals} className="text-xs font-medium text-emerald-700 hover:underline flex items-center gap-1">
                افتح الموافقات <ChevronLeft size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-2xl font-extrabold text-gray-800">{fmtNum(r.backlog.pending)}</div>
                <div className="text-xs text-gray-500 mt-1">بانتظار قرارك</div>
              </div>
              <div className={`rounded-xl border p-3 ${r.backlog.expiringNext24h > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-2xl font-extrabold ${r.backlog.expiringNext24h > 0 ? 'text-orange-700' : 'text-gray-800'}`}>
                  {fmtNum(r.backlog.expiringNext24h)}
                </div>
                <div className="text-xs text-gray-500 mt-1">يخلص خلال ٢٤ ساعة</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-2xl font-extrabold text-gray-800">
                  {r.backlog.oldestPendingAgeHours != null ? `${Math.round(r.backlog.oldestPendingAgeHours)}س` : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">عمر أقدم قرار منتظر</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-2xl font-extrabold text-gray-800">
                  {r.avgTimeToDecideHours != null ? `${r.avgTimeToDecideHours}س` : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">متوسط زمن اتخاذ القرار</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TasksTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId   = searchParams.get('id')
  const explicitDomain = searchParams.get('domain') as DomainKind | null
  const stateParam = (searchParams.get('state') as 'open' | 'done' | null) ?? 'open'
  const domainParam = explicitDomain ?? 'purchasing'
  const setDomain = (k: DomainKind) => setSearchParams({ tab: 'tasks', domain: k, state: stateParam })
  const setStateView = (s: 'open' | 'done') => setSearchParams({ tab: 'tasks', domain: domainParam, state: s })
  const detailRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusId && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [focusId])

  // Counts per task type — fetch both pending + modified (both need user action).
  const openApprovals = useQuery({
    queryKey: ['ai-center', 'approvals', 'pending+modified', 'domains-all'],
    queryFn:  async () => {
      const [p, m] = await Promise.all([
        aiCenterApi.listApprovals({ status: 'pending',  limit: 200 }),
        aiCenterApi.listApprovals({ status: 'modified', limit: 200 }),
      ])
      return { ...p, data: [...p.data, ...m.data], total: p.total + m.total }
    },
    refetchInterval: 30_000,
  })

  const [doneLimit, setDoneLimit] = useState(150)
  const doneApprovals = useQuery({
    queryKey: ['ai-center', 'approvals', 'done', 'domains-all', doneLimit],
    enabled: stateParam === 'done',
    queryFn: async () => {
      const [approved, executed, rejected] = await Promise.all([
        aiCenterApi.listApprovals({ status: 'approved', limit: doneLimit }),
        aiCenterApi.listApprovals({ status: 'executed', limit: doneLimit }),
        aiCenterApi.listApprovals({ status: 'rejected', limit: doneLimit }),
      ])
      const merged = [...approved.data, ...executed.data, ...rejected.data]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      // serverTotal reflects the full history size so the UI knows if more pages exist.
      const serverTotal = approved.total + executed.total + rejected.total
      return { data: merged, total: merged.length, serverTotal }
    },
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
  // note: v5 uses placeholderData for prev-page retention

  const catalogLinkCount = useQuery({
    queryKey: ['inventory', 'suggested-count'],
    queryFn:  () => inventoryApi.getSuggestedCount(),
    refetchInterval: 30_000,
  })

  // Stable global totals for the open/done toggle (never depends on which view
  // is loaded, so the numbers don't jump). Shared query key = deduped.
  const counts = useQuery({
    queryKey: ['ai-center', 'counts'],
    queryFn:  aiCenterApi.approvalCounts,
    refetchInterval: 30_000,
  })
  const totalOpen = (counts.data?.pending ?? 0) + (counts.data?.modified ?? 0)
  const totalDone = (counts.data?.approved ?? 0) + (counts.data?.executed ?? 0) + (counts.data?.rejected ?? 0)

  const openCounts: Record<DomainKind, number> = useMemo(() => {
    const c: Record<DomainKind, number> = { purchasing: 0, inventory: 0, p2p: 0, pos: 0 }
    for (const a of openApprovals.data?.data ?? []) {
      const d = domainFromApproval(a)
      if (d) c[d]++
    }
    return c
  }, [openApprovals.data])

  const doneCounts: Record<DomainKind, number> = useMemo(() => {
    const c: Record<DomainKind, number> = { purchasing: 0, inventory: 0, p2p: 0, pos: 0 }
    for (const a of doneApprovals.data?.data ?? []) {
      const d = domainFromApproval(a)
      if (d) c[d]++
    }
    return c
  }, [doneApprovals.data])

  const openDomainApprovals = useMemo(
    () => (openApprovals.data?.data ?? []).filter(a => domainFromApproval(a) === domainParam),
    [openApprovals.data, domainParam],
  )
  const doneDomainApprovals = useMemo(
    () => (doneApprovals.data?.data ?? []).filter(a => domainFromApproval(a) === domainParam),
    [doneApprovals.data, domainParam],
  )

  const currentList = stateParam === 'open' ? openDomainApprovals : doneDomainApprovals

  const selectedDomain = DOMAIN_DEFS.find(d => d.key === domainParam) ?? DOMAIN_DEFS[0]

  // When the user arrives without choosing a sub-tab (e.g. from a notification
  // or the generic ?tab=tasks link) and the default queue is empty,
  // jump to the first domain that actually has pending tasks.
  const autoJumped = useRef(false)
  useEffect(() => {
    if (explicitDomain || autoJumped.current) return
    if (!openApprovals.data) return
    if ((openCounts.purchasing ?? 0) > 0) return
    const firstWithTasks = DOMAIN_DEFS.find(d => (openCounts[d.key] ?? 0) > 0)
    if (firstWithTasks?.key) {
      autoJumped.current = true
      setSearchParams({ tab: 'tasks', domain: firstWithTasks.key, state: 'open' }, { replace: true })
    }
  }, [explicitDomain, openApprovals.data, openCounts, setSearchParams])

  // Catalog-link suggestions are a separate inventory-items concern (NOT approval
  // tasks), so we surface them as a non-counted banner — never folded into the
  // domain count. This keeps every card's number exactly equal to its list.
  const showCatalogBanner = domainParam === 'inventory' && stateParam === 'open' && (catalogLinkCount.data ?? 0) > 0

  const focused = currentList.find(a => a.id === focusId)
    ?? (focusId ? ((stateParam === 'open' ? openApprovals.isLoading : doneApprovals.isLoading) ? undefined : null) : undefined)

  return (
    <div className="space-y-5">
      {/* Domain selector cards — simple 4-bucket UX */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {DOMAIN_DEFS.map(d => {
          const Icon = d.icon
          const active = d.key === domainParam
          const n = stateParam === 'open' ? openCounts[d.key] : doneCounts[d.key]
          return (
            <button
              key={d.key}
              onClick={() => setDomain(d.key)}
              className={`text-start p-4 rounded-2xl border transition-all ${
                active
                  ? 'border-emerald-400 bg-emerald-50/40 ring-2 ring-emerald-100'
                  : 'border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                  <Icon size={20} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm">{d.labelAr}</h3>
                    <span className={`min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                      n > 0 ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'
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

      {/* Open / Done state switch */}
      <div className="bg-white rounded-2xl border border-gray-200 p-2 inline-flex items-center gap-2">
        <button
          onClick={() => setStateView('open')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
            stateParam === 'open' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          غير مكتملة ({totalOpen})
        </button>
        <button
          onClick={() => setStateView('done')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
            stateParam === 'done' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          مكتملة ({totalDone})
        </button>
      </div>

      {/* Filtered list + detail (reuse same layout as ApprovalsTab) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2 text-xs text-gray-600">
            <span className="flex items-center gap-2">
              <selectedDomain.icon size={14} className="text-gray-500" />
              {selectedDomain.labelAr}
              {stateParam === 'open' ? ' — بانتظار قرارك' : ' — أُغلِقت مؤخراً'}
            </span>
            {domainParam === 'purchasing' && (
              <a href="/pharmacy/purchases/invoices" className="shrink-0 inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-semibold">
                <FileText size={12} /> فواتير الشراء
              </a>
            )}
            {domainParam === 'p2p' && (
              <a href="/pharmacy/p2p?tab=orders" className="shrink-0 inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold">
                <Store size={12} /> سوق التبادل
              </a>
            )}
            {domainParam === 'pos' && (
              <a href="/pharmacy/pos/shifts" className="shrink-0 inline-flex items-center gap-1 text-rose-700 hover:text-rose-900 font-semibold">
                <ShieldCheck size={12} /> سجل الشفتات
              </a>
            )}
          </div>

          {/* Catalog-link suggestions — separate concern, not counted as tasks. */}
          {showCatalogBanner && (
            <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-100 text-xs text-sky-800 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <LinkIcon size={13} className="shrink-0" />
                <span className="truncate">{catalogLinkCount.data} منتج مقترح ربطه بالكتالوج المركزي — للمراجعة</span>
              </span>
              <a href="/pharmacy/inventory?linkStatus=suggested" className="shrink-0 px-2.5 py-1 rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors text-[11px] font-semibold">راجعها</a>
            </div>
          )}

          {(stateParam === 'open' ? openApprovals.isLoading : doneApprovals.isLoading) ? (
            <SkeletonRows />
          ) : currentList.length === 0 ? (
            stateParam === 'done' ? (
              <EmptyState
                icon={CheckCircle2}
                iconCls="bg-emerald-100 text-emerald-700"
                title="لا توجد مهام مكتملة في هذه الفئة بعد"
                body="بمجرد الموافقة أو الرفض أو التنفيذ، ستظهر هنا كسجل مختصر يسهل مراجعته."
              />
            ) : domainParam === 'p2p' ? (
              <div className="py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                  <Store size={22} className="text-emerald-600" />
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">لا توجد قرارات سوق تنتظرك الآن</p>
                <p className="text-xs text-gray-500 mb-4 max-w-[320px] mx-auto leading-relaxed">
                  تشمل هذه الفئة اقتراحات الإدراج في البورصة وطلبات التبادل بين الصيدليات.
                  عند وجود أي قرار، ستجده هنا — أو تصفّح السوق مباشرة.
                </p>
                <a
                  href="/pharmacy/p2p?tab=insights"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors"
                >
                  <Store size={13} /> تصفح السوق
                </a>
              </div>
            ) : domainParam === 'purchasing' ? (
              <div className="py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto mb-3">
                  <ShoppingCart size={22} className="text-sky-600" />
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">لا توجد مهام شراء بانتظارك الآن</p>
                <p className="text-xs text-gray-500 mb-4 max-w-[340px] mx-auto leading-relaxed">
                  عند اقتراب نفاد أي صنف، يُنشئ النظام مسودة أمر شراء بأفضل سعر (مورّد أو بورصة) وتظهر هنا جاهزة لموافقتك.
                  لمتابعة أوامر الشراء المؤكّدة، افتح صفحة فواتير الشراء.
                </p>
                <a
                  href="/pharmacy/purchases/invoices"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-xl transition-colors"
                >
                  <FileText size={13} /> فواتير الشراء
                </a>
              </div>
            ) : domainParam === 'inventory' ? (
              <div className="py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-3">
                  <Package size={22} className="text-violet-600" />
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">لا توجد مهام مخزون بانتظارك الآن</p>
                <p className="text-xs text-gray-500 mb-4 max-w-[340px] mx-auto leading-relaxed">
                  تشمل هذه الفئة: النقص، المخزون الراكد، قرب انتهاء الصلاحية، توصيات الذكاء، وربط المنتجات بالكتالوج.
                  عند ظهور أي حالة تحتاج قراراً، ستجدها هنا مباشرة.
                </p>
                <a
                  href="/pharmacy/inventory"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors"
                >
                  <Package size={13} /> استعرض المخزون
                </a>
              </div>
            ) : (
              <div className="py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck size={22} className="text-rose-600" />
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">لا توجد تنبيهات كاشير بانتظارك الآن</p>
                <p className="text-xs text-gray-500 mb-4 max-w-[360px] mx-auto leading-relaxed">
                  عندما يرصد الذكاء فروقات نقدية أو سلوك غير معتاد في ورديات الكاشير، ستظهر هنا للمراجعة الفورية.
                  التنبيهات التي راجعتها تجدها في تبويب «مكتملة».
                </p>
                <a
                  href="/pharmacy/pos/shifts"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors"
                >
                  <ShieldCheck size={13} /> افتح سجل الشفتات
                </a>
              </div>
            )
          ) : (
            <>
              <ul className="divide-y divide-gray-100 max-h-[calc(100vh-26rem)] overflow-y-auto">
                {currentList.map(a => (
                  <ApprovalRow
                    key={a.id}
                    approval={a}
                    selected={false}
                    focused={focusId === a.id}
                    onToggleSelect={() => {}}
                    onFocus={() => setSearchParams({ tab: 'tasks', domain: domainParam, state: stateParam, id: a.id })}
                    showCheckbox={false}
                  />
                ))}
                {stateParam === 'done'
                  && (doneApprovals.data?.serverTotal ?? 0) > (doneApprovals.data?.data.length ?? 0) && (
                  <li className="p-3 text-center">
                    <button
                      onClick={() => setDoneLimit(l => l + 150)}
                      disabled={doneApprovals.isFetching}
                      className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center gap-2"
                    >
                      {doneApprovals.isFetching && <Loader2 size={13} className="animate-spin" />}
                      عرض المزيد من المكتملة
                    </button>
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
        <div ref={detailRef}>
          <ApprovalDetail
            approval={focused ?? null}
            onClose={() => setSearchParams({ tab: 'tasks', domain: domainParam, state: stateParam })}
          />
        </div>
      </div>
    </div>
  )
}

