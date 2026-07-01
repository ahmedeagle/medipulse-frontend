import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useProfileStore } from '../../store/auth.store'
import {
  Upload, CheckCircle, AlertTriangle, Loader2,
  FileSpreadsheet, ArrowRight, RefreshCw, Sparkles,
  PackageCheck, Info, MessageCircle, Download,
} from 'lucide-react'
import { migrationApi, MigrationPreviewResponse, PreviewRow, BatchStatus } from '../../api/migration.api'

// Strict template — same column set as the inventory bulk upload. Optional
// escape hatch for users who prefer a fixed format over the smart matcher.
const CSV_TEMPLATE = [
  'productName,nameAr,genericName,category,unit,dosageForm,strength,manufacturer,barcode,sku,quantity,minThreshold,expiryDate,batchNumber,location,costPrice,sellingPrice',
  'Amoxicillin 500mg,أموكسيسيلين 500 ملغ,Amoxicillin,antibiotics,capsule,capsule,500mg,GSK,6930012345678,SKU-001,200,30,2026-06-01,LOT-2024-001,Main Warehouse,35,45',
  'Panadol 500mg,بنادول 500 ملغ,Paracetamol,analgesics,tablet,tablet,500mg,GSK,,SKU-002,500,50,,,Main Warehouse,20,30',
].join('\n')

// ─── Step machine ─────────────────────────────────────────────────────────────
//
// Linear wizard rather than a chat thread — pharmacy admins reported the chat
// bubbles felt cramped and made it unclear where the primary action lived.
// Each step renders ONE clearly-labelled panel with the action front-and-centre.

type Step = 'awaiting_file' | 'previewing' | 'confirm' | 'importing' | 'done' | 'error'

const STEP_ORDER: Step[] = ['awaiting_file', 'confirm', 'importing', 'done']

const STEP_META: Record<Step, { idx: number; ar: string; en: string }> = {
  awaiting_file: { idx: 1, ar: 'رفع الملف',    en: 'Upload file' },
  previewing:    { idx: 1, ar: 'تحليل الملف',  en: 'Analyzing'   },
  confirm:       { idx: 2, ar: 'مراجعة',       en: 'Review'      },
  importing:     { idx: 3, ar: 'استيراد',      en: 'Importing'   },
  done:          { idx: 4, ar: 'اكتمل',        en: 'Done'        },
  error:         { idx: 1, ar: 'خطأ',          en: 'Error'       },
}

