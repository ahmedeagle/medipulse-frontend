import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Send, Loader2, Bot, ExternalLink, TrendingUp, Package, Clock, DollarSign, ShieldCheck, BarChart2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { chatApi, type ChatAnswer, type ResponseCard, type ChatActionButton } from '../../../../api/chat.api'
import clsx from 'clsx'

// ─── Report quick-link registry ────────────────────────────────────────────
const REPORTS = [
  { key: 'sales',       label: 'ذكاء المبيعات',    sub: 'الإيرادات والمنتجات الأكثر مبيعاً', route: '/pharmacy/reports/sales',       icon: TrendingUp,  color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  { key: 'inventory',   label: 'ذكاء المخزون',      sub: 'الكميات والمنتجات المنخفضة',        route: '/pharmacy/reports/inventory',   icon: Package,     color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-100' },
  { key: 'expiry',      label: 'ذكاء الصلاحيات',   sub: 'المنتجات قاربت انتهاء صلاحيتها',    route: '/pharmacy/reports/expiry',      icon: Clock,       color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-100' },
  { key: 'financial',   label: 'ذكاء الأرباح',      sub: 'الإيرادات النقدية والبطاقات',        route: '/pharmacy/reports/financial',   icon: DollarSign,  color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-100' },
  { key: 'compliance',  label: 'ذكاء الامتثال',    sub: 'طلبات الشراء وحالة الموردين',        route: '/pharmacy/reports/compliance',  icon: ShieldCheck, color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200' },
  { key: 'operational', label: 'ذكاء التشغيل',      sub: 'المنتجات الراكدة وكفاءة التوريد',   route: '/pharmacy/reports/operational', icon: BarChart2,   color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-100' },
]

const KEYWORD_ROUTES: Array<{ words: string[]; keys: string[] }> = [
  { words: ['مبيع', 'بيع', 'فاتور', 'عميل', 'ذروة'], keys: ['sales'] },
  { words: ['مخزون', 'كمية', 'نفد', 'نفاد', 'منتج'], keys: ['inventory'] },
  { words: ['صلاحية', 'انتهاء', 'تلف', 'هدر'], keys: ['expiry', 'operational'] },
  { words: ['ربح', 'إيراد', 'مالي', 'نقدي', 'بطاقة', 'كاش'], keys: ['financial'] },
  { words: ['طلب', 'مورد', 'شراء', 'توريد', 'متأخر'], keys: ['compliance', 'operational'] },
  { words: ['راكد', 'تشغيل', 'كفاءة'], keys: ['operational'] },
  { words: ['أداء', 'أبدأ', 'بداية', 'نظرة', 'كل', 'شامل', 'عام'], keys: ['sales', 'financial', 'inventory', 'expiry'] },
]

function detectReports(question: string) {
  const q = question
  const matched = new Set<string>()
  KEYWORD_ROUTES.forEach(({ words, keys }) => {
    if (words.some(w => q.includes(w))) keys.forEach(k => matched.add(k))
  })
  if (matched.size === 0) return REPORTS.slice(0, 3)
  return REPORTS.filter(r => matched.has(r.key))
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'ai'
  text?: string
  cards?: ResponseCard[]
  actions?: ChatActionButton[]
  reportLinks?: typeof REPORTS
  isError?: boolean
}

interface Props { domain: string; domainLabel: string; onClose: () => void }

const SUGGESTIONS: Record<string, string[]> = {
  sales:       ['ما المنتجات الأكثر مبيعاً هذا الشهر؟', 'هل هناك انخفاض في المبيعات؟'],
  inventory:   ['ما المنتجات التي ستنفد قريباً؟', 'ما الفئات الأكثر احتياجاً للتجديد؟'],
  expiry:      ['ما المنتجات التي ستنتهي خلال 30 يوم؟', 'كيف أتجنب خسائر الصلاحيات؟'],
  financial:   ['ما هامش الربح هذا الشهر؟', 'قارن الإيرادات النقدية بالبطاقات'],
  compliance:  ['ما الطلبات المتأخرة أكثر من 7 أيام؟', 'ما الموردون الأكثر تأخراً؟'],
  operational: ['ما المنتجات ذات أعلى تكلفة إهدار؟', 'كيف أحسّن كفاءة التوريد؟'],
  hub:         ['من أين أبدأ لفهم أداء صيدليتي؟', 'ما التقرير الأهم يومياً؟'],
}

const COLOR_CLS: Record<string, string> = {
  emerald: 'text-emerald-700 bg-emerald-50',
  amber:   'text-amber-700 bg-amber-50',
  red:     'text-red-700 bg-red-50',
  blue:    'text-blue-700 bg-blue-50',
}

// ─── Sub-renderers ───────────────────────────────────────────────────────────
function KpiRow({ items }: { items: Array<{ label: string; value: string; color: string }> }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {items.map((item, i) => (
        <div key={i} className={clsx('px-3 py-1.5 rounded-xl text-xs font-semibold', COLOR_CLS[item.color] ?? 'text-gray-700 bg-gray-100')}>
          <span className="opacity-60 font-normal block text-[10px]">{item.label}</span>
          {item.value}
        </div>
      ))}
    </div>
  )
}

function MiniTable({ title, columns, rows }: { title?: string; columns: Array<{ key: string; header: string; align?: string }>; rows: Record<string, string | number | null>[] }) {
  return (
    <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden text-xs">
      {title && <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 font-semibold text-gray-700">{title}</div>}
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map(c => <th key={c.key} className="px-2.5 py-1.5 text-gray-500 font-medium">{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0">
              {columns.map(c => <td key={c.key} className="px-2.5 py-1.5 text-gray-700">{row[c.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReportLinkCards({ links, navigate }: { links: typeof REPORTS; navigate: (r: string) => void }) {
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[10px] text-gray-400 font-medium">التقارير ذات الصلة</p>
      {links.map(r => {
        const Icon = r.icon
        return (
          <button key={r.key} onClick={() => navigate(r.route)}
            className={clsx('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-right transition-all hover:shadow-sm', r.bg, r.border)}>
            <div className={clsx('p-1.5 rounded-lg bg-white shrink-0', r.color)}>
              <Icon size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={clsx('text-xs font-semibold', r.color)}>{r.label}</p>
              <p className="text-[10px] text-gray-500 truncate">{r.sub}</p>
            </div>
            <ExternalLink size={11} className="text-gray-300 shrink-0" />
          </button>
        )
      })}
    </div>
  )
}

function ActionButtons({ actions, navigate }: { actions: ChatActionButton[]; navigate: (r: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {actions.filter(a => a.route).map((a, i) => (
        <button key={i} onClick={() => navigate(a.route!)}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-xl hover:bg-teal-700 transition-colors">
          {a.label}
          <ExternalLink size={10} />
        </button>
      ))}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export function AiReportAssistant({ domain, domainLabel, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const navigate                = useNavigate()
  const suggestions             = SUGGESTIONS[domain] ?? SUGGESTIONS['hub']

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text: string) => {
    if (!text.trim() || loading) return
    const q = text.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)

    try {
      const res: ChatAnswer = await chatApi.ask(q)

      if (res.type === 'not_configured') {
        // Don't show error — show relevant report links instead
        setMessages(prev => [...prev, {
          role: 'ai',
          text: 'يمكنك الإجابة على هذا السؤال مباشرة من التقارير التفصيلية.',
          reportLinks: detectReports(q),
        }])
      } else if (res.type === 'answer') {
        const reportLinks = detectReports(q)
        setMessages(prev => [...prev, {
          role: 'ai',
          text: res.text,
          cards: res.cards,
          actions: res.actions,
          reportLinks: reportLinks.length > 0 ? reportLinks : undefined,
        }])
      } else {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: 'تعذّر الاتصال بالخادم. تحقق من الشبكة وأعِد المحاولة.',
          isError: true,
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: 'تعذّر الاتصال بالخادم. تحقق من الشبكة وأعِد المحاولة.',
        isError: true,
      }])
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-y-0 end-0 w-[320px] max-w-[calc(100vw-16px)] bg-white shadow-2xl border-s border-gray-200 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-gray-100 bg-gradient-to-l from-teal-50 to-white shrink-0">
        <div className="p-1.5 bg-teal-100 rounded-lg shrink-0">
          <Bot size={15} className="text-teal-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">المساعد الذكي</p>
          <p className="text-xs text-gray-400 truncate">تقرير {domainLabel}</p>
        </div>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* Empty state — hub shows all report cards; domain shows suggestion chips */}
        {messages.length === 0 && (
          domain === 'hub' ? (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-3 text-center">اختر تقريراً للبدء، أو اسأل بالعربية</p>
              <div className="space-y-1.5">
                {REPORTS.map(r => {
                  const Icon = r.icon
                  return (
                    <button key={r.key} onClick={() => navigate(r.route)}
                      className={clsx('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-right transition-all hover:shadow-sm', r.bg, r.border)}>
                      <div className={clsx('p-1.5 rounded-lg bg-white shrink-0', r.color)}>
                        <Icon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={clsx('text-xs font-semibold', r.color)}>{r.label}</p>
                        <p className="text-[10px] text-gray-500 truncate">{r.sub}</p>
                      </div>
                      <ExternalLink size={11} className="text-gray-300 shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-400 text-center mb-3">اسأل بالعربية عن {domainLabel}</p>
              <div className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    className="w-full text-right text-xs px-3 py-2.5 bg-gray-50 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 rounded-xl border border-gray-100 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {/* Messages */}
        {messages.map((m, i) => (
          <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-teal-600 text-white text-sm leading-relaxed">
                {m.text}
              </div>
            ) : (
              <div className="max-w-[92%] w-full">
                {/* Text */}
                {m.text && !m.isError && (
                  <div className="px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-gray-100 text-gray-800 text-sm leading-relaxed">
                    {m.text}
                  </div>
                )}
                {m.isError && (
                  <div className="px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    {m.text}
                  </div>
                )}

                {/* Cards from API */}
                {m.cards?.map((card, ci) => (
                  <div key={ci}>
                    {card.type === 'kpi_row' && <KpiRow items={card.items} />}
                    {card.type === 'table' && <MiniTable title={card.title} columns={card.columns} rows={card.rows} />}
                    {card.type === 'action_confirmed' && (
                      <div className="mt-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-medium">
                        ✓ {card.message}
                      </div>
                    )}
                  </div>
                ))}

                {/* Action buttons from API */}
                {m.actions && m.actions.length > 0 && (
                  <ActionButtons actions={m.actions} navigate={navigate} />
                )}

                {/* Smart report links */}
                {m.reportLinks && m.reportLinks.length > 0 && (
                  <ReportLinkCards links={m.reportLinks} navigate={navigate} />
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-end">
            <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-br-sm">
              <Loader2 size={15} className="animate-spin text-gray-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-100 bg-gray-50/50 shrink-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            placeholder="اسأل عن التقرير…"
            className="flex-1 text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-400 transition-colors"
            dir="auto"
          />
          <button onClick={() => send(input)} disabled={!input.trim() || loading}
            className="p-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors">
            <Send size={14} />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center">
          <Sparkles size={9} className="inline me-0.5" />
          مساعد تحليلي — البيانات الأصلية هي المرجع
        </p>
      </div>
    </div>
  )
}
