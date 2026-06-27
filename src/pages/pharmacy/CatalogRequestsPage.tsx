import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, Clock, CheckCircle2, XCircle, FileText, Search,
  ChevronRight, Info, History, Upload, X,
} from 'lucide-react'
import { catalogRequestsApi } from '../../api/catalog-requests.api'
import { VoiceMicButton } from '../../components/ui/VoiceMicButton'
import { FullPageSpinner } from '../../components/ui/Spinner'
import type { CatalogRequest, CatalogRequestStatus } from '../../types'

const STATUS_META: Record<CatalogRequestStatus, { label: string; cls: string; icon: any }> = {
  submitted:    { label: 'مُرسَل',         cls: 'bg-sky-50 text-sky-700 border-sky-200',          icon: Clock },
  under_review: { label: 'قيد المراجعة',   cls: 'bg-amber-50 text-amber-700 border-amber-200',    icon: Search },
  need_info:    { label: 'يحتاج معلومات',  cls: 'bg-purple-50 text-purple-700 border-purple-200', icon: Info },
  approved:     { label: 'تم الاعتماد',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  rejected:     { label: 'مرفوض',         cls: 'bg-red-50 text-red-700 border-red-200',          icon: XCircle },
  closed:       { label: 'مغلق',          cls: 'bg-gray-50 text-gray-600 border-gray-200',       icon: FileText },
}

function StatusPill({ status }: { status: CatalogRequestStatus }) {
  const m = STATUS_META[status]
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${m.cls}`}>
      <Icon size={12} />
      {m.label}
    </span>
  )
}

function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3">
      <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-medium mb-1">
        <span className="text-emerald-500">{icon}</span>
        {label}
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{value}</p>
    </div>
  )
}

function fmtDateTime(d?: string | null) {
  return d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function Timeline({ entries }: { entries: CatalogRequest['timeline'] }) {
  if (!entries?.length) return <p className="text-sm text-gray-400">لا توجد أحداث.</p>
  return (
    <ol className="relative border-s-2 border-gray-100 ms-2 ps-5 space-y-4">
      {entries.map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -start-[27px] top-1.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow" />
          <div className="text-xs text-gray-400">{fmtDateTime(e.at)}</div>
          <div className="text-sm font-semibold text-gray-800 mt-0.5">
            {e.event} · <span className="text-xs font-normal text-gray-500">{e.actor}</span>
          </div>
          {e.note && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{e.note}</p>}
        </li>
      ))}
    </ol>
  )
}

function RequestDetailDrawer({ req, onClose }: { req: CatalogRequest; onClose: () => void }) {
  const p = req.payload || {}
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-xl bg-white shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-mono">{req.trackingNumber}</p>
            <h2 className="text-lg font-bold text-gray-900 mt-0.5">{p.nameAr || p.name || p.barcode || '—'}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <StatusPill status={req.status} />
            <span className="text-xs text-gray-400">أُنشئ {fmtDateTime(req.createdAt)}</span>
          </div>

          {req.rejectionReason && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-xs font-bold text-red-700 mb-1">سبب الرفض</p>
              <p className="text-sm text-red-700">{req.rejectionReason}</p>
            </div>
          )}

          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">بيانات الطلب</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ['الاسم بالعربية', p.nameAr],
                ['الاسم بالإنجليزية', p.name],
                ['الباركود', p.barcode],
                ['الشركة المصنعة', p.manufacturer],
                ['الشكل الصيدلاني', p.dosageForm],
                ['التركيز', p.strength],
              ].map(([k, v]) => (
                <div key={k as string} className="flex flex-col py-1 border-b border-gray-50 last:border-0">
                  <dt className="text-xs text-gray-400">{k}</dt>
                  <dd className="text-gray-800 font-medium">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            {p.notes && (
              <div className="mt-3 p-3 bg-gray-50 rounded-xl text-sm text-gray-700">
                <span className="font-semibold">ملاحظات: </span>{p.notes}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <History size={12} /> سجل المراحل
            </h3>
            <Timeline entries={req.timeline} />
          </section>
        </div>
      </div>
    </div>
  )
}

export default function CatalogRequestsPage() {
  const { t } = useTranslation()
  void t
  const [statusFilter, setStatusFilter] = useState<'' | CatalogRequestStatus>('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CatalogRequest | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const { data: requests, isLoading } = useQuery({
    queryKey: ['catalog-requests'],
    queryFn: () => catalogRequestsApi.listMine().then(r => r.data),
  })

  if (isLoading) return <FullPageSpinner />

  const filtered = (requests || []).filter(r => {
    if (statusFilter && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [r.trackingNumber, r.payload?.name, r.payload?.nameAr, r.payload?.barcode]
        .filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const counts = {
    all:          requests?.length ?? 0,
    submitted:    requests?.filter(r => r.status === 'submitted').length ?? 0,
    under_review: requests?.filter(r => r.status === 'under_review').length ?? 0,
    approved:     requests?.filter(r => r.status === 'approved').length ?? 0,
    rejected:     requests?.filter(r => r.status === 'rejected').length ?? 0,
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Hero card — emerald accent, white background, matches other pharmacy pages */}
      <div className="relative overflow-hidden rounded-3xl bg-white border border-gray-200 shadow-sm">
        <div className="absolute -top-16 -end-16 w-72 h-72 rounded-full bg-emerald-50/60 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -start-12 w-56 h-56 rounded-full bg-emerald-50/40 blur-3xl pointer-events-none" />
        <div className="relative px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold mb-1">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600">
                  <Sparkles size={14} />
                </span>
                <span>الكتالوج المركزي</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
                طلبات إضافة المنتجات
              </h1>
              <p className="text-gray-500 text-sm mt-1.5 max-w-xl leading-relaxed">
                تابع حالة طلباتك لإضافة منتجات جديدة إلى الكتالوج المركزي. كل طلب يحصل على
                <strong className="text-emerald-700"> رقم تتبّع رسمي </strong>
                وسجلّ كامل بالمراحل — ويُراجَع خلال 48 ساعة في المتوسط.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Upload size={16} />
              إرسال طلبات بالجملة
            </button>
          </div>

          {/* Stats strip */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <HeroStat icon={<Clock size={14} />}        label="قيد المراجعة" value={counts.under_review + counts.submitted} />
            <HeroStat icon={<CheckCircle2 size={14} />} label="مُعتمد"       value={counts.approved} />
            <HeroStat icon={<XCircle size={14} />}      label="مرفوض"        value={counts.rejected} />
            <HeroStat icon={<FileText size={14} />}     label="الإجمالي"     value={counts.all} />
          </div>
        </div>
      </div>

      {/* Filter pills + search */}
      <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3.5 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            ['', 'الكل', counts.all],
            ['submitted', 'مُرسَل', counts.submitted],
            ['under_review', 'قيد المراجعة', counts.under_review],
            ['approved', 'مُعتمد', counts.approved],
            ['rejected', 'مرفوض', counts.rejected],
          ] as const).map(([k, label, c]) => (
            <button
              key={k || 'all'}
              onClick={() => setStatusFilter(k as any)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                statusFilter === k
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:text-emerald-700'
              }`}>
              {label}
              <span className={`tabular-nums px-1.5 rounded-md text-[10px] ${
                statusFilter === k ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>{c}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم التتبّع أو اسم المنتج أو الباركود…"
            className="w-full ps-10 pe-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50"
          />
          {!search && <VoiceMicButton onResult={setSearch} className="absolute end-3 top-1/2 -translate-y-1/2" />}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <FileText size={24} className="text-emerald-400" />
            </div>
            {counts.all === 0 ? (
              <>
                <p className="text-sm font-semibold text-gray-800">لا توجد طلبات بعد</p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
                  عندما تجد منتجاً غير موجود في الكتالوج، أرسل طلب إضافة من شاشة المخزون وسيظهر هنا مع رقم تتبّع لمتابعته.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-800">لا توجد نتائج مطابقة</p>
                <p className="text-xs text-gray-400 mt-1">جرّب تغيير الفلتر أو مسح كلمة البحث.</p>
                {(statusFilter || search) && (
                  <button
                    onClick={() => { setStatusFilter(''); setSearch('') }}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    مسح عوامل التصفية
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['رقم التتبّع', 'المنتج', 'الباركود', 'الحالة', 'تاريخ الإرسال', ''].map(h => (
                  <th key={h} className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-b last:border-0 border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-emerald-700 whitespace-nowrap">{r.trackingNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{r.payload?.nameAr || r.payload?.name || '—'}</p>
                    {r.payload?.manufacturer && <p className="text-xs text-gray-400">{r.payload.manufacturer}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500" dir="ltr">{r.payload?.barcode || '—'}</td>
                  <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-300"><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* How it works — inline icon row, no card boxes */}
      <div className="pt-6">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Info size={14} className="text-emerald-600" />
          <p className="text-sm font-bold text-gray-700">كيف يعمل النظام؟</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            { icon: FileText,     title: '1. أرسل الطلب',      body: 'من شاشة المخزون، أرسل طلب إضافة لأي منتج غير مربوط. تحصل فوراً على رقم تتبّع رسمي.' },
            { icon: Search,       title: '2. المراجعة',         body: 'يراجع فريق الكتالوج طلبك خلال 48 ساعة. قد يطلبون معلومات إضافية — ستظهر الحالة هنا.' },
            { icon: CheckCircle2, title: '3. الاعتماد والربط',  body: 'عند الاعتماد، يُربط المنتج تلقائياً بصنفك وتُحدَّث بياناته من الكتالوج المركزي.' },
          ].map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <step.icon size={22} className="text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-gray-900 mb-1.5">{step.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed max-w-xs">{step.body}</p>
            </div>
          ))}
        </div>
      </div>

      {selected && <RequestDetailDrawer req={selected} onClose={() => setSelected(null)} />}
      {bulkOpen && <BulkRequestModal onClose={() => setBulkOpen(false)} />}
    </div>
  )
}

// ── Bulk submit modal ───────────────────────────────────────────────────────
// Lets the pharmacy paste many "name | barcode" lines at once. Each line
// becomes one catalog request; the backend may auto-approve barcode matches.
function BulkRequestModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [batchNote, setBatchNote] = useState('')
  const [result, setResult] = useState<{ submitted: any[]; failed: any[] } | null>(null)

  const parsed = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('|').map(s => s.trim())
      const name = parts[0]
      const barcode = parts[1] || undefined
      return name ? { name, barcode } : null
    })
    .filter(Boolean) as { name: string; barcode?: string }[]

  const submit = useMutation({
    mutationFn: () => catalogRequestsApi.bulkCreate(parsed, batchNote || undefined).then(r => r.data),
    onSuccess: (r) => {
      setResult(r)
      qc.invalidateQueries({ queryKey: ['catalog-requests'] })
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">إرسال طلبات إضافة بالجملة</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg"><X size={18} /></button>
        </div>

        {result ? (
          <div className="p-6 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 text-sm">
              تم إرسال <strong>{result.submitted.length}</strong> طلب بنجاح.
              {result.failed.length > 0 && <> تعذّر إرسال <strong>{result.failed.length}</strong>.</>}
            </div>
            {result.failed.length > 0 && (
              <ul className="max-h-40 overflow-y-auto text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 space-y-1">
                {result.failed.map((f, i) => (
                  <li key={i}>سطر {f.index + 1}: {f.reason}</li>
                ))}
              </ul>
            )}
            <button onClick={onClose} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">تم</button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              ألصق سطراً لكل منتج بالصيغة: <code>الاسم | الباركود</code> (الباركود اختياري). إذا تطابق الباركود مع منتج موجود فسيُعتمد الطلب تلقائيّاً.
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={10}
              placeholder={'بانادول أطفال شراب | 6224000123456\nأوجمنتين 625 مج\nإبر أنسولين | 6224999887766'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
            />
            <input
              value={batchNote}
              onChange={e => setBatchNote(e.target.value)}
              placeholder="ملاحظة على المجموعة (اختياري) — مثل: نقل بيانات دفعة أبريل"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <div className="text-sm text-gray-600">{parsed.length} طلب جاهز</div>
              <div className="flex gap-2">
                <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
                <button
                  onClick={() => submit.mutate()}
                  disabled={parsed.length === 0 || submit.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Upload size={14} />
                  {submit.isPending ? 'جارٍ الإرسال…' : 'إرسال'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

