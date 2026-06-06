import { useState } from 'react'
import {
  Sparkles, Brain, Barcode, Building2, FlaskConical, Pill,
  CheckCircle2, ShieldCheck, Eye, ArrowLeft, Loader2, X,
  Database, Target,
} from 'lucide-react'

interface AIMatchingWizardProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Fires when the user confirms. Parent should enqueue the rematch job
   * and then close the wizard — live progress is shown by the
   * ImportProgressToast (persistent, non-blocking).
   */
  onConfirm: () => void
  /** Brief spinner while the enqueue HTTP call is in flight (≤ 1 s typically). */
  isPending: boolean
  unlinkedCount: number
}

const SIGNALS = [
  { icon: Barcode,       label: 'الباركود',      desc: 'تطابق دقيق للباركود = ربط فوري', color: 'emerald' },
  { icon: CheckCircle2,  label: 'اسم المنتج',    desc: 'تشابه ذكي عربي/إنجليزي + معالجة التشكيل', color: 'blue' },
  { icon: Building2,     label: 'المُصنّع',       desc: 'مطابقة الشركة المصنّعة',          color: 'purple' },
  { icon: FlaskConical,  label: 'التركيز',       desc: '500mg, 1g, 5%, 10ml…',           color: 'cyan' },
  { icon: Pill,          label: 'الشكل الصيدلاني', desc: 'أقراص، شراب، كريم، حقن…',         color: 'indigo' },
]

