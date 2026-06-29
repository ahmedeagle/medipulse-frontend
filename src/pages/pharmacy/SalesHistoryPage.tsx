import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Upload, CheckCircle, Loader2, FileSpreadsheet,
  Sparkles, Info, X, Clock, ShieldCheck,
} from 'lucide-react'
import { salesHistoryApi, SalesHistoryUploadItem } from '../../api/sales-history.api'

// ─── Self-service historical sales upload ─────────────────────────────────────
//
// A new pharmacy almost always arrives with 6–12 months of sales/purchase
// history exported from its previous system. Uploading it here lets the ops
// team backfill consumption history so demand forecasting + the seasonal radar
// work from day one instead of cold-starting. We intentionally only STORE the
// files and hand them to ops — nothing is parsed in the browser or on the live
// request path, so a malformed sheet can never disrupt the running pharmacy.

const KINDS = [
  { value: 'sales', ar: 'مبيعات', en: 'Sales' },
  { value: 'purchases', ar: 'مشتريات', en: 'Purchases' },
  { value: 'mixed', ar: 'مبيعات ومشتريات', en: 'Sales & purchases' },
  { value: 'unspecified', ar: 'غير محدد', en: 'Unspecified' },
] as const

const MAX_FILES = 10
const MAX_SIZE = 15 * 1024 * 1024

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const STATUS_AR: Record<string, { label: string; cls: string }> = {
  pending: { label: 'بانتظار المعالجة', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  processed: { label: 'تمت المعالجة', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'مرفوض', cls: 'bg-red-50 text-red-700 border-red-200' },
}

export default function SalesHistoryPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [kind, setKind] = useState<string>('sales')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: history } = useQuery({
    queryKey: ['sales-history-uploads'],
    queryFn: async () => (await salesHistoryApi.list()).data,
  })

  const uploadMutation = useMutation({
    mutationFn: () => salesHistoryApi.upload(files, kind, note.trim() || undefined),
    onSuccess: () => {
      setFiles([])
      setNote('')
      qc.invalidateQueries({ queryKey: ['sales-history-uploads'] })
    },
  })

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    setError(null)
    const next: File[] = [...files]
    for (const f of Array.from(incoming)) {
      if (!/\.(xlsx?|csv)$/i.test(f.name)) {
        setError('يجب أن تكون الملفات بصيغة Excel أو CSV')
        continue
      }
      if (f.size > MAX_SIZE) {
        setError(`الملف ${f.name} يتجاوز الحد الأقصى 15 ميجابايت`)
        continue
      }
      if (next.length >= MAX_FILES) {
        setError(`الحد الأقصى ${MAX_FILES} ملفات`)
        break
      }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f)
    }
    setFiles(next)
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
          <Sparkles className="text-emerald-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">رفع سجل المبيعات السابق</h1>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            ارفع بيانات مبيعاتك ومشترياتك من النظام السابق (آخر 6–12 شهر) ليقوم فريقنا
            بمعالجتها وتفعيل التنبؤ بالطلب والرادار الموسمي من اليوم الأول.
          </p>
        </div>
      </div>

      {/* Trust note */}
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 flex gap-3">
        <ShieldCheck className="text-sky-600 shrink-0 mt-0.5" size={18} />
        <p className="text-[13px] text-sky-800 leading-relaxed">
          ملفاتك تُحفظ بأمان ويتولّى فريق العمليات معالجتها يدويًا. لا يتم تعديل أي بيانات
          في صيدليتك تلقائيًا — أنت تحتفظ بالسيطرة الكاملة.
        </p>
      </div>

      {/* Upload card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        {/* Kind */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">نوع البيانات</label>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  kind === k.value
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
                }`}
              >
                {k.ar}
              </button>
            ))}
          </div>
        </div>

        {/* Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            addFiles(e.dataTransfer.files)
          }}
          className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 hover:border-emerald-400 bg-gray-50 hover:bg-emerald-50/40 transition p-8 text-center"
        >
          <Upload className="mx-auto text-gray-400 mb-2" size={28} />
          <p className="text-sm font-medium text-gray-700">اسحب الملفات هنا أو انقر للاختيار</p>
          <p className="text-xs text-gray-400 mt-1">Excel أو CSV — حتى {MAX_FILES} ملفات، 15 ميجابايت لكل ملف</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {/* Selected files */}
        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <FileSpreadsheet className="text-emerald-600 shrink-0" size={18} />
                <span className="text-sm text-gray-800 truncate flex-1">{f.name}</span>
                <span className="text-xs text-gray-400 tabular-nums">{fmtSize(f.size)}</span>
                <button type="button" onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Note */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            ملاحظة (اختياري)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="مثال: مبيعات من يناير حتى يونيو 2024، مُصدّرة من نظام X"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 outline-none resize-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <Info size={15} /> {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          disabled={files.length === 0 || uploadMutation.isPending}
          onClick={() => uploadMutation.mutate()}
          className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 flex items-center justify-center gap-2 transition"
        >
          {uploadMutation.isPending ? (
            <><Loader2 className="animate-spin" size={18} /> جارٍ الرفع…</>
          ) : (
            <><Upload size={18} /> رفع {files.length > 0 ? `(${files.length})` : ''}</>
          )}
        </button>

        {uploadMutation.isSuccess && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <CheckCircle size={16} />
            تم استلام ملفاتك بنجاح — سيقوم فريق العمليات بمعالجتها قريبًا.
          </div>
        )}
      </div>

      {/* History */}
      {history && history.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Clock size={16} className="text-gray-400" /> الملفات المرفوعة
          </h2>
          <ul className="divide-y divide-gray-100">
            {history.map((item: SalesHistoryUploadItem) => {
              const st = STATUS_AR[item.status] ?? STATUS_AR.pending
              return (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <FileSpreadsheet className="text-gray-400 shrink-0" size={18} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{item.fileName}</p>
                    <p className="text-xs text-gray-400">
                      {fmtSize(item.fileSize)} · {new Date(item.createdAt).toLocaleDateString('ar-EG')}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-medium px-2 py-1 rounded-md border ${st.cls}`}>
                    {st.label}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