// ─── Stepper indicator ────────────────────────────────────────────────────────
function Stepper({ current }: { current: Step }) {
  const currentIdx = STEP_META[current].idx
  return (
    <ol className="flex items-center gap-2 w-full">
      {STEP_ORDER.map((s, i) => {
        const meta = STEP_META[s]
        const done   = meta.idx < currentIdx
        const active = meta.idx === currentIdx
        return (
          <li key={s} className="flex items-center flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border ${
                done   ? 'bg-emerald-600 border-emerald-600 text-white' :
                active ? 'bg-white border-emerald-600 text-emerald-700 ring-2 ring-emerald-100' :
                         'bg-white border-gray-200 text-gray-400'
              }`}>
                {done ? <CheckCircle size={13} /> : meta.idx}
              </div>
              <span className={`text-[11px] sm:text-xs font-semibold truncate ${
                done || active ? 'text-gray-800' : 'text-gray-400'
              }`}>{meta.ar}</span>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div className={`mx-2 sm:mx-3 h-px flex-1 ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, tone }: { label: string; value: number; tone: 'gray' | 'emerald' | 'amber' | 'red' | 'sky' }) {
  const toneCls: Record<typeof tone, string> = {
    gray:    'bg-gray-50 border-gray-200 text-gray-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber:   'bg-amber-50 border-amber-200 text-amber-800',
    red:     'bg-red-50 border-red-200 text-red-800',
    sky:     'bg-sky-50 border-sky-200 text-sky-800',
  }
  return (
    <div className={`rounded-xl border px-3 py-3 text-center ${toneCls[tone]}`}>
      <p className="text-2xl font-bold tabular-nums leading-none">{value.toLocaleString('en-US')}</p>
      <p className="text-[11px] opacity-75 mt-1.5">{label}</p>
    </div>
  )
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  const statusConfig = {
    auto_matched: { label: 'تطابق تلقائي', cls: 'bg-emerald-100 text-emerald-700' },
    needs_review: { label: 'يحتاج مراجعة', cls: 'bg-amber-100 text-amber-700' },
    unmatched:    { label: 'غير معروف',    cls: 'bg-red-100 text-red-700' },
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 text-xs bg-white">
      <table className="w-full">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="text-right px-3 py-2 font-semibold">اسم المنتج</th>
            <th className="text-center px-3 py-2 font-semibold">الكمية</th>
            <th className="text-right px-3 py-2 font-semibold">التطابق في الكتالوج</th>
            <th className="text-center px-3 py-2 font-semibold">الثقة</th>
            <th className="text-center px-3 py-2 font-semibold">الحالة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => {
            const st = statusConfig[r.status]
            return (
              <tr key={r.rowNumber} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[200px]">{r.productName}</td>
                <td className="px-3 py-2 text-center text-gray-600">{r.quantity}</td>
                <td className="px-3 py-2 text-gray-600 truncate max-w-[200px]">
                  {r.matchedName ?? <span className="text-gray-400 italic">لا يوجد تطابق</span>}
                  {r.matchReason && <p className="text-[10px] text-gray-400">{r.matchReason}</p>}
                </td>
                <td className="px-3 py-2 text-center">
                  {r.matchScore != null
                    ? <span className={`font-bold ${r.matchScore >= 85 ? 'text-emerald-600' : r.matchScore >= 55 ? 'text-amber-600' : 'text-gray-400'}`}>{r.matchScore}%</span>
                    : <span className="text-gray-400">—</span>
                  }
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProgressBar({ batch }: { batch: BatchStatus }) {
  const pct = batch.total > 0 ? Math.round((batch.processed / batch.total) * 100) : 0
  const statusLabel: Record<BatchStatus['status'], string> = {
    queued:    'في قائمة الانتظار…',
    matching:  'جارٍ المطابقة والاستيراد…',
    completed: 'اكتمل الاستيراد ✓',
    failed:    'فشل الاستيراد',
    cancelled: 'تم الإلغاء',
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm text-gray-700">
        <span className="font-medium">{statusLabel[batch.status]}</span>
        <span className="tabular-nums font-bold text-emerald-700">{pct}%</span>
      </div>
      <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            batch.status === 'completed' ? 'bg-emerald-500' :
            batch.status === 'failed'    ? 'bg-red-500' :
            'bg-emerald-500 animate-pulse'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label="تم استيراده"  value={batch.imported}  tone="emerald" />
        <StatTile label="محدَّث"       value={batch.updated}   tone="sky" />
        <StatTile label="محتاج مراجعة" value={batch.unlinked}  tone="amber" />
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MigrationAssistantPage() {
  const { profile } = useProfileStore()
  const tenantName = profile?.tenant?.name ?? ''
  const whatsappHref = (() => {
    const raw = (import.meta as any).env?.VITE_SUPPORT_WHATSAPP ?? '201000000000'
    const phone = String(raw).replace(/\D/g, '')
    const text = encodeURIComponent(
      `مرحباً، أود نقل مخزون صيدليتي${tenantName ? ` (${tenantName})` : ''} إلى Bnoov. سأرسل لكم ملف المخزون (Excel / CSV / صورة) هنا، وسيقوم فريقكم بمعالجته نيابة عني.`
    )
    return `https://wa.me/${phone}?text=${text}`
  })()

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'bnoov-migration-template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const [step, setStep]       = useState<Step>('awaiting_file')
  const [preview, setPreview] = useState<MigrationPreviewResponse | null>(null)
  const [batchData, setBatchData] = useState<BatchStatus | null>(null)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [fileName, setFileName]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const previewMutation = useMutation({
    mutationFn: (file: File) => migrationApi.previewExcel(file).then(r => r.data),
    onSuccess: (data) => { setPreview(data); setStep('confirm'); setErrorMsg(null) },
    onError:   (err: any) => { setStep('error'); setErrorMsg(err?.response?.data?.message ?? 'فشل في قراءة الملف. حاول مرة أخرى.') },
  })

  const importMutation = useMutation({
    mutationFn: () => migrationApi.startImport(preview!.csvPayload, preview!.fileName).then(r => r.data),
    onSuccess: (data) => { setStep('importing'); pollBatch(data.batchId) },
    onError:   (err: any) => { setStep('error'); setErrorMsg(err?.response?.data?.message ?? 'فشل في بدء الاستيراد. حاول مرة أخرى.') },
  })

  const pollBatch = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await migrationApi.getBatchStatus(id)
        setBatchData(data)
        if (data.status === 'completed') { clearInterval(interval); setStep('done') }
        else if (data.status === 'failed') { clearInterval(interval); setStep('error'); setErrorMsg('فشل الاستيراد. يرجى التواصل مع الدعم.') }
      } catch { clearInterval(interval) }
    }, 3000)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setStep('previewing')
    previewMutation.mutate(file)
    e.target.value = ''
  }

  const reset = () => {
    setStep('awaiting_file')
    setPreview(null)
    setBatchData(null)
    setErrorMsg(null)
    setFileName(null)
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-white border border-gray-200 shadow-sm">
        <div className="absolute -top-16 -end-16 w-72 h-72 rounded-full bg-emerald-50/60 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -start-12 w-56 h-56 rounded-full bg-emerald-50/40 blur-3xl pointer-events-none" />
        <div className="relative px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold mb-1">
                <Sparkles size={12} />
                <span>نقل مخزونك — بالذكاء الاصطناعي</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
                نقل مخزونك إلى Bnoov
              </h1>
              <p className="text-gray-500 text-sm mt-1.5 max-w-3xl leading-relaxed">
                لا تحتاج إلى قالب ثابت أو تعديل أعمدتك. ارفع ملف مخزونك بأي صيغة (Excel أو CSV) وبأي ترتيب أعمدة —
                الذكاء الاصطناعي يتعرّف على بياناتك، يوحّد الوحدات والأسماء، ويطابق كل صنف مع الكتالوج المركزي تلقائياً.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                  <CheckCircle size={11} /> أي صيغة ملف
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                  <CheckCircle size={11} /> عربي / إنجليزي / باركود
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                  <CheckCircle size={11} /> بدون قالب إجباري
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-sky-50 text-sky-700 font-semibold">
                  <Info size={11} /> الحد الأدنى: اسم المنتج + الكمية
                </span>
              </div>
            </div>
            {step === 'done' && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold shrink-0">
                <CheckCircle size={12} /> مكتمل
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Stepper ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5">
        <Stepper current={step} />
      </div>

      {/* ── Step panel ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
        {/* Step 1: Upload */}
        {step === 'awaiting_file' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">١. ارفع ملف مخزونك</h2>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                ارفع ملف بأي ترتيب أعمدة — الذكاء الاصطناعي يكتشف عمود الاسم تلقائياً، ويفهم العربية والإنجليزية والباركود.
              </p>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                <strong className="text-gray-600">الحد الأدنى:</strong> عمود لاسم المنتج (أو productName).
                <strong className="text-gray-600"> اختياري:</strong> الكمية، الباركود، السعر، التركيز، تاريخ الانتهاء، الشركة المصنّعة.
              </p>
            </div>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50 rounded-2xl text-emerald-700 font-semibold transition-all"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <Upload size={24} />
              </div>
              <span className="text-base">اضغط لاختيار ملف Excel أو CSV</span>
              <span className="text-xs text-emerald-600/80 font-normal">.xlsx · .xls · .csv ·  حتّى 50,000 صنف</span>
            </button>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-300 transition-all group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <MessageCircle size={20} className="text-emerald-700" />
                </div>
                <div className="min-w-0 text-start">
                  <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
                    <span>أو أرسل ملفك على واتساب</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">جديد</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    صوّر قائمة المخزون أو أرسل ملف Excel — فريقنا يرفعه نيابة عنك.
                  </div>
                </div>
              </div>
              <ArrowRight size={16} className="text-emerald-600 shrink-0 group-hover:translate-x-0.5 rtl:rotate-180 transition-transform" />
            </a>
            <div className="flex items-start gap-2 rounded-lg bg-sky-50 border border-sky-100 p-3 text-xs text-sky-800 leading-relaxed">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>لا تملك ملفاً جاهزاً؟ يمكنك إضافة المنتجات يدوياً من <a href="/pharmacy/inventory" className="font-semibold underline">شاشة المخزون</a>، أو تحميل قالبنا الاختياري إن فضّلت العمل بصيغة ثابتة.</span>
            </div>

            <button
              type="button"
              onClick={downloadTemplate}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors text-start"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <Download size={16} className="text-gray-700" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">تفضّل الطريقة الثابتة؟ حمّل قالبنا</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">أعمدة جاهزة بترتيب ثابت — يضمن تعرّف كل حقل 100% دون أي تخمين.</div>
                </div>
              </div>
              <span className="text-xs font-medium text-gray-400 shrink-0">CSV</span>
            </button>
          </div>
        )}

        {/* Step 1b: Analyzing */}
        {step === 'previewing' && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 size={32} className="animate-spin text-emerald-600" />
            <p className="text-sm font-medium text-gray-800">جارٍ تحليل الملف ومطابقة المنتجات…</p>
            {fileName && <p className="text-xs text-gray-400 font-mono">{fileName}</p>}
          </div>
        )}

        {/* Step 2: Review preview */}
        {step === 'confirm' && preview && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">٢. راجع نتائج المطابقة</h2>
              <p className="text-sm text-gray-500 mt-1">
                تم تحليل <strong className="text-gray-800">{preview.total.toLocaleString('en-US')}</strong> منتج من الملف
                {fileName && <span className="text-gray-400 font-mono"> · {fileName}</span>}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <StatTile label="إجمالي المنتجات" value={preview.total}       tone="gray" />
              <StatTile label="تطابق تلقائي"    value={preview.autoMatched} tone="emerald" />
              <StatTile label="يحتاج مراجعة"    value={preview.needsReview} tone="amber" />
              <StatTile label="غير معروف"       value={preview.unmatched}   tone="red" />
            </div>

            {preview.ignoredColumns && preview.ignoredColumns.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
                <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                <div className="min-w-0">
                  <div className="font-semibold mb-1">تم تجاهل الأعمدة التالية لأنّنا لم نتعرّف على معناها:</div>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {preview.ignoredColumns.map((c) => (
                      <span key={c} className="font-mono text-[11px] bg-white border border-amber-300 rounded px-1.5 py-0.5">{c}</span>
                    ))}
                  </div>
                  <div className="text-amber-800/90">
                    إن كان أحدها مهماً (مثل السعر)، أعد تسمية العمود في ملفك أو استخدم <button type="button" onClick={downloadTemplate} className="underline font-semibold">قالبنا الثابت</button> لضمان تعرّف كل الحقول.
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500 mb-2">عينة من أول {Math.min(50, preview.total)} منتج:</p>
              <PreviewTable rows={preview.preview} />
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={reset}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-xl transition-colors"
              >
                <RefreshCw size={14} />
                رفع ملف آخر
              </button>
              <button
                type="button"
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
              >
                {importMutation.isPending
                  ? <><Loader2 size={14} className="animate-spin" />جارٍ البدء…</>
                  : <><PackageCheck size={14} />نعم، استورد {preview.total.toLocaleString('en-US')} منتج</>
                }
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">٣. جارٍ الاستيراد…</h2>
              <p className="text-sm text-gray-500 mt-1">يمكنك ترك الصفحة مفتوحة — سنتابع لك التقدّم.</p>
            </div>
            {batchData
              ? <ProgressBar batch={batchData} />
              : (
                <div className="py-10 flex flex-col items-center gap-3 text-center">
                  <Loader2 size={28} className="animate-spin text-emerald-600" />
                  <p className="text-sm text-gray-600">بدء الاستيراد…</p>
                </div>
              )
            }
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && batchData && (
          <div className="space-y-5">
            <div className="text-center py-2">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={32} className="text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">🎉 اكتمل الاستيراد بنجاح!</h2>
              <p className="text-sm text-gray-500 mt-1">صيدليتك جاهزة الآن لتفعيل الذكاء الاصطناعي.</p>
            </div>
            <div className="grid grid-cols-3 gap-2.5 max-w-md mx-auto">
              <StatTile label="منتج مستورد"   value={batchData.imported} tone="emerald" />
              <StatTile label="منتج محدَّث"   value={batchData.updated}  tone="sky" />
              <StatTile label="يحتاج مراجعة" value={batchData.unlinked} tone="amber" />
            </div>
            <ul className="space-y-2 max-w-md mx-auto text-sm text-gray-700">
              <li className="flex items-center gap-2"><CheckCircle size={14} className="text-emerald-500 shrink-0" /> استقبال اقتراحات الشراء الذكية</li>
              <li className="flex items-center gap-2"><CheckCircle size={14} className="text-emerald-500 shrink-0" /> تصفح كتالوج الموردين</li>
              <li className="flex items-center gap-2"><CheckCircle size={14} className="text-emerald-500 shrink-0" /> مراجعة المنتجات غير المعرّفة</li>
            </ul>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={reset}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-xl transition-colors"
              >
                <RefreshCw size={14} />
                نقل ملف آخر
              </button>
              <a
                href="/pharmacy/inventory"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
              >
                <ArrowRight size={14} className="rotate-180" />
                انتقل إلى المخزون
              </a>
            </div>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800">حدث خطأ</p>
                <p className="text-sm text-red-700 mt-1">{errorMsg ?? 'فشل في العملية. حاول مرة أخرى.'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              <RefreshCw size={14} />
              حاول مرة أخرى
            </button>
          </div>
        )}
      </div>

      {/* ── How it works — inline icon row ─────────────────────────────── */}
      {step === 'awaiting_file' && (
        <div className="pt-2">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Sparkles size={14} className="text-emerald-600" />
            <p className="text-sm font-bold text-gray-700">كيف يعمل النظام؟</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Upload,        title: '1. ارفع الملف',    body: 'Excel أو CSV من نظامك السابق' },
              { icon: Sparkles,      title: '2. مطابقة ذكية',   body: 'الذكاء الاصطناعي يطابق الأصناف' },
              { icon: PackageCheck,  title: '3. مراجعة سريعة',  body: 'تأكد من النتائج قبل الاستيراد' },
              { icon: CheckCircle,   title: '4. استيراد فوري',  body: 'بياناتك جاهزة في دقائق' },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-2.5">
                  <s.icon size={20} className="text-emerald-600" />
                </div>
                <p className="text-sm font-bold text-gray-900 mb-1">{s.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
