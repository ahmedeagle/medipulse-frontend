import { useState, useRef, useEffect } from 'react'
import { Send, X, Loader2, Sparkles, CheckCircle, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { useAuth } from 'react-oidc-context'
import { useChatIntents, QUICK_CHIPS, ChatResult, ActionButton, ResponseCard } from '../hooks/useChatIntents'
import { useProfileStore } from '../store/auth.store'
import { featureRequestsApi } from '../api/feature-requests.api'
import { chatApi } from '../api/chat.api'

// ── Message type ──────────────────────────────────────────────────────────────

interface Message {
  id: number
  role: 'user' | 'bot'
  text: string
  cards?: ResponseCard[]
  actions?: ActionButton[]
  notConfigured?: boolean
  question?: string
  loading?: boolean
  error?: boolean
}

let msgId = 0

// ── Not-configured bubble ─────────────────────────────────────────────────────

const NOT_CONFIGURED_REASONS: Record<string, string> = {
  'ربح': 'يتطلب ربط بيانات المبيعات من نقطة البيع (POS)',
  'مبيعات': 'يتطلب تفعيل وحدة المبيعات',
  'تقرير': 'التقارير المالية تحتاج ربط نقطة البيع',
  'فاتورة': 'يتطلب تفعيل وحدة الفواتير',
}

function getNotConfiguredHint(q: string): string {
  for (const [kw, reason] of Object.entries(NOT_CONFIGURED_REASONS)) {
    if (q.includes(kw)) return reason
  }
  return ''
}

function NotConfiguredMessage({ msg }: { msg: Message }) {
  const hint = getNotConfiguredHint((msg.question ?? '').toLowerCase())
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'done' | 'duplicate'>('idle')
  const [trackingNumber, setTrackingNumber] = useState('')

  const handleContribute = async () => {
    if (submitState !== 'idle') return
    setSubmitState('loading')
    try {
      const res = await featureRequestsApi.submit(msg.question ?? '', hint || undefined)
      setTrackingNumber(res.trackingNumber)
      setSubmitState('done')
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setTrackingNumber(err.response?.data?.trackingNumber ?? '')
        setSubmitState('duplicate')
      } else {
        setSubmitState('idle')
      }
    }
  }

  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
        <span className="text-xs">🤖</span>
      </div>
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl rounded-tl-sm px-3 py-3 shadow-sm max-w-[88%]">
        <p className="text-xs font-semibold text-emerald-800 mb-1">شكراً لسؤالك! 🤝</p>
        <p className="text-[11px] text-emerald-700 leading-relaxed mb-1">
          سؤالك سيساهم في تطوير الذكاء الاصطناعي لتغطية جميع احتياجات صيدليتك.
        </p>
        <p className="text-[11px] text-emerald-600 leading-relaxed mb-2">
          الذكاء الاصطناعي يتعلم من أسئلة الصيادلة — كل سؤال ترسله يساعدنا على بناء نظام أذكى يلبي احتياجاتك.
        </p>
        {hint && (
          <p className="text-[10px] text-emerald-600 bg-emerald-100 rounded-lg px-2 py-1 mb-2 leading-relaxed">{hint}</p>
        )}
        <p className="text-[10px] text-gray-400 mb-2.5">هذه الميزة قيد التطوير — سيتم إشعارك فور تفعيلها</p>

        {submitState === 'idle' && (
          <button onClick={handleContribute}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-semibold hover:bg-emerald-700 transition-colors">
            ساهم في التطوير ←
          </button>
        )}
        {submitState === 'loading' && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600">
            <Loader2 size={12} className="animate-spin" />
            <span>جارٍ إرسال سؤالك…</span>
          </div>
        )}
        {submitState === 'done' && (
          <p className="text-[11px] text-emerald-700 font-medium">
            ✓ تم! سؤالك في قائمة التطوير — <span className="font-mono bg-emerald-100 px-1 rounded">{trackingNumber}</span>
          </p>
        )}
        {submitState === 'duplicate' && (
          <p className="text-[11px] text-emerald-600">
            ✓ سؤالك مُسجَّل بالفعل — <span className="font-mono bg-emerald-100 px-1 rounded">{trackingNumber}</span>
          </p>
        )}
      </div>
    </div>
  )
}

