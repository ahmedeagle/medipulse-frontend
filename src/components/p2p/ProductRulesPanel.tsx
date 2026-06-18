import { useState } from 'react'
import clsx from 'clsx'
import {
  AlertTriangle, XCircle, CheckCircle2, ChevronDown, ChevronUp,
  ExternalLink, Pencil, Check, X, Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RulesResult, ListingIssue, IssueCode } from '../../types/p2p'

// AI-suggested discount by near-expiry tier
const AI_SUGGESTIONS: Partial<Record<IssueCode, { ar: string; en: string }>> = {
  NEAR_EXPIRY_30: {
    ar: 'المساعد الذكي يقترح: أضف خصم 15-20% لتسريع البيع قبل انتهاء الصلاحية',
    en: 'AI suggests: add a 15–20% discount to move stock before expiry',
  },
  NEAR_EXPIRY_60: {
    ar: 'المساعد الذكي يقترح: خصم 10-15% يُسرّع البيع ويحمي هامش ربحك',
    en: 'AI suggests: a 10–15% discount accelerates sales while protecting your margin',
  },
  NEAR_EXPIRY_90: {
    ar: 'المساعد الذكي يقترح: ابدأ بخصم 5-10% مبكراً لتجنب خسارة أكبر لاحقاً',
    en: 'AI suggests: start with a 5–10% discount early to avoid larger losses later',
  },
}

interface InlineFixProps {
  issue: ListingIssue
  onFix: (field: string, value: string | number) => void
  isRTL: boolean
}

