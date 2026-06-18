import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles, Clock, CheckCircle2, XCircle, FileText, Search,
  ChevronRight, Info, AlertCircle, History,
} from 'lucide-react'
import { catalogRequestsApi } from '../../api/catalog-requests.api'
import { VoiceMicButton } from '../../components/ui/VoiceMicButton'
import { FullPageSpinner } from '../../components/ui/Spinner'
import type { CatalogRequest, CatalogRequestStatus } from '../../types'

const STATUS_META: Record<CatalogRequestStatus, { label: string; cls: string; icon: any }> = {
  submitted:    { label: 'مُرسَل',         cls: 'bg-blue-50 text-blue-700 border-blue-200',     icon: Clock },
  under_review: { label: 'قيد المراجعة',   cls: 'bg-amber-50 text-amber-700 border-amber-200',  icon: Search },
  need_info:    { label: 'يحتاج معلومات',  cls: 'bg-purple-50 text-purple-700 border-purple-200', icon: Info },
  approved:     { label: 'تم الاعتماد',    cls: 'bg-teal-50 text-teal-700 border-teal-200',     icon: CheckCircle2 },
  rejected:     { label: 'مرفوض',         cls: 'bg-red-50 text-red-700 border-red-200',         icon: XCircle },
  closed:       { label: 'مغلق',          cls: 'bg-gray-50 text-gray-600 border-gray-200',     icon: FileText },
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

function fmtDateTime(d?: string | null) {
  return d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function Timeline({ entries }: { entries: CatalogRequest['timeline'] }) {
  if (!entries?.length) return <p className="text-sm text-gray-400">لا توجد أحداث.</p>
  return (
    <ol className="relative border-s-2 border-gray-100 ms-2 ps-5 space-y-4">
      {entries.map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -start-[27px] top-1.5 w-3 h-3 rounded-full bg-teal-500 border-2 border-white shadow" />
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
    <div className="px-6 py-8 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Sparkles size={12} /> الكتالوج المركزي
        </p>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">طلبات إضافة المنتجات</h1>
        <p className="text-gray-500 leading-relaxed">
          تابع حالة طلباتك لإضافة منتجات جديدة إلى الكتالوج المركزي. كل طلب يحصل على رقم تتبّع رسمي وسجل كامل بالمراحل.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
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
            className={`text-start p-4 rounded-2xl border transition-all ${
              statusFilter === k
                ? 'bg-teal-600 text-white border-teal-600 shadow-md'
                : 'bg-white border-gray-200 hover:border-teal-300 hover:shadow-sm'
            }`}>
            <p className={`text-xs ${statusFilter === k ? 'text-teal-50' : 'text-gray-500'}`}>{label}</p>
            <p className={`text-2xl font-bold mt-1 ${statusFilter === k ? 'text-white' : 'text-gray-900'}`}>{c}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث برقم التتبّع أو اسم المنتج أو الباركود…"
          className="w-full ps-10 pe-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
        />
        {!search && <VoiceMicButton onResult={setSearch} className="absolute end-3 top-1/2 -translate-y-1/2" />}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FileText size={32} className="mx-auto mb-3 opacity-30" />
            <p>لا توجد طلبات مطابقة.</p>
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
                  <td className="px-4 py-3 font-mono text-xs text-teal-700 whitespace-nowrap">{r.trackingNumber}</td>
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

      {/* Hint */}
      <div className="mt-6 p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3">
        <AlertCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-700">
          <p className="font-semibold mb-1">كيف يعمل النظام؟</p>
          <p className="text-xs leading-relaxed">
            أرسل طلبًا لإضافة أي منتج غير مربوط من شاشة المخزون. سيراجع فريق الكتالوج طلبك خلال 48 ساعة في المتوسط. عند الاعتماد، سيتم ربط المنتج تلقائيًا بصنفك وتحديث بياناته من الكتالوج المركزي.
          </p>
        </div>
      </div>

      {selected && <RequestDetailDrawer req={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