// ── Response cards ─────────────────────────────────────────────────────────────

const COLOR_MAP = {
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', value: 'text-emerald-700', label: 'text-emerald-600' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   value: 'text-amber-700',   label: 'text-amber-600' },
  red:     { bg: 'bg-red-50',     border: 'border-red-200',     value: 'text-red-700',     label: 'text-red-600' },
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    value: 'text-blue-700',    label: 'text-blue-600' },
}

function KpiRowCard({ card }: { card: Extract<ResponseCard, { type: 'kpi_row' }> }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2.5">
      {card.items.map((item, i) => {
        const c = COLOR_MAP[item.color] ?? COLOR_MAP.emerald
        return (
          <div key={i} className={`flex flex-col items-center ${c.bg} border ${c.border} rounded-xl px-3 py-2 min-w-[72px]`}>
            <span className={`text-sm font-bold ${c.value} leading-tight`}>{item.value}</span>
            <span className={`text-[10px] ${c.label} text-center mt-0.5 leading-tight`}>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function TableCard({ card }: { card: Extract<ResponseCard, { type: 'table' }> }) {
  if (!card.rows.length) return null
  return (
    <div className="mt-2.5 rounded-xl border border-gray-200 overflow-hidden">
      {card.title && (
        <p className="text-[10px] font-semibold text-gray-500 px-2.5 py-1.5 bg-gray-50 border-b border-gray-200">{card.title}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {card.columns.map(col => (
                <th key={col.key}
                  className={clsx('px-2.5 py-1.5 font-semibold text-gray-500 whitespace-nowrap',
                    col.align === 'end' ? 'text-end' : 'text-start')}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/70">
                {card.columns.map(col => (
                  <td key={col.key}
                    className={clsx('px-2.5 py-2 text-gray-700',
                      col.align === 'end' ? 'text-end tabular-nums' : 'text-start')}>
                    {row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ActionConfirmedCard({ card, onNavigate }: {
  card: Extract<ResponseCard, { type: 'action_confirmed' }>
  onNavigate: (r: string) => void
}) {
  return (
    <div className="mt-2.5 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
      <CheckCircle size={14} className="text-emerald-600 shrink-0" />
      <span className="text-[11px] text-emerald-700 font-medium flex-1">{card.message}</span>
      {card.route && (
        <button onClick={() => onNavigate(card.route!)}
          className="shrink-0 flex items-center gap-0.5 text-[11px] text-emerald-700 font-semibold hover:text-emerald-900">
          راجع <ChevronRight size={11} />
        </button>
      )}
    </div>
  )
}

function ResponseCards({ cards, onNavigate }: { cards: ResponseCard[]; onNavigate: (r: string) => void }) {
  return (
    <>
      {cards.map((card, i) => {
        if (card.type === 'kpi_row')        return <KpiRowCard       key={i} card={card} />
        if (card.type === 'table')          return <TableCard         key={i} card={card} />
        if (card.type === 'action_confirmed') return <ActionConfirmedCard key={i} card={card} onNavigate={onNavigate} />
        return null
      })}
    </>
  )
}

// ── Action buttons ────────────────────────────────────────────────────────────

function ActionButtons({
  actions, msgId, executingMsgId, onNavigate, onExecute,
}: {
  actions: ActionButton[]
  msgId: number
  executingMsgId: number | null
  onNavigate: (route: string) => void
  onExecute: (actionType: string, msgId: number) => void
}) {
  if (!actions.length) return null
  const isExecuting = executingMsgId === msgId

  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5">
      {actions.map((a) => {
        const isExec = !!a.actionType
        return (
          <button
            key={a.route ?? a.actionType}
            onClick={() => isExec ? onExecute(a.actionType!, msgId) : onNavigate(a.route!)}
            disabled={isExec && isExecuting}
            className={clsx(
              'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all shadow-sm',
              isExec
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60'
                : 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50',
            )}
          >
            {isExec && isExecuting ? <Loader2 size={11} className="animate-spin" /> : null}
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

// ── BotMessage ────────────────────────────────────────────────────────────────

function BotMessage({ msg, tenantName, onNavigate, onExecute, executingMsgId }: {
  msg: Message
  tenantName: string
  onNavigate: (route: string) => void
  onExecute: (actionType: string, msgId: number) => void
  executingMsgId: number | null
}) {
  if (msg.loading) {
    return (
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
          <span className="text-xs">🤖</span>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm">
          <Loader2 size={14} className="text-emerald-600 animate-spin" />
        </div>
      </div>
    )
  }

  if (msg.notConfigured) return <NotConfiguredMessage msg={msg} />

  if (msg.error) {
    return (
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
          <span className="text-xs">🤖</span>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm">
          <p className="text-xs text-red-600">{msg.text || 'حدث خطأ أثناء معالجة سؤالك. حاول مرة أخرى.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
        <span className="text-xs">🤖</span>
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm max-w-[90%]">
        {/* Headline text */}
        {msg.text && (
          <p className="text-xs text-gray-700 leading-relaxed font-medium">{msg.text}</p>
        )}

        {/* Structured cards */}
        {msg.cards && msg.cards.length > 0 && (
          <ResponseCards cards={msg.cards} onNavigate={onNavigate} />
        )}

        {/* Action buttons */}
        {msg.actions && msg.actions.length > 0 && (
          <ActionButtons
            actions={msg.actions}
            msgId={msg.id}
            executingMsgId={executingMsgId}
            onNavigate={onNavigate}
            onExecute={onExecute}
          />
        )}
      </div>
    </div>
  )
}

// ── Onboarding modal ──────────────────────────────────────────────────────────

const ONBOARDING_KEY = 'ai_widget_seen_v1'

const ONBOARDING_FEATURES = [
  { icon: '📦', title: 'المخزون الحرج', example: '"ما المنتجات التي نفد مخزونها؟"' },
  { icon: '⏰', title: 'انتهاء الصلاحية', example: '"ماذا سينتهي هذا الشهر؟"' },
  { icon: '🛑', title: 'البضاعة الراكدة', example: '"ما المنتجات التي لم تتحرك؟"' },
  { icon: '🛒', title: 'توصيات الشراء', example: '"ماذا أطلب هذا الأسبوع؟"' },
  { icon: '💡', title: 'فرص P2P', example: '"ما العروض المتاحة في السوق؟"' },
]

function AIOnboardingModal({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onStart} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="bg-emerald-600 px-6 py-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3 text-2xl">🤖</div>
          <h2 className="text-white text-lg font-bold">مساعدك الذكي للصيدلية</h2>
          <p className="text-emerald-100 text-xs mt-1">اسأل بالعربية أو الإنجليزية — يجيب بالبيانات الحقيقية</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {ONBOARDING_FEATURES.map(f => (
            <div key={f.title} className="flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">{f.icon}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{f.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{f.example}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onStart}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
            <Sparkles size={16} />
            ابدأ الآن ←
          </button>
          <p className="text-center text-[10px] text-gray-400 mt-2">كل إجابة مبنية على بيانات صيدليتك الحقيقية</p>
        </div>
      </div>
    </div>
  )
}

// ── Welcome message ───────────────────────────────────────────────────────────

const WELCOME_MSG: Message = {
  id: -1,
  role: 'bot',
  text: 'مرحباً! أنا مساعد ميدي بولس 🤖\nاسألني عن مخزونك، توصيات الشراء، انتهاء الصلاحية، فرص P2P، أو ملخص يومك.',
}

// ── Main ChatWidget ───────────────────────────────────────────────────────────

export function ChatWidget() {
  const [open, setOpen]                 = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [messages, setMessages]         = useState<Message[]>([WELCOME_MSG])
  const [input, setInput]               = useState('')
  const [busy, setBusy]                 = useState(false)
  const [executingMsgId, setExecutingMsgId] = useState<number | null>(null)
  const bottomRef                       = useRef<HTMLDivElement>(null)
  const inputRef                        = useRef<HTMLInputElement>(null)

  // ── Draggable position ─────────────────────────────────────────────────────
  const [pos, setPos] = useState<{ right: number; bottom: number }>(() => {
    try {
      const s = localStorage.getItem('chatWidgetPos')
      return s ? JSON.parse(s) : { right: 20, bottom: 20 }
    } catch { return { right: 20, bottom: 20 } }
  })
  const hasDragged = useRef(false)
  const dragState  = useRef({ active: false, startX: 0, startY: 0, startRight: 20, startBottom: 20 })

  const handleButtonMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    hasDragged.current = false
    dragState.current  = { active: true, startX: e.clientX, startY: e.clientY, startRight: pos.right, startBottom: pos.bottom }

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current.active) return
      const dx = dragState.current.startX - ev.clientX
      const dy = dragState.current.startY - ev.clientY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasDragged.current = true
      const next = {
        right:  Math.max(8, Math.min(window.innerWidth  - 80, dragState.current.startRight  + dx)),
        bottom: Math.max(8, Math.min(window.innerHeight - 80, dragState.current.startBottom + dy)),
      }
      setPos(next)
      try { localStorage.setItem('chatWidgetPos', JSON.stringify(next)) } catch {}
    }
    const onUp = () => {
      dragState.current.active = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }

  const handleButtonClick = () => {
    if (hasDragged.current) { hasDragged.current = false; return }
    if (open) { setOpen(false); return }
    handleOpenWidget()
  }
  const { resolveIntent }               = useChatIntents()
  const { profile }                     = useProfileStore()
  const auth                            = useAuth()
  const navigate                        = useNavigate()
  const tenantName                      = profile?.tenant?.name ?? ''

  const handleNavigate = (route: string) => { setOpen(false); navigate(route) }

  const handleExecuteAction = async (actionType: string, targetMsgId: number) => {
    if (executingMsgId !== null) return
    setExecutingMsgId(targetMsgId)
    try {
      const result = await chatApi.execute(actionType)
      setMessages(prev => prev.map(m =>
        m.id === targetMsgId
          ? { ...m, cards: [...(m.cards ?? []), { type: 'action_confirmed' as const, message: result.message, route: result.route }] }
          : m
      ))
    } catch {
      // silent — button returns to normal state
    } finally {
      setExecutingMsgId(null)
    }
  }

  const handleOpenWidget = () => {
    if (!open && !localStorage.getItem(ONBOARDING_KEY)) {
      setShowOnboarding(true)
    } else {
      setOpen(o => !o)
    }
  }

  const handleOnboardingStart = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setShowOnboarding(false)
    setOpen(true)
  }

  const kcRoles: string[] = (auth.user as any)?.realm_access?.roles ?? []
  const role = profile?.role ?? (kcRoles.some(r => r.startsWith('pharmacy')) ? 'pharmacy_pending' : '')

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!role.startsWith('pharmacy')) return null

  const send = async (text: string) => {
    if (!text.trim() || busy) return
    setInput('')
    setBusy(true)

    const userMsg: Message  = { id: ++msgId, role: 'user', text: text.trim() }
    const loadingMsg: Message = { id: ++msgId, role: 'bot', loading: true, text: '' }
    setMessages(prev => [...prev, userMsg, loadingMsg])

    const result: ChatResult = await resolveIntent(text.trim())

    setMessages(prev => {
      const without = prev.filter(m => !m.loading)
      let botMsg: Message

      if (result.type === 'answer') {
        botMsg = { id: ++msgId, role: 'bot', text: result.text, cards: result.cards, actions: result.actions }
      } else if (result.type === 'not_configured') {
        botMsg = { id: ++msgId, role: 'bot', notConfigured: true, question: result.question, text: '' }
      } else {
        botMsg = { id: ++msgId, role: 'bot', error: true, text: result.message ?? '' }
      }
      return [...without, botMsg]
    })
    setBusy(false)
  }

  const hasUnread = !open && messages.length > 1

  return (
    <>
      {showOnboarding && <AIOnboardingModal onStart={handleOnboardingStart} />}

      {/* Floating pill button — draggable */}
      <button
        onMouseDown={handleButtonMouseDown}
        onClick={handleButtonClick}
        style={{ position: 'fixed', right: Math.max(8, pos.right), bottom: Math.max(8, pos.bottom) }}
        className={clsx(
          'z-50 shadow-xl flex items-center gap-2 transition-colors duration-150 select-none cursor-grab active:cursor-grabbing',
          open
            ? 'w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-800 justify-center'
            : 'h-11 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-200 hover:shadow-lg',
        )}
        aria-label="اسأل الذكاء الاصطناعي"
      >
        {open ? (
          <X size={18} className="text-white" />
        ) : (
          <>
            <Sparkles size={16} className="text-white shrink-0" />
            <span className="text-white text-sm font-semibold whitespace-nowrap">اسأل AI</span>
          </>
        )}
        {hasUnread && (
          <span className="absolute -top-0.5 -end-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="z-50 w-[min(340px,calc(100vw-16px))] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ position: 'fixed', right: Math.max(8, pos.right), bottom: Math.max(8, pos.bottom) + 60, height: '520px' }}
          dir="rtl"
        >
          {/* Header */}
          <div className="bg-emerald-600 px-4 py-3 flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base">🤖</div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">مساعد ميدي بولس</p>
              {tenantName && <p className="text-emerald-100 text-[11px] truncate">{tenantName}</p>}
            </div>
            {/* Direct line to a human via WhatsApp — most visible point for support */}
            <a
              href={(() => {
                const raw = (import.meta as any).env?.VITE_SUPPORT_WHATSAPP ?? '201000000000';
                const phone = String(raw).replace(/\D/g, '');
                const greeting = encodeURIComponent('مرحباً، أحتاج مساعدة من فريق الدعم في MediPulse');
                return `https://wa.me/${phone}?text=${greeting}`;
              })()}
              target="_blank"
              rel="noopener noreferrer"
              title="تواصل مع موظف دعم حقيقي عبر واتساب"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold transition-colors"
            >
              <span aria-hidden>💬</span>
              <span className="hidden sm:inline">دعم بشري</span>
            </a>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {messages.map(msg => (
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-start">
                  <div className="bg-emerald-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 max-w-[80%] shadow-sm">
                    <p className="text-xs leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              ) : (
                <BotMessage
                  key={msg.id}
                  msg={msg}
                  tenantName={tenantName}
                  onNavigate={handleNavigate}
                  onExecute={handleExecuteAction}
                  executingMsgId={executingMsgId}
                />
              )
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Quick chips — always visible */}
          <div className="px-3 pt-2 pb-1 border-t border-gray-100 bg-white shrink-0">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-2">
              {QUICK_CHIPS.map(chip => (
                <button
                  key={chip.trigger}
                  onClick={() => send(chip.trigger)}
                  disabled={busy}
                  className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] rounded-full font-medium hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 disabled:opacity-40"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-gray-100 bg-white shrink-0 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(input)}
              placeholder="اسأل عن مخزونك…"
              disabled={busy}
              className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 placeholder:text-gray-400 disabled:opacity-50"
            />
            <button
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center hover:bg-emerald-700 disabled:opacity-40 transition-colors shrink-0"
            >
              {busy
                ? <Loader2 size={13} className="text-white animate-spin" />
                : <Send size={13} className="text-white" />
              }
            </button>
          </div>
        </div>
      )}
    </>
  )
}