function InlineFix({ issue, onFix, isRTL }: InlineFixProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  if (!issue.field) return null

  const navigateCodes: IssueCode[] = ['UNLINKED_PRODUCT', 'EXPIRED', 'ZERO_STOCK']
  if (navigateCodes.includes(issue.code)) return null

  const placeholders: Partial<Record<IssueCode, string>> = {
    PRICE_ANOMALY:      isRTL ? 'أدخل السعر الجديد' : 'Enter new price',
    NEAR_EXPIRY_30:     isRTL ? 'نسبة الخصم %' : 'Discount %',
    NEAR_EXPIRY_60:     isRTL ? 'نسبة الخصم %' : 'Discount %',
    NEAR_EXPIRY_90:     isRTL ? 'نسبة الخصم %' : 'Discount %',
    BELOW_MIN_QTY:      isRTL ? 'الحد الأدنى للطلب' : 'Min order qty',
    DUPLICATE_LISTING:  isRTL ? 'سيتم إيقاف الإعلان المكرر' : 'Will pause duplicate',
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        <Pencil size={11} />
        {isRTL ? 'تعديل' : 'Fix inline'}
      </button>
    )
  }

  if (issue.code === 'DUPLICATE_LISTING') {
    return (
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => { onFix('pauseDuplicate', 1); setEditing(false) }}
          className="px-3 py-1.5 bg-amber-500 text-white text-xs rounded-lg font-medium hover:bg-amber-600"
        >
          {isRTL ? 'إيقاف الإعلان القديم' : 'Pause old listing'}
        </button>
        <button onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder={placeholders[issue.code] ?? ''}
        className="w-32 border border-blue-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        autoFocus
      />
      <button
        disabled={!val}
        onClick={() => { onFix(issue.field!, parseFloat(val)); setEditing(false); setVal('') }}
        className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
      >
        <Check size={14} />
      </button>
      <button onClick={() => setEditing(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
        <X size={14} />
      </button>
    </div>
  )
}

interface ProductRulesPanelProps {
  result: RulesResult | null
  isLoading?: boolean
  onInlineFix?: (field: string, value: string | number) => void
  inventoryHref?: string
}

export function ProductRulesPanel({
  result,
  isLoading,
  onInlineFix,
  inventoryHref = '/pharmacy/inventory',
}: ProductRulesPanelProps) {
  const { i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const [expanded, setExpanded] = useState(true)

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
      </div>
    )
  }

  if (!result) return null

  const total = result.blocking.length + result.warnings.length
  const allClear = total === 0

  if (allClear) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
        <span className="text-sm font-medium text-emerald-700">
          {isRTL ? 'المنتج جاهز للنشر — لا توجد مشكلات' : 'Product ready to publish — no issues'}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className={clsx(
          'w-full flex items-center justify-between px-4 py-3 text-sm font-semibold',
          result.blocking.length > 0
            ? 'bg-red-50 text-red-800 border-b border-red-100'
            : 'bg-amber-50 text-amber-800 border-b border-amber-100',
        )}
      >
        <div className="flex items-center gap-2">
          {result.blocking.length > 0 ? (
            <XCircle size={16} className="text-red-500 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          )}
          <span>
            {result.blocking.length > 0
              ? isRTL
                ? `${result.blocking.length} مشكلة تمنع النشر`
                : `${result.blocking.length} issue${result.blocking.length > 1 ? 's' : ''} blocking publish`
              : isRTL
                ? `${result.warnings.length} تحذير`
                : `${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}`}
          </span>
          {result.warnings.length > 0 && result.blocking.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-amber-100 text-amber-700">
              {isRTL ? `+ ${result.warnings.length} تحذير` : `+ ${result.warnings.length} warning`}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Issue list */}
      {expanded && (
        <ul className="divide-y divide-gray-100 bg-white">
          {result.blocking.map(issue => (
            <IssueRow
              key={issue.code}
              issue={issue}
              isRTL={isRTL}
              onInlineFix={onInlineFix}
              inventoryHref={inventoryHref}
            />
          ))}
          {result.warnings.map(issue => (
            <IssueRow
              key={issue.code}
              issue={issue}
              isRTL={isRTL}
              onInlineFix={onInlineFix}
              inventoryHref={inventoryHref}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function IssueRow({
  issue,
  isRTL,
  onInlineFix,
  inventoryHref,
}: {
  issue: ListingIssue
  isRTL: boolean
  onInlineFix?: (field: string, value: string | number) => void
  inventoryHref: string
}) {
  const navigateCodes: IssueCode[] = ['UNLINKED_PRODUCT', 'ZERO_STOCK', 'EXPIRED']
  const needsNavigation = navigateCodes.includes(issue.code)
  const aiSuggestion = AI_SUGGESTIONS[issue.code]

  const codeLabels: Record<IssueCode, { ar: string; en: string }> = {
    UNLINKED_PRODUCT:   { ar: 'المنتج غير مرتبط بالكتالوج', en: 'Product not linked to catalog' },
    EXPIRED:            { ar: 'المنتج منتهي الصلاحية',       en: 'Product is expired' },
    ZERO_STOCK:         { ar: 'لا يوجد مخزون',               en: 'Out of stock' },
    BELOW_MIN_QTY:      { ar: 'الكمية أقل من الحد الأدنى',   en: 'Qty below minimum order qty' },
    NEAR_EXPIRY_30:     { ar: 'تنتهي صلاحيته خلال 30 يوم',  en: 'Expires within 30 days' },
    NEAR_EXPIRY_60:     { ar: 'تنتهي صلاحيته خلال 60 يوم',  en: 'Expires within 60 days' },
    NEAR_EXPIRY_90:     { ar: 'تنتهي صلاحيته خلال 90 يوم',  en: 'Expires within 90 days' },
    PRICE_ANOMALY:      { ar: 'السعر أقل من سعر التكلفة',   en: 'Price below cost price' },
    DUPLICATE_LISTING:  { ar: 'إعلان مكرر لنفس المنتج',      en: 'Duplicate listing exists' },
  }

  const label = codeLabels[issue.code]
  const isBlocking = issue.severity === 'blocking'

  return (
    <li className={clsx('px-4 py-3', isBlocking ? 'bg-red-50/50' : 'bg-amber-50/30')}>
      {/* Main row — icon is first in DOM; dir="rtl" on the page puts it on the right automatically */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {isBlocking
            ? <XCircle size={15} className="text-red-500" />
            : <AlertTriangle size={15} className="text-amber-500" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className={clsx('text-sm font-medium', isBlocking ? 'text-red-800' : 'text-amber-800')}>
            {isRTL ? label.ar : label.en}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{issue.message}</p>

          {/* AI suggestion chip for near-expiry warnings */}
          {aiSuggestion && (
            <div className="mt-2 flex items-start gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-2">
              <Sparkles size={12} className="text-violet-500 mt-0.5 shrink-0" />
              <p className="text-xs text-violet-700 leading-relaxed">
                {isRTL ? aiSuggestion.ar : aiSuggestion.en}
              </p>
            </div>
          )}

          {/* Inline fix or navigation link */}
          {needsNavigation ? (
            <a
              href={inventoryHref}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <ExternalLink size={11} />
              {isRTL ? 'فتح المخزون للتصحيح' : 'Fix in inventory'}
            </a>
          ) : (
            onInlineFix && (
              <InlineFix issue={issue} onFix={onInlineFix} isRTL={isRTL} />
            )
          )}
        </div>

        <span className={clsx(
          'shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider',
          isBlocking ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600',
        )}>
          {isBlocking
            ? (isRTL ? 'يمنع النشر' : 'blocking')
            : (isRTL ? 'تحذير' : 'warning')}
        </span>
      </div>
    </li>
  )
}