const COLORS: Record<string, { bg: string; text: string; border: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  purple:  { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
}

export function AIMatchingWizard({ isOpen, onClose, onConfirm, isPending, unlinkedCount }: AIMatchingWizardProps) {
  const [step, setStep] = useState<'intro' | 'how' | 'confirm'>('intro')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/60 via-blue-900/60 to-teal-900/60 backdrop-blur-sm" onClick={!isPending ? onClose : undefined} />
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Animated header */}
        <div className="relative bg-gradient-to-br from-violet-600 via-fuchsia-600 to-teal-600 p-6 text-white overflow-hidden">
          {/* Glow orbs */}
          <div className="absolute -top-10 -end-10 w-40 h-40 bg-white/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-10 -start-10 w-32 h-32 bg-fuchsia-400/30 rounded-full blur-3xl" />

          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30">
                <Brain size={28} className="animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-bold">مساعد الذكاء الاصطناعي</h2>
                <p className="text-white/80 text-sm mt-0.5">مطابقة المخزون مع الكتالوج المركزي</p>
              </div>
            </div>
            {!isPending && (
              <button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl">
                <X size={20} />
              </button>
            )}
          </div>

          {/* Progress dots */}
          <div className="relative mt-5 flex items-center gap-2">
            {(['intro', 'how', 'confirm'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`h-1.5 flex-1 rounded-full transition-all ${
                  step === s ? 'bg-white' : (['intro','how','confirm'].indexOf(step) > i ? 'bg-white/80' : 'bg-white/30')
                }`} />
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'intro' ? (
            /* ── STEP 1: INTRO ──────────────────────────────────────── */
            <div className="space-y-5">
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">ماذا سيحدث الآن؟</h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                  سيقوم الذكاء الاصطناعي بفحص <span className="font-bold text-violet-700">{unlinkedCount} منتج</span> غير مربوط في مخزونك ومقارنتها بالكتالوج المركزي.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
                  <div className="p-2 bg-blue-200/50 rounded-lg w-fit mb-2"><Database size={18} className="text-blue-700" /></div>
                  <p className="font-bold text-blue-900 text-sm">١. الفحص</p>
                  <p className="text-xs text-blue-800 mt-1 leading-relaxed">يحلل كل منتج (الاسم، الباركود، المُصنّع…)</p>
                </div>
                <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-50 to-violet-100 border border-violet-200">
                  <div className="p-2 bg-violet-200/50 rounded-lg w-fit mb-2"><Target size={18} className="text-violet-700" /></div>
                  <p className="font-bold text-violet-900 text-sm">٢. الترشيح</p>
                  <p className="text-xs text-violet-800 mt-1 leading-relaxed">يحسب درجة ثقة (0-100) لكل احتمال</p>
                </div>
                <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200">
                  <div className="p-2 bg-emerald-200/50 rounded-lg w-fit mb-2"><ShieldCheck size={18} className="text-emerald-700" /></div>
                  <p className="font-bold text-emerald-900 text-sm">٣. القرار</p>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">ربط تلقائي ≥95٪ · مراجعتك للباقي</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex gap-3">
                <ShieldCheck size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-900 text-sm">آمن تماماً</p>
                  <p className="text-xs text-amber-800 leading-relaxed mt-0.5">
                    لن يتم تعديل بيانات منتجاتك. الربط فقط يضيف مرجعاً للكتالوج المركزي ويمكنك إلغاؤه في أي وقت.
                  </p>
                </div>
              </div>
            </div>
          ) : step === 'how' ? (
            /* ── STEP 2: HOW IT WORKS ──────────────────────────────── */
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">كيف يحدد الذكاء الاصطناعي المطابقة؟</h3>
                <p className="text-sm text-gray-500">يستخدم 5 إشارات رئيسية لحساب درجة الثقة:</p>
              </div>

              <div className="space-y-2">
                {SIGNALS.map(({ icon: Icon, label, desc, color }) => {
                  const c = COLORS[color]
                  return (
                    <div key={label} className={`flex items-center gap-3 p-3 rounded-xl border ${c.bg} ${c.border}`}>
                      <div className={`p-2 bg-white rounded-lg shadow-sm ${c.text}`}><Icon size={16} /></div>
                      <div className="flex-1">
                        <p className={`font-bold text-sm ${c.text}`}>{label}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200">
                <p className="font-bold text-gray-900 text-sm mb-2">منطق القرار:</p>
                <div className="space-y-1.5 text-xs text-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="w-16 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold text-center">≥95٪</span>
                    <span>+ باركود مطابق → ربط تلقائي فوري</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-16 px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold text-center">≥70٪</span>
                    <span>اقتراح يتم عرضه للمراجعة البشرية</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-16 px-2 py-0.5 rounded-md bg-gray-200 text-gray-700 font-bold text-center">&lt;70٪</span>
                    <span>يبقى غير مربوط — يمكنك البحث يدوياً</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── STEP 3: CONFIRM ──────────────────────────────────── */
            <div className="space-y-4">
              <div className="text-center py-2">
                <div className="inline-flex p-3 bg-gradient-to-br from-violet-100 to-fuchsia-100 rounded-2xl mb-3">
                  <Sparkles size={28} className="text-violet-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">جاهز للتشغيل؟</h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                  اضغط <span className="font-bold text-violet-700">"تشغيل الذكاء الاصطناعي"</span> لبدء التحليل.
                  العملية تستغرق عادة من 5 إلى 30 ثانية حسب حجم المخزون.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 border-2 border-violet-200">
                <p className="text-xs font-bold text-violet-900 uppercase tracking-wider mb-2">ملخص التشغيل</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">منتجات سيتم تحليلها</span>
                    <span className="font-bold text-violet-700">{unlinkedCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">عدد الإشارات المستخدمة</span>
                    <span className="font-bold text-violet-700">5</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">حد الربط التلقائي</span>
                    <span className="font-bold text-emerald-700">95٪ + باركود</span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex gap-2">
                <Eye size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 leading-relaxed">
                  <span className="font-bold">أنت تتحكم:</span> لن يتم ربط أي منتج بثقة أقل من 95٪ تلقائياً. كل اقتراح يتطلب موافقتك اليدوية.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 bg-gray-50 p-4 flex items-center justify-between gap-3">
          <button
            disabled={isPending}
            onClick={() => {
              if (step === 'intro') onClose()
              else if (step === 'how') setStep('intro')
              else setStep('how')
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-white rounded-xl transition-colors disabled:opacity-40">
            {step === 'intro' ? 'إلغاء' : <><ArrowLeft size={14} /> السابق</>}
          </button>
          <div className="flex items-center gap-2">
            {step !== 'confirm' ? (
              <button
                onClick={() => setStep(step === 'intro' ? 'how' : 'confirm')}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-gray-900 hover:bg-gray-800 text-white rounded-xl">
                التالي
              </button>
            ) : (
              <button
                disabled={isPending}
                onClick={onConfirm}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-70 text-white rounded-xl shadow-md">
                {isPending
                  ? <><Loader2 size={14} className="animate-spin" /> جاري البدء…</>
                  : <><Sparkles size={14} /> تشغيل الذكاء الاصطناعي</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
