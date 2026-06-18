import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, HelpCircle, Sparkles, AlertCircle } from 'lucide-react'
import clsx from 'clsx'

export interface GuideStep {
  targetId?: string
  titleAr: string
  titleEn: string
  bodyAr: string
  bodyEn: string
  beforeActivate?: () => void | Promise<void>
  /** Return false to block Next and show the validation message */
  validate?: () => boolean
  validationMsgAr?: string
  validationMsgEn?: string
}

export interface Guide {
  id: string
  labelAr: string
  labelEn: string
  emoji: string
  steps: GuideStep[]
}

interface Rect { top: number; left: number; width: number; height: number }
interface Props { guides: Guide[]; isRTL: boolean }

const RING_PAD = 7   // px padding around the spotlight ring
const TOOLTIP_W = 300

function waitFrames(n = 3) {
  return new Promise<void>(resolve => {
    let c = 0
    const tick = () => { if (++c >= n) resolve(); else requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
}

export function SpotlightGuide({ guides, isRTL }: Props) {
  const [menuOpen, setMenuOpen]             = useState(false)
  const [activeGuide, setActiveGuide]       = useState<Guide | null>(null)
  const [stepIdx, setStepIdx]               = useState(0)
  const [targetRect, setTargetRect]         = useState<Rect | null>(null)
  const [validationError, setValidationError] = useState(false)
  const rafRef    = useRef<number>(0)
  // Always hold a fresh reference to guides so validate() closures see current state
  const guidesRef = useRef(guides)
  useEffect(() => { guidesRef.current = guides }, [guides])

  const currentStep = activeGuide?.steps[stepIdx]
  const freshStep   = guidesRef.current.find(g => g.id === activeGuide?.id)?.steps[stepIdx]
  const totalSteps  = activeGuide?.steps.length ?? 0
  const isLast      = stepIdx === totalSteps - 1

  // ── Spotlight polling ────────────────────────────────────────────────────────
  useEffect(() => {
    setTargetRect(null)
    setValidationError(false)
    cancelAnimationFrame(rafRef.current)
    if (!currentStep?.targetId) return
    const id = currentStep.targetId
    let found = false, misses = 0
    const measure = () => {
      const el = document.getElementById(id)
      if (el) {
        if (!found) { found = true; el.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
        const r = el.getBoundingClientRect()
        setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else {
        if (++misses > 120) return
      }
      rafRef.current = requestAnimationFrame(measure)
    }
    rafRef.current = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, activeGuide?.id])

  // ── Navigation ───────────────────────────────────────────────────────────────
  const applyStep = useCallback(async (guide: Guide, idx: number) => {
    const step = guide.steps[idx]
    if (step?.beforeActivate) { await step.beforeActivate(); await waitFrames() }
    setStepIdx(idx)
  }, [])

  const startGuide = useCallback(async (guide: Guide) => {
    setMenuOpen(false); setActiveGuide(guide); await applyStep(guide, 0)
  }, [applyStep])

  const goNext = useCallback(async () => {
    if (!activeGuide) return
    // Use freshStep so validate() closure captures current form state
    if (freshStep?.validate && !freshStep.validate()) {
      setValidationError(true)
      return
    }
    setValidationError(false)
    const next = stepIdx + 1
    if (next >= activeGuide.steps.length) { setActiveGuide(null); return }
    await applyStep(activeGuide, next)
  }, [activeGuide, stepIdx, applyStep, freshStep])

  const goPrev = useCallback(async () => {
    if (!activeGuide || stepIdx === 0) return
    setValidationError(false)
    await applyStep(activeGuide, stepIdx - 1)
  }, [activeGuide, stepIdx, applyStep])

  const closeGuide = useCallback(() => {
    setActiveGuide(null); setTargetRect(null); setValidationError(false)
  }, [])

  // ── Tooltip position ─────────────────────────────────────────────────────────
  let tooltipStyle: React.CSSProperties = {}
  let arrowLeft = 0
  let arrowOnTop = true

  if (targetRect) {
    const cx   = targetRect.left + targetRect.width / 2
    const rawL = cx - TOOLTIP_W / 2
    const L    = Math.max(14, Math.min(rawL, window.innerWidth - TOOLTIP_W - 14))
    arrowLeft  = Math.max(8, Math.min(cx - L - 6, TOOLTIP_W - 22))
    arrowOnTop = (window.innerHeight - targetRect.top - targetRect.height) >= 200
    tooltipStyle = arrowOnTop
      ? { top: targetRect.top + targetRect.height + RING_PAD + 10, left: L }
      : { bottom: window.innerHeight - targetRect.top + RING_PAD + 10, left: L }
  } else if (activeGuide) {
    tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
  }

  return (
    <>
      {/* ── Active guide ── */}
      {activeGuide && currentStep && (
        <>
          {/* 4-panel frame — pointer-events-none so the TARGET ELEMENT stays interactive */}
          {targetRect ? (
            <>
              <div className="fixed inset-x-0 top-0 z-[9000] pointer-events-none"
                style={{ height: Math.max(0, targetRect.top - RING_PAD), background: 'rgba(0,0,0,0.48)' }} />
              <div className="fixed inset-x-0 bottom-0 z-[9000] pointer-events-none"
                style={{ top: targetRect.top + targetRect.height + RING_PAD, background: 'rgba(0,0,0,0.48)' }} />
              <div className="fixed left-0 z-[9000] pointer-events-none"
                style={{ top: targetRect.top - RING_PAD, height: targetRect.height + RING_PAD * 2,
                         width: Math.max(0, targetRect.left - RING_PAD), background: 'rgba(0,0,0,0.48)' }} />
              <div className="fixed right-0 z-[9000] pointer-events-none"
                style={{ top: targetRect.top - RING_PAD, height: targetRect.height + RING_PAD * 2,
                         left: targetRect.left + targetRect.width + RING_PAD, background: 'rgba(0,0,0,0.48)' }} />
              {/* Emerald ring around target */}
              <div className="fixed z-[9001] pointer-events-none"
                style={{
                  top: targetRect.top - RING_PAD, left: targetRect.left - RING_PAD,
                  width: targetRect.width + RING_PAD * 2, height: targetRect.height + RING_PAD * 2,
                  borderRadius: 12, border: '2.5px solid #10b981',
                  boxShadow: '0 0 0 3px rgba(16,185,129,0.2), 0 0 18px rgba(16,185,129,0.35)',
                }} />
            </>
          ) : (
            // No target yet — very light tint only
            <div className="fixed inset-0 z-[9000] pointer-events-none" style={{ background: 'rgba(0,0,0,0.25)' }} />
          )}

          {/* Tooltip */}
          <div
            className="fixed z-[9002] pointer-events-auto transition-all duration-300"
            style={{ width: TOOLTIP_W, ...tooltipStyle }}
            onClick={e => e.stopPropagation()}
          >
            {targetRect && (
              <div className="absolute w-3 h-3 bg-white rotate-45"
                style={{
                  [arrowOnTop ? 'top' : 'bottom']: -6, left: arrowLeft,
                  ...(arrowOnTop
                    ? { borderTop: '1px solid #e5e7eb', borderLeft: '1px solid #e5e7eb' }
                    : { borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }),
                }} />
            )}

            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                  <Sparkles size={11} />
                  {isRTL ? activeGuide.labelAr : activeGuide.labelEn}
                </span>
                <button onClick={closeGuide}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                  <X size={13} />
                </button>
              </div>

              <h3 className="text-sm font-bold text-gray-900 mb-1.5">
                {isRTL ? currentStep.titleAr : currentStep.titleEn}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">
                {isRTL ? currentStep.bodyAr : currentStep.bodyEn}
              </p>

              {/* Validation error banner */}
              {validationError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
                  <AlertCircle size={13} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">
                    {isRTL
                      ? (freshStep?.validationMsgAr ?? 'أكمل هذه الخطوة أولاً للمتابعة')
                      : (freshStep?.validationMsgEn ?? 'Complete this step first to continue')}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {activeGuide.steps.map((_, i) => (
                    <div key={i} className={clsx(
                      'rounded-full transition-all duration-300',
                      i === stepIdx  ? 'w-5 h-1.5 bg-emerald-500'
                      : i < stepIdx ? 'w-1.5 h-1.5 bg-emerald-300'
                                    : 'w-1.5 h-1.5 bg-gray-200',
                    )} />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {stepIdx > 0 && (
                    <button onClick={goPrev}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                      {isRTL ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>
                  )}
                  <button onClick={goNext}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors">
                    {isLast ? (isRTL ? 'تم ✓' : 'Done ✓') : (isRTL ? 'التالي' : 'Next')}
                    {!isLast && (isRTL ? <ChevronLeft size={12} /> : <ChevronRight size={12} />)}
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-gray-400 mt-2 text-end">
                {isRTL ? `${stepIdx + 1} من ${totalSteps}` : `${stepIdx + 1} of ${totalSteps}`}
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── Guide picker ── */}
      {menuOpen && !activeGuide && (
        <>
          <div className="fixed inset-0 z-[8998]" onClick={() => setMenuOpen(false)} />
          <div className="fixed bottom-24 end-6 z-[8999] bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-72 pointer-events-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-gray-900">{isRTL ? 'كيف يمكنني مساعدتك؟' : 'How can I help?'}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{isRTL ? 'اختر مهمة وسأرشدك خطوة بخطوة' : "Pick a task — I'll guide you step by step"}</p>
              </div>
              <button onClick={() => setMenuOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1">
              {guides.map(g => (
                <button key={g.id} onClick={() => startGuide(g)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-start hover:bg-emerald-50 transition-colors group">
                  <span className="text-xl">{g.emoji}</span>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-700 flex-1">
                    {isRTL ? g.labelAr : g.labelEn}
                  </span>
                  <ChevronLeft size={14} className={clsx('text-gray-300 group-hover:text-emerald-400', !isRTL && 'rotate-180')} />
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-3 pt-3 border-t border-gray-100">
              {isRTL ? 'اضغط خارج للإغلاق' : 'Click outside to close'}
            </p>
          </div>
        </>
      )}

      {/* ── Floating button ── */}
      {!activeGuide && (
        <button onClick={() => setMenuOpen(o => !o)}
          className={clsx(
            'fixed bottom-6 end-6 z-[8997] flex items-center gap-2 h-12 shadow-xl transition-all duration-200 font-semibold',
            menuOpen
              ? 'w-12 rounded-full bg-gray-800 text-white justify-center px-0'
              : 'px-4 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 hover:scale-[1.03]',
          )}>
          {menuOpen
            ? <X size={18} />
            : <><HelpCircle size={18} className="shrink-0" /><span className="text-sm">{isRTL ? 'أرشدني' : 'Guide Me'}</span></>}
        </button>
      )}
    </>
  )
}
