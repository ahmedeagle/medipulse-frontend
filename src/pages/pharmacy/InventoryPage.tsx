import { useState, useRef, useCallback, useEffect, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, Search, Pencil, Trash2, AlertCircle, Upload, CheckCircle,
  Download, Package, Sparkles, FileSpreadsheet, ArrowRight,
  Building2, FlaskConical, ScanLine, Clock, ScanBarcode, Info,
  Filter, X, ChevronDown, ChevronUp, MoreHorizontal, ArrowUp, ArrowDown,
  Eye, History, Printer, ShoppingCart, Layers,
} from 'lucide-react'
import { inventoryApi } from '../../api/inventory.api'
import { catalogRequestsApi } from '../../api/catalog-requests.api'
import { importsApi } from '../../api/imports.api'
import client from '../../api/client'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { FullPageSpinner } from '../../components/ui/Spinner'
import { LinkStatusBadge } from '../../components/LinkStatusBadge'
import { ProductLinkModal } from '../../components/ProductLinkModal'
import { AIMatchingWizard } from '../../components/AIMatchingWizard'
import { ImportProgressToast } from '../../components/ImportProgressToast'
import { rememberActiveBatch, getRememberedBatch } from '../../hooks/useImportProgress'
import type { InventoryItem, Product } from '../../types'

// ── Helpers ──────────────────────────────────────────────────────────────────
const INPUT  = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white'
const SELECT = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white appearance-none'
const LABEL  = 'block text-xs font-semibold text-gray-600 mb-1.5'

const CSV_TEMPLATE = [
  'productName,nameAr,genericName,category,unit,dosageForm,strength,manufacturer,barcode,sku,quantity,minThreshold,expiryDate,batchNumber,location,costPrice,sellingPrice,sfdaRegistration,atcCode',
  'Amoxicillin 500mg,أموكسيسيلين 500 ملغ,Amoxicillin,antibiotics,capsule,capsule,500mg,GSK,6930012345678,SKU-001,200,30,2026-06-01,LOT-2024-001,Main Warehouse,35,45,SA-SFDA-12345,J01CA04',
  'Panadol 500mg,بنادول 500 ملغ,Paracetamol,analgesics,tablet,tablet,500mg,GSK,,SKU-002,500,50,,,Main Warehouse,20,30,,',
].join('\n')

function daysUntilExpiry(date?: string): number | null {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
}

function expiryLabel(item: InventoryItem) {
  const days = daysUntilExpiry(item.expiryDate)
  if (days === null) return null
  if (days < 0) return { label: 'منتهي الصلاحية', color: 'text-red-600 bg-red-50 border-red-200' }
  if (days <= 30) return { label: 'تنتهي قريباً', color: 'text-orange-600 bg-orange-50 border-orange-200' }
  if (days <= 90) return { label: `${days} يوم`, color: 'text-amber-600 bg-amber-50 border-amber-200' }
  return null
}

// ── Bulk Upload Modal ─────────────────────────────────────────────────────────
function BulkUploadModal({ onClose, onEnqueued }: { onClose: () => void; onEnqueued: (batchId: string, total: number) => void }) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)

  const importMutation = useMutation({
    // Two-phase pipeline: server parses + stages + enqueues, returns {batchId, total}.
    // The sticky ImportProgressToast (mounted by parent) polls /inventory/imports/:id
    // and shows live progress + counters + cancel button.
    mutationFn: () => importsApi.ingestCsv(file!),
    onSuccess: (res) => {
      rememberActiveBatch(res.batchId)
      onEnqueued(res.batchId, res.total)
      onClose()
    },
  })

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) setFile(f)
  }, [])

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'medipulse-template.csv'; a.click()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t('inventory.upload.subtitle')}</p>

      {/* Template */}
      <button onClick={downloadTemplate}
        className="w-full flex items-center justify-between px-4 py-3.5 border border-dashed border-teal-300 bg-teal-50 rounded-xl hover:bg-teal-100 transition-colors text-start">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-lg"><Download size={16} className="text-teal-700" /></div>
          <div>
            <p className="text-sm font-semibold text-teal-800">{t('inventory.upload.template_title')}</p>
            <p className="text-xs text-teal-600 mt-0.5">19 حقل · productName، nameAr، category، unit، quantity، minThreshold، expiryDate، batchNumber، location، costPrice، sellingPrice…</p>
          </div>
        </div>
        <ArrowRight size={14} className="text-teal-500 shrink-0" />
      </button>

      {/* Drop zone */}
      <div onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        onDrop={onDrop} onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
          dragging || file ? 'border-teal-400 bg-teal-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <div className={`p-4 rounded-2xl ${file ? 'bg-teal-100' : 'bg-white border border-gray-200'}`}>
            <FileSpreadsheet size={28} className={file ? 'text-teal-600' : 'text-gray-400'} />
          </div>
          {file ? (
            <div>
              <p className="font-semibold text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB · {t('inventory.upload.file_ready')}</p>
            </div>
          ) : (
            <div>
              <p className="font-medium text-gray-700">{t('inventory.upload.drop_title')}</p>
              <p className="text-sm text-gray-400 mt-0.5">{t('inventory.upload.drop_sub')}</p>
            </div>
          )}
          <p className="text-xs text-gray-400">CSV, XLSX, XLS</p>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>

      {importMutation.isError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex gap-2 text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />{t('inventory.upload.import_error')}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 border border-gray-300 rounded-xl hover:bg-gray-50">
          {t('common.cancel')}
        </button>
        <button onClick={() => importMutation.mutate()} disabled={!file || importMutation.isPending}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl">
          {importMutation.isPending
            ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />جاري الإرسال…</>
            : <><Upload size={15} />ابدأ الرفع الذكي</>}
        </button>
      </div>
    </div>
  )
}

// ── Upload Success Toast ───────────────────────────────────────────────────────
function UploadToast({ stats, onDismiss }: { stats: any; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 8000); return () => clearTimeout(t) }, [])
  const isError   = !!stats?.error
  const isMessage = !!stats?.message
  const accent = isError
    ? { border: 'border-red-200', bg: 'bg-red-100', icon: 'text-red-600', dot: 'bg-red-500', label: 'text-red-600' }
    : { border: 'border-teal-200', bg: 'bg-teal-100', icon: 'text-teal-600', dot: 'bg-teal-500', label: 'text-teal-600' }
  return (
    <div className="fixed top-4 start-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in slide-in-from-top-2 duration-300">
      <div className={`bg-white rounded-2xl shadow-xl border ${accent.border} p-4 flex items-start gap-3`}>
        <div className={`p-2 ${accent.bg} rounded-xl shrink-0`}>
          {isError ? <AlertCircle size={20} className={accent.icon} /> : <CheckCircle size={20} className={accent.icon} />}
        </div>
        <div className="flex-1 min-w-0">
          {isMessage ? (
            <p className="font-semibold text-gray-900 text-sm leading-relaxed">{stats.message}</p>
          ) : (
            <>
              <p className="font-semibold text-gray-900 text-sm">تم رفع ملف المخزون بنجاح 🎉</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {stats.imported} منتج جديد · {stats.updated} محدَّث · {stats.skipped} تم تجاهله
              </p>
              {(stats.autoLinked > 0 || stats.suggested > 0 || stats.unlinked > 0) && (
                <div className="grid grid-cols-3 gap-1.5 mt-2 text-[11px]">
                  <div className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                    <span className="font-bold">{stats.autoLinked || 0}</span>
                    <span className="block opacity-80">ربط تلقائي</span>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                    <span className="font-bold">{stats.suggested || 0}</span>
                    <span className="block opacity-80">للمراجعة</span>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-600">
                    <span className="font-bold">{stats.unlinked || 0}</span>
                    <span className="block opacity-80">جديد</span>
                  </div>
                </div>
              )}
              <div className="flex gap-3 mt-2">
                <div className={`flex items-center gap-1 text-xs ${accent.label}`}>
                  <div className={`w-2 h-2 rounded-full ${accent.dot}`} />
                  المخزون الآن متاح ومنشَّط
                </div>
              </div>
            </>
          )}
        </div>
        <button onClick={onDismiss} className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

// ── Add Batch Modal (إدخال دفعة) ──────────────────────────────────────────────
function AddBatchModal({ item, onSave, onClose, isPending, error }: {
  item: InventoryItem
  onSave: (data: any) => void
  onClose: () => void
  isPending: boolean
  error?: string | null
}) {
  const [form, setForm] = useState({
    batchNumber: '', expiryDate: '', location: item.location || 'Main Warehouse',
    quantity: '', costPrice: String(item.costPrice || ''), sellingPrice: String(item.sellingPrice || ''), notes: '',
  })
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex gap-2 text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />{error}
        </div>
      )}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
        <div className="p-2 bg-teal-100 rounded-xl"><Package size={18} className="text-teal-600" /></div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">{item.product?.name}</p>
          <p className="text-xs text-gray-400">الكود: {(item.product as any)?.sku || item.id.slice(0, 8)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>رقم الدفعة *</label>
          <input value={form.batchNumber} onChange={f('batchNumber')} required placeholder="مثال: LOT-2024-001" className={INPUT} dir="ltr" />
        </div>
        <div>
          <label className={LABEL}>تاريخ الانتهاء</label>
          <input type="date" value={form.expiryDate} onChange={f('expiryDate')} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>موقع المستودع</label>
          <select value={form.location} onChange={f('location')} className={SELECT}>
            {['Main Warehouse', 'Cold Storage', 'Secondary Storage'].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>الكمية المستلمة *</label>
          <input type="number" min={1} required value={form.quantity} onChange={f('quantity')} placeholder="0" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>تكلفة الوحدة</label>
          <input type="number" min={0} step="0.01" value={form.costPrice} onChange={f('costPrice')} placeholder="0.00" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>سعر البيع</label>
          <input type="number" min={0} step="0.01" value={form.sellingPrice} onChange={f('sellingPrice')} placeholder="0.00" className={INPUT} />
        </div>
      </div>
      <div>
        <label className={LABEL}>ملاحظات</label>
        <textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="أضف ملاحظة داخلية لهذه الدفعة"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
      </div>
      <div className="flex justify-between pt-1">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">إلغاء</button>
        <button onClick={() => onSave(form)} disabled={isPending || !form.batchNumber.trim() || !form.quantity || Number(form.quantity) < 1}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl">
          {isPending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
          إضافة دفعة
        </button>
      </div>
    </div>
  )
}

// ── Edit Batch Modal (تعديل بيانات الدفعة) ────────────────────────────────────
function EditBatchModal({ batch, onSave, onClose, isPending, error }: {
  batch: { id: string; batchNumber: string | null; expiryDate: string | null; location: string | null; costPerUnit: number | null; sellingPrice: number | null; notes: string | null }
  onSave: (data: any) => void
  onClose: () => void
  isPending: boolean
  error?: string | null
}) {
  const [form, setForm] = useState({
    batchNumber:  batch.batchNumber  || '',
    expiryDate:   batch.expiryDate ? new Date(batch.expiryDate).toISOString().slice(0, 10) : '',
    location:     batch.location    || 'Main Warehouse',
    costPerUnit:  batch.costPerUnit  != null ? String(batch.costPerUnit)  : '',
    sellingPrice: batch.sellingPrice != null ? String(batch.sellingPrice) : '',
    notes:        batch.notes        || '',
  })
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex gap-2 text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />{error}
        </div>
      )}
      <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
        <Info size={12} className="inline me-1" />
        لتعديل الكمية، استخدم أزرار «إدخال/إخراج مخزون» (±) في صف الدفعة. هذا النموذج لتعديل البيانات الوصفية فقط.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>رقم الدفعة</label>
          <input value={form.batchNumber} onChange={f('batchNumber')} placeholder="مثال: LOT-2024-001" className={INPUT} dir="ltr" />
        </div>
        <div>
          <label className={LABEL}>تاريخ الانتهاء</label>
          <input type="date" value={form.expiryDate} onChange={f('expiryDate')} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>موقع المستودع</label>
          <select value={form.location} onChange={f('location')} className={SELECT}>
            {['Main Warehouse', 'Cold Storage', 'Secondary Storage'].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>تكلفة الوحدة</label>
          <input type="number" min={0} step="0.01" value={form.costPerUnit} onChange={f('costPerUnit')} placeholder="0.00" className={INPUT} />
        </div>
        <div className="col-span-2">
          <label className={LABEL}>سعر البيع</label>
          <input type="number" min={0} step="0.01" value={form.sellingPrice} onChange={f('sellingPrice')} placeholder="0.00" className={INPUT} />
        </div>
      </div>
      <div>
        <label className={LABEL}>ملاحظات</label>
        <textarea value={form.notes} onChange={f('notes')} rows={2}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
      </div>
      <div className="flex justify-between pt-1">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">إلغاء</button>
        <button onClick={() => onSave({
          batchNumber:  form.batchNumber.trim()  || undefined,
          expiryDate:   form.expiryDate          || null,
          location:     form.location.trim()     || null,
          costPerUnit:  form.costPerUnit  !== '' ? Number(form.costPerUnit)  : undefined,
          sellingPrice: form.sellingPrice !== '' ? Number(form.sellingPrice) : undefined,
          notes:        form.notes.trim()        || null,
        })} disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl">
          {isPending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
          حفظ التعديلات
        </button>
      </div>
    </div>
  )
}

// ── Stock In Modal (إدخال مخزون ↓) ────────────────────────────────────────────
function StockInModal({ item, onSave, onClose, isPending }: {
  item: InventoryItem
  onSave: (args: { batchId: string; qty: number; notes: string }) => void
  onClose: () => void
  isPending: boolean
}) {
  const { data: batchesResp, isLoading } = useQuery({
    queryKey: ['batches', item.id],
    queryFn: () => inventoryApi.listBatches(item.id).then(r => r.data),
  })
  const batches: BatchRow[] = (batchesResp || []).filter((b: BatchRow) => b.status !== 'depleted')
  const sorted = [...batches].sort((a, b) => {
    if (!a.expiryDate) return 1; if (!b.expiryDate) return -1
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
  })

  const [batchId, setBatchId] = useState<string>('')
  const [incoming, setIncoming] = useState('0')
  const [notes, setNotes] = useState('')
  useEffect(() => { if (!batchId && sorted[0]) setBatchId(sorted[0].id) }, [sorted, batchId])

  const selected = sorted.find(b => b.id === batchId)
  const qty = Number(incoming)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-3 bg-teal-50 rounded-xl border border-teal-200">
        <div className="p-2 bg-teal-100 rounded-xl"><Package size={18} className="text-teal-600" /></div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">{item.product?.name}</p>
          <p className="text-xs text-gray-400">إجمالي المخزون: {item.quantity} · {batches.length} دفعة نشطة</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-sm text-gray-400">جاري تحميل الدفعات…</div>
      ) : sorted.length === 0 ? (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-2 text-sm text-amber-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">لا توجد دفعات لهذا المنتج.</p>
            <p className="text-xs mt-1">أضف دفعة جديدة أولًا قبل إدخال مخزون.</p>
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className={LABEL}>اختر الدفعة (FEFO — الأقرب انتهاءً أولًا) *</label>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={INPUT}>
              {sorted.map(b => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber || 'بدون رقم'}
                  {b.expiryDate ? ` · ينتهي ${fmtDate(b.expiryDate)}` : ' · بدون انتهاء'}
                  {' '}· الكمية: {b.quantity}
                  {b.location ? ` · ${b.location}` : ''}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-gray-400">الكمية الحالية بالدفعة</p>
                <p className="text-gray-900 font-semibold mt-0.5">{selected.quantity}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-gray-400">تاريخ الانتهاء</p>
                <p className="text-gray-900 font-semibold mt-0.5">{fmtDate(selected.expiryDate)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-gray-400">الموقع</p>
                <p className="text-gray-900 font-semibold mt-0.5">{selected.location || '—'}</p>
              </div>
            </div>
          )}

          <div>
            <label className={LABEL}>الكمية الداخلة *</label>
            <input type="number" min={1} value={incoming} onChange={(e) => setIncoming(e.target.value)} className={INPUT} />
            {qty > 0 && selected && (
              <p className="text-xs text-teal-600 mt-1">
                الدفعة بعد الإدخال: <strong>{selected.quantity + qty}</strong> · إجمالي المنتج: <strong>{item.quantity + qty}</strong>
              </p>
            )}
          </div>
          <div>
            <label className={LABEL}>ملاحظات</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="أضف ملاحظة لحركة المخزون هذه"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
          </div>
        </>
      )}

      <div className="flex justify-between pt-1">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">إلغاء</button>
        <button onClick={() => onSave({ batchId, qty, notes })}
          disabled={isPending || qty <= 0 || !batchId}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl">
          {isPending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <ArrowDown size={15} />}
          تأكيد إدخال المخزون
        </button>
      </div>
    </div>
  )
}

// ── Stock Out Modal (إخراج مخزون ↑) ───────────────────────────────────────────
function StockOutModal({ item, onSave, onClose, isPending }: {
  item: InventoryItem
  onSave: (args: { batchId: string; qty: number; notes: string }) => void
  onClose: () => void
  isPending: boolean
}) {
  const { data: batchesResp, isLoading } = useQuery({
    queryKey: ['batches', item.id],
    queryFn: () => inventoryApi.listBatches(item.id).then(r => r.data),
  })
  const batches: BatchRow[] = (batchesResp || []).filter((b: BatchRow) => b.status !== 'depleted' && b.quantity > 0)
  const sorted = [...batches].sort((a, b) => {
    if (!a.expiryDate) return 1; if (!b.expiryDate) return -1
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
  })

  const [batchId, setBatchId] = useState<string>('')
  const [outgoing, setOutgoing] = useState('0')
  const [notes, setNotes] = useState('')
  useEffect(() => { if (!batchId && sorted[0]) setBatchId(sorted[0].id) }, [sorted, batchId])

  const selected = sorted.find(b => b.id === batchId)
  const qty = Number(outgoing)
  const overflow = !!(selected && qty > selected.quantity)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-200">
        <div className="p-2 bg-red-100 rounded-xl"><Package size={18} className="text-red-500" /></div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">{item.product?.name}</p>
          <p className="text-xs text-gray-400">إجمالي المخزون: {item.quantity} · {batches.length} دفعة متاحة</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-sm text-gray-400">جاري تحميل الدفعات…</div>
      ) : sorted.length === 0 ? (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-2 text-sm text-amber-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">لا توجد دفعات بكمية متاحة للإخراج.</p>
            <p className="text-xs mt-1">جميع الدفعات منتهية أو فارغة.</p>
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className={LABEL}>اختر الدفعة (FEFO — اصرف الأقرب انتهاءً أولًا) *</label>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={INPUT}>
              {sorted.map(b => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber || 'بدون رقم'}
                  {b.expiryDate ? ` · ينتهي ${fmtDate(b.expiryDate)}` : ' · بدون انتهاء'}
                  {' '}· متاح: {b.quantity}
                  {b.location ? ` · ${b.location}` : ''}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-gray-400">المتاح بالدفعة</p>
                <p className="text-gray-900 font-semibold mt-0.5">{selected.quantity}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-gray-400">تاريخ الانتهاء</p>
                <p className="text-gray-900 font-semibold mt-0.5">{fmtDate(selected.expiryDate)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-gray-400">الموقع</p>
                <p className="text-gray-900 font-semibold mt-0.5">{selected.location || '—'}</p>
              </div>
            </div>
          )}

          <div>
            <label className={LABEL}>الكمية الخارجة *</label>
            <input type="number" min={1} max={selected?.quantity ?? 0} value={outgoing}
              onChange={(e) => setOutgoing(e.target.value)} className={INPUT} />
            {qty > 0 && !overflow && selected && (
              <p className="text-xs text-orange-600 mt-1">
                الدفعة بعد الإخراج: <strong>{selected.quantity - qty}</strong> · إجمالي المنتج: <strong>{item.quantity - qty}</strong>
              </p>
            )}
            {overflow && (
              <p className="text-xs text-red-600 mt-1">⚠️ الكمية الخارجة أكبر من رصيد الدفعة المختارة</p>
            )}
          </div>
          <div>
            <label className={LABEL}>ملاحظات</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="أضف ملاحظة لحركة المخزون هذه"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
          </div>
        </>
      )}

      <div className="flex justify-between pt-1">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">إلغاء</button>
        <button onClick={() => onSave({ batchId, qty, notes })}
          disabled={isPending || qty <= 0 || !batchId || overflow}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl">
          {isPending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <ArrowUp size={15} />}
          تأكيد إخراج المخزون
        </button>
      </div>
    </div>
  )
}

// ── Export Confirm ─────────────────────────────────────────────────────────────
function ExportConfirm({ count, onConfirm, onCancel }: { count: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
        <Download size={20} className="text-blue-600 shrink-0" />
        <div>
          <p className="font-semibold text-gray-900 text-sm">تصدير بيانات المخزون</p>
          <p className="text-xs text-gray-500 mt-0.5">سيتم تصدير <strong>{count}</strong> صنف بصيغة CSV</p>
        </div>
      </div>
      <p className="text-sm text-gray-600">الملف سيحتوي على جميع الحقول: اسم المنتج، الكمية، الدفعة، تاريخ الانتهاء، التكلفة، سعر البيع، الموقع.</p>
      <div className="flex justify-end gap-3 pt-1">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">إلغاء</button>
        <button onClick={onConfirm} className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
          <Download size={15} />تصدير CSV
        </button>
      </div>
    </div>
  )
}

// ── Row Actions Menu ────────────────────────────────────────────────────────────
function RowMenu({ item, anchor, onClose }: { item: InventoryItem; anchor: DOMRect; onClose: () => void }) {
  // Render via portal with fixed positioning so the menu floats above any
  // table overflow:auto wrapper. Position below the trigger; flip up if it
  // would overflow the viewport.
  const MENU_W = 192
  const MENU_H = 196
  const top  = anchor.bottom + 4 + window.scrollY
  const left = Math.max(8, anchor.right - MENU_W) + window.scrollX
  const flipUp = anchor.bottom + MENU_H > window.innerHeight - 8
  const finalTop = flipUp ? anchor.top - MENU_H - 4 + window.scrollY : top

  return createPortal(
    <div
      role="menu"
      onClick={e => e.stopPropagation()}
      className="fixed w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-[1000]"
      style={{ top: finalTop, left }}
    >
      {[
        { icon: Eye,          label: 'عرض المنتج',           action: () => {} },
        { icon: History,      label: 'سجل تاريخ المنتج',     action: () => {} },
        { icon: Printer,      label: 'طباعة الباركود',       action: () => {} },
        { icon: ShoppingCart, label: 'بيع عبر الإنترنت (P2P)', action: () => {}, disabled: true },
      ].map(({ icon: Icon, label, action, disabled }) => (
        <button key={label} onClick={() => { action(); onClose() }}
          disabled={disabled}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-start transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 text-gray-700">
          <Icon size={14} className="text-gray-400" />{label}
        </button>
      ))}
    </div>,
    document.body
  )
}

// ── Add Product Modal (browse + create) ────────────────────────────────────────
function AddProductModal({ products, onCreate, onBrowseAdd, onClose, isBrowsePending, isCreatePending, error, similarCandidates, onUseCandidate, onForceCreate, onDismissSimilar }: {
  products: Product[]
  onCreate: (productData: any, inventoryData: any) => void
  onBrowseAdd: (productId: string, qty: number, threshold: number, expiry?: string) => void
  onClose: () => void
  isBrowsePending: boolean
  isCreatePending: boolean
  error: string | null
  similarCandidates?: Array<{ productId: string; score: number; signals: string[]; product: { id: string; name?: string; nameAr?: string; manufacturer?: string; strength?: string; dosageForm?: string; barcode?: string } }> | null
  onUseCandidate?: (productId: string, qty: number, threshold: number, expiry?: string) => void
  onForceCreate?: (productData: any, inventoryData: any) => void
  onDismissSimilar?: () => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'browse' | 'create'>('browse')
  const [search, setSearch] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [browseQty, setBrowseQty] = useState('')
  const [browseThreshold, setBrowseThreshold] = useState('10')
  const [browseExpiry, setBrowseExpiry] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [barcodeStatus, setBarcodeStatus] = useState<'idle' | 'found' | 'new' | 'scanning'>('idle')
  const [existingProductId, setExistingProductId] = useState('')
  const [form, setForm] = useState({ sku:'', name:'', nameAr:'', genericName:'', category:'', dosageForm:'', strength:'', unit:'', manufacturer:'', atcCode:'', sfdaRegistration:'' })
  const [createQty, setCreateQty] = useState('')
  const [createThreshold, setCreateThreshold] = useState('10')
  const [createExpiry, setCreateExpiry] = useState('')
  const cameraRef = useRef<HTMLInputElement>(null)

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  const lookupBarcode = async (barcode: string) => {
    if (!barcode.trim()) return
    try {
      const res = await inventoryApi.lookupBarcode(barcode)
      const p: Product = res.data
      if (p?.id) {
        setExistingProductId(p.id)
        setForm({ sku: p.sku||'', name: p.name||'', nameAr: p.nameAr||'', genericName: p.genericName||'', category: p.category||'', dosageForm: p.dosageForm||'', strength: p.strength||'', unit: p.unit||'', manufacturer: p.manufacturer||'', atcCode: p.atcCode||'', sfdaRegistration: p.sfdaRegistration||'' })
        setBarcodeStatus('found')
      } else { setBarcodeStatus('new'); setExistingProductId('') }
    } catch { setBarcodeStatus('new'); setExistingProductId('') }
  }

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBarcodeStatus('scanning')
    try {
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['ean_13','ean_8','code_128','code_39','qr_code'] })
        const bitmap = await createImageBitmap(file)
        const codes: any[] = await detector.detect(bitmap)
        if (codes.length > 0) { setBarcodeInput(codes[0].rawValue); await lookupBarcode(codes[0].rawValue) }
        else { setBarcodeStatus('new'); alert('لم يُعثر على باركود في الصورة. أدخله يدوياً.') }
      } else { setBarcodeStatus('idle'); alert('مسح الباركود غير مدعوم في هذا المتصفح. استخدم Chrome.') }
    } catch { setBarcodeStatus('idle') }
    if (cameraRef.current) cameraRef.current.value = ''
  }

  const generateCode = () => { const c = `MP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2,5).toUpperCase()}`; setBarcodeInput(c); setBarcodeStatus('new'); setExistingProductId('') }

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.genericName?.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase()))
  const selectedProduct = products.find(p => p.id === selectedProductId)
  const CATEGORIES = ['antibiotics','analgesics','gastrointestinal','cardiovascular','respiratory','diabetes','neurological','dermatology','ophthalmology','vitamins','hormones','oncology','gynecology','pediatrics','other'] as const
  const DOSAGE_FORMS = ['tablet','capsule','syrup','injection','cream','drops','spray','powder','suppository','patch','other'] as const
  const UNITS = ['tablet','capsule','ml','g','mg','iu','dose','package','vial','tube'] as const

  return (
    <div className="flex flex-col" style={{ maxHeight: '85vh' }}>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {(['browse','create'] as const).map(m => (
          <button key={m} type="button" onClick={() => { setMode(m); setSelectedProductId(''); setSearch('') }}
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-start transition-all ${mode===m ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <div className={`p-2.5 rounded-xl shrink-0 ${mode===m ? 'bg-teal-100' : 'bg-gray-100'}`}>
              {m==='browse' ? <Sparkles size={16} className={mode===m ? 'text-teal-600' : 'text-gray-500'} /> : <Package size={16} className={mode===m ? 'text-teal-600' : 'text-gray-500'} />}
            </div>
            <div>
              <p className={`text-sm font-semibold ${mode===m ? 'text-teal-700' : 'text-gray-700'}`}>{m==='browse' ? t('inventory.add.browse_tab') : t('inventory.add.manual_tab')}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m==='browse' ? t('inventory.add.browse_sub', { count: products.length }) : t('inventory.add.manual_sub')}</p>
            </div>
          </button>
        ))}
      </div>
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex gap-2"><AlertCircle size={14} className="mt-0.5 shrink-0" />{Array.isArray(error) ? error.join(', ') : error}</div>}

      {mode === 'browse' && (
        <div className="flex flex-col gap-4 overflow-hidden flex-1">
          <div className="relative"><Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input placeholder={t('inventory.add.search_ph')} value={search} onChange={e => setSearch(e.target.value)} autoFocus className="w-full border border-gray-200 rounded-xl ps-9 pe-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
          </div>
          <div className="border border-gray-200 rounded-xl overflow-y-auto" style={{ maxHeight:'220px' }}>
            {filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-10 text-gray-400"><Package size={28} className="mb-2 opacity-40" /><p className="text-sm">{t('inventory.add.no_products')}</p></div>
              : filtered.slice(0,80).map(p => (
                <button key={p.id} type="button" onClick={() => setSelectedProductId(p.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-start text-sm border-b border-gray-100 last:border-0 transition-colors ${selectedProductId===p.id ? 'bg-teal-50' : 'hover:bg-gray-50'}`}>
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium truncate ${selectedProductId===p.id ? 'text-teal-700' : 'text-gray-900'}`}>{p.name}</p>
                    {(p.genericName||p.category) && <p className="text-xs text-gray-400 mt-0.5 truncate">{[p.genericName,p.category].filter(Boolean).join(' · ')}</p>}
                  </div>
                  {selectedProductId===p.id && <CheckCircle size={15} className="text-teal-600 shrink-0 ms-2" />}
                </button>
              ))}
          </div>
          {selectedProduct && <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-700"><CheckCircle size={14} /><span className="font-medium truncate">{selectedProduct.name}</span></div>}
          <div className="grid grid-cols-3 gap-3">
            <div><label className={LABEL}>{t('inventory.add.qty_label')}</label><input type="number" min={0} required value={browseQty} onChange={e => setBrowseQty(e.target.value)} placeholder="200" className={INPUT} /></div>
            <div><label className={LABEL}>{t('inventory.add.threshold_label')}</label><input type="number" min={0} value={browseThreshold} onChange={e => setBrowseThreshold(e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>{t('inventory.add.expiry_label')}</label><input type="date" value={browseExpiry} onChange={e => setBrowseExpiry(e.target.value)} className={INPUT} /></div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">{t('common.cancel')}</button>
            <button type="button" disabled={isBrowsePending||!selectedProductId||!browseQty} onClick={() => onBrowseAdd(selectedProductId, Number(browseQty), Number(browseThreshold), browseExpiry||undefined)}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl">
              {isBrowsePending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Plus size={15} />}{t('inventory.add.add_btn')}
            </button>
          </div>
        </div>
      )}

      {mode === 'create' && (
        <form onSubmit={e => { e.preventDefault(); if (!form.name||!form.category||!form.unit||!createQty) return; const inv = { quantity:Number(createQty), minThreshold:Number(createThreshold), expiryDate:createExpiry||undefined }; if (existingProductId) onBrowseAdd(existingProductId, inv.quantity, inv.minThreshold, inv.expiryDate); else if (similarCandidates && similarCandidates.length > 0 && onForceCreate) onForceCreate({ ...form, barcode:barcodeInput||undefined }, inv); else onCreate({ ...form, barcode:barcodeInput||undefined }, inv) }}
          className="flex flex-col gap-5 overflow-y-auto flex-1 pe-1">
          {similarCandidates && similarCandidates.length > 0 && (
            <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-amber-100 rounded-xl shrink-0"><Sparkles size={18} className="text-amber-600" /></div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-900">منتجات مشابهة موجودة بالفعل</p>
                  <p className="text-xs text-amber-700 mt-0.5">هل تقصد أحد هذه المنتجات؟ استخدم الموجود لتفادي تكرار الكتالوج.</p>
                </div>
                {onDismissSimilar && (
                  <button type="button" onClick={onDismissSimilar} className="text-amber-500 hover:text-amber-700 text-xs">إخفاء</button>
                )}
              </div>
              <div className="space-y-2">
                {similarCandidates.slice(0, 4).map(c => (
                  <button key={c.productId} type="button"
                    onClick={() => { if (!onUseCandidate || !createQty) return; onUseCandidate(c.productId, Number(createQty), Number(createThreshold), createExpiry || undefined) }}
                    disabled={!createQty || isBrowsePending}
                    className="w-full text-start p-3 bg-white rounded-xl border border-amber-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all flex items-center gap-3 disabled:opacity-60">
                    <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shrink-0">
                      <span className="text-base font-bold leading-none">{c.score}</span>
                      <span className="text-[9px] opacity-80 mt-0.5">match</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{c.product.nameAr || c.product.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {[c.product.manufacturer, c.product.strength, c.product.dosageForm].filter(Boolean).join(' • ')}
                        {c.product.barcode ? ` • ${c.product.barcode}` : ''}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.signals.slice(0, 3).map(s => (
                          <span key={s} className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md font-medium">{s}</span>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-amber-600 font-semibold shrink-0">استخدم هذا ←</span>
                  </button>
                ))}
              </div>
              {!createQty && (
                <p className="text-[11px] text-amber-700 mt-2">أدخل الكمية أدناه قبل اختيار منتج موجود.</p>
              )}
              <p className="text-[11px] text-amber-800 mt-3 pt-3 border-t border-amber-200">
                لا يطابق أي من هذه؟ اضغط زر «إنشاء جديد رغم التشابه» في الأسفل.
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('inventory.add.section_product')}</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><label className={LABEL}>{t('inventory.add.field_sku')}</label><input value={form.sku} onChange={f('sku')} placeholder={t('inventory.add.field_sku_ph')} className={INPUT} /></div>
              <div>
                <label className={LABEL}>{t('inventory.add.field_barcode')}</label>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraCapture} />
                <div className="flex gap-1.5">
                  <input value={barcodeInput} onChange={e => { setBarcodeInput(e.target.value); if (!e.target.value) { setBarcodeStatus('idle'); setExistingProductId('') } }}
                    onKeyDown={e => { if (e.key==='Enter') { e.preventDefault(); lookupBarcode(barcodeInput) } }} onBlur={() => { if (barcodeInput.trim()) lookupBarcode(barcodeInput) }}
                    placeholder={t('inventory.add.field_barcode_ph')} className={`${INPUT} flex-1 min-w-0`} dir="ltr" />
                  <button type="button" title="مسح بالكاميرا" onClick={() => cameraRef.current?.click()} className="shrink-0 px-2.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl flex items-center">
                    {barcodeStatus==='scanning' ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : <ScanBarcode size={15} />}
                  </button>
                  <button type="button" onClick={generateCode} className="shrink-0 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold">إنشاء</button>
                </div>
                {barcodeStatus==='found' && <p className="text-xs text-teal-600 mt-1 flex items-center gap-1"><CheckCircle size={11} />{t('inventory.add.barcode_found')}</p>}
                {barcodeStatus==='new' && <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><Info size={11} />{t('inventory.add.barcode_new')}</p>}
              </div>
              <div><label className={LABEL}>{t('inventory.add.field_name_en')}</label><input required value={form.name} onChange={f('name')} placeholder={t('inventory.add.field_name_en_ph')} className={INPUT} dir="ltr" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><label className={LABEL}>{t('inventory.add.field_name_ar')}</label><input value={form.nameAr} onChange={f('nameAr')} placeholder={t('inventory.add.field_name_ar_ph')} className={INPUT} dir="rtl" /></div>
              <div><label className={LABEL}>{t('inventory.add.field_category')}</label>
                <select required value={form.category} onChange={f('category')} className={SELECT}>
                  <option value="">{t('inventory.add.field_category_ph')}</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{t(`inventory.add.categories.${c}`)}</option>)}
                </select></div>
              <div><label className={LABEL}>{t('inventory.add.field_dosage_form')}</label>
                <select value={form.dosageForm} onChange={f('dosageForm')} className={SELECT}>
                  <option value=""></option>
                  {DOSAGE_FORMS.map(d => <option key={d} value={d}>{t(`inventory.add.dosage_forms.${d}`)}</option>)}
                </select></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={LABEL}>{t('inventory.add.field_strength')}</label><input value={form.strength} onChange={f('strength')} placeholder="500mg" className={INPUT} dir="ltr" /></div>
              <div><label className={LABEL}>{t('inventory.add.field_unit')}</label>
                <select required value={form.unit} onChange={f('unit')} className={SELECT}>
                  <option value=""></option>
                  {UNITS.map(u => <option key={u} value={u}>{t(`inventory.add.units.${u}`)}</option>)}
                </select></div>
              <div><label className={LABEL}>{t('inventory.add.field_manufacturer')}</label><input value={form.manufacturer} onChange={f('manufacturer')} placeholder="GSK" className={INPUT} /></div>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('inventory.add.section_inventory')}</p>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={LABEL}>{t('inventory.add.qty_label')}</label><input type="number" min={0} required value={createQty} onChange={e => setCreateQty(e.target.value)} placeholder="200" className={INPUT} /></div>
              <div><label className={LABEL}>{t('inventory.add.threshold_label')}</label><input type="number" min={0} value={createThreshold} onChange={e => setCreateThreshold(e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>{t('inventory.add.expiry_label')}</label><input type="date" value={createExpiry} onChange={e => setCreateExpiry(e.target.value)} className={INPUT} /></div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1 sticky bottom-0 bg-white pb-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">{t('common.cancel')}</button>
            <button type="submit" disabled={isCreatePending||!form.name||!form.category||!form.unit||!createQty}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl">
              {isCreatePending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Plus size={15} />}
              {existingProductId
                ? t('inventory.add.add_btn')
                : (similarCandidates && similarCandidates.length > 0
                    ? 'إنشاء جديد رغم التشابه'
                    : t('inventory.add.create_btn'))}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Setup landing (empty state) ────────────────────────────────────────────────
function InventorySetupLanding({ onBulkUpload, onAddManually }: { onBulkUpload: () => void; onAddManually: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-8">
          <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-3">{t('inventory.setup.badge')}</p>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-3">{t('inventory.setup.title')}</h1>
          <p className="text-gray-500 mb-8 leading-relaxed">{t('inventory.setup.subtitle')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            <button onClick={onBulkUpload} className="flex items-center gap-3 px-5 py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-start transition-all shadow-sm hover:shadow-md">
              <div className="p-2.5 bg-white/20 rounded-xl shrink-0"><Upload size={20} /></div>
              <div className="flex-1"><p className="font-semibold text-base">{t('inventory.setup.bulk_cta')}</p><p className="text-teal-100 text-xs mt-0.5">{t('inventory.setup.bulk_sub')}</p></div>
              <ArrowRight size={16} className="opacity-70 shrink-0" />
            </button>
            <button onClick={onAddManually} className="flex items-center gap-3 px-5 py-4 border-2 border-gray-200 hover:border-teal-300 hover:bg-teal-50 text-gray-700 rounded-2xl text-start transition-all">
              <div className="p-2.5 bg-gray-100 rounded-xl shrink-0"><Plus size={20} className="text-gray-600" /></div>
              <div className="flex-1"><p className="font-semibold text-base">{t('inventory.setup.manual_cta')}</p><p className="text-gray-400 text-xs mt-0.5">{t('inventory.setup.manual_sub')}</p></div>
              <ArrowRight size={16} className="opacity-40 shrink-0" />
            </button>
          </div>
          <div className="flex items-center">
            {[{ icon:Upload, label:t('inventory.setup.step1'), sub:t('inventory.setup.step1_sub') }, { icon:Package, label:t('inventory.setup.step2'), sub:t('inventory.setup.step2_sub') }, { icon:Sparkles, label:t('inventory.setup.step3'), sub:t('inventory.setup.step3_sub') }].map((step,i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="flex flex-col items-center text-center flex-1">
                  <div className="w-10 h-10 rounded-full bg-teal-50 border-2 border-teal-200 flex items-center justify-center mb-2"><step.icon size={16} className="text-teal-600" /></div>
                  <p className="text-xs font-semibold text-gray-700">{step.label}</p><p className="text-xs text-gray-400 mt-0.5">{step.sub}</p>
                </div>
                {i < 2 && <div className="w-8 h-px bg-teal-200 mb-6 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-teal-700 text-white rounded-2xl p-6 flex flex-col">
          <p className="text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1">{t('inventory.setup.sidebar_label')}</p>
          <h3 className="text-lg font-bold mb-3 leading-snug">{t('inventory.setup.sidebar_title')}</h3>
          <p className="text-teal-100 text-sm leading-relaxed mb-6">{t('inventory.setup.sidebar_desc')}</p>
          <p className="text-xs font-semibold text-teal-300 mb-3 uppercase tracking-wider">{t('inventory.setup.can_do')}</p>
          <ul className="space-y-2.5 flex-1">
            {(['can_1','can_2','can_3','can_4'] as const).map(k => (
              <li key={k} className="flex items-start gap-2.5 text-sm text-teal-50"><CheckCircle size={14} className="text-teal-300 mt-0.5 shrink-0" />{t(`inventory.setup.${k}`)}</li>
            ))}
          </ul>
          <div className="mt-6 pt-5 border-t border-teal-600"><p className="text-xs text-teal-300 flex items-center gap-1.5"><CheckCircle size={12} />{t('inventory.setup.live_caption')}</p></div>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-4"><Clock size={14} className="text-gray-400" /><p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{t('inventory.setup.coming_soon_title')}</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[{ icon:Building2, title:t('inventory.setup.moh_title'), sub:t('inventory.setup.moh_sub') }, { icon:FlaskConical, title:t('inventory.setup.sfda_title'), sub:t('inventory.setup.sfda_sub') }, { icon:ScanLine, title:t('inventory.setup.gs1_title'), sub:t('inventory.setup.gs1_sub') }].map(item => (
            <div key={item.title} className="bg-white border border-gray-200 rounded-2xl p-5 opacity-70 relative overflow-hidden">
              <span className="absolute top-4 end-4 text-xs font-semibold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{t('common.coming_soon')}</span>
              <div className="p-2.5 bg-gray-100 rounded-xl w-fit mb-3"><item.icon size={18} className="text-gray-500" /></div>
              <p className="font-semibold text-gray-700 text-sm mb-1">{item.title}</p>
              <p className="text-xs text-gray-400 leading-relaxed">{item.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Catalog Request Modal — pharmacy asks central catalog to add a missing product
function CatalogRequestModal({ item, onSubmit, onClose, isPending, error }: {
  item: InventoryItem
  onSubmit: (data: { name?: string; nameAr?: string; barcode?: string; manufacturer?: string; dosageForm?: string; strength?: string; notes?: string }) => void
  onClose: () => void
  isPending: boolean
  error?: string | null
}) {
  const [form, setForm] = useState({
    name:         item.product?.name        || '',
    nameAr:       (item.product as any)?.nameAr || '',
    barcode:      item.product?.barcode     || '',
    manufacturer: (item.product as any)?.manufacturer || '',
    dosageForm:   (item.product as any)?.dosageForm   || '',
    strength:     (item.product as any)?.strength     || '',
    notes:        '',
  })
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))
  const canSubmit = !!(form.name.trim() || form.nameAr.trim() || form.barcode.trim())
  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex gap-2 text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />{error}
        </div>
      )}
      <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700">
        <Info size={12} className="inline me-1" />
        سيُنشئ النظام رقم تتبّع رسمي (REQ-XXXXXX) ويُحدّث حالة المنتج إلى «قيد المراجعة» حتى يُعتمد من فريق الكتالوج.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>الاسم بالعربية</label>
          <input value={form.nameAr} onChange={f('nameAr')} placeholder="مثال: باراسيتامول 500 مجم" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>الاسم بالإنجليزية</label>
          <input value={form.name} onChange={f('name')} placeholder="e.g. Paracetamol 500mg" className={INPUT} dir="ltr" />
        </div>
        <div>
          <label className={LABEL}>الباركود / GTIN</label>
          <input value={form.barcode} onChange={f('barcode')} placeholder="6281234567890" className={INPUT} dir="ltr" />
        </div>
        <div>
          <label className={LABEL}>الشركة المصنعة</label>
          <input value={form.manufacturer} onChange={f('manufacturer')} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>الشكل الصيدلاني</label>
          <input value={form.dosageForm} onChange={f('dosageForm')} placeholder="أقراص / شراب / حقن" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>التركيز</label>
          <input value={form.strength} onChange={f('strength')} placeholder="500mg" className={INPUT} dir="ltr" />
        </div>
      </div>
      <div>
        <label className={LABEL}>ملاحظات للفريق</label>
        <textarea value={form.notes} onChange={f('notes')} rows={3} placeholder="أي معلومات إضافية تساعد على التحقق من المنتج"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
      </div>
      <div className="flex justify-between pt-1">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">إلغاء</button>
        <button onClick={() => onSubmit({
          name:         form.name.trim()         || undefined,
          nameAr:       form.nameAr.trim()       || undefined,
          barcode:      form.barcode.trim()      || undefined,
          manufacturer: form.manufacturer.trim() || undefined,
          dosageForm:   form.dosageForm.trim()   || undefined,
          strength:     form.strength.trim()     || undefined,
          notes:        form.notes.trim()        || undefined,
        })} disabled={isPending || !canSubmit}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl">
          {isPending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Sparkles size={14} />}
          إرسال الطلب
        </button>
      </div>
    </div>
  )
}

// ── Batches Sub-Row ───────────────────────────────────────────────────────────
interface BatchRow {
  id: string
  batchNumber: string | null
  expiryDate: string | null
  quantity: number
  receivedQuantity: number
  costPerUnit: number | null
  sellingPrice: number | null
  location: string | null
  status: string
  notes: string | null
  createdAt: string
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function BatchesSubRow({
  inventoryId, currency, colSpan, onAdjust, onEdit, onDelete,
}: {
  inventoryId: string
  currency: string
  colSpan: number
  onAdjust: (batch: BatchRow, delta: number) => void
  onEdit:   (batch: BatchRow) => void
  onDelete: (batch: BatchRow) => void
}) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['batches', inventoryId],
    queryFn: () => inventoryApi.listBatches(inventoryId).then(r => r.data as BatchRow[]),
  })

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  return (
    <tr className="bg-gradient-to-b from-gray-50 to-white border-b border-gray-100">
      <td colSpan={colSpan} className="p-0">
        <div className="px-6 py-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <div className="w-4 h-4 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
              {t('common.loading') || 'جارٍ التحميل…'}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 py-4">
              <AlertCircle size={14} /> تعذّر تحميل الدفعات
            </div>
          )}
          {!isLoading && !error && (data?.length ?? 0) === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <Layers size={14} /> لا توجد دفعات مسجلة لهذا المنتج
            </div>
          )}
          {!isLoading && !error && (data?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['الدفعة','الانتهاء','الكمية','التكلفة','سعر البيع','الموقع','الإجراءات'].map(h => (
                      <th key={h} className="text-start px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data!.map(b => {
                    const days = b.expiryDate
                      ? Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86400000)
                      : null
                    const expColor =
                      days === null ? 'text-gray-400'
                      : days < 0    ? 'text-red-600 font-semibold'
                      : days <= 30  ? 'text-orange-600 font-semibold'
                      : days <= 90  ? 'text-amber-600'
                      : 'text-gray-600'
                    return (
                      <tr key={b.id} className="border-b last:border-b-0 border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs text-teal-700 whitespace-nowrap">
                          {b.batchNumber || '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-xs whitespace-nowrap ${expColor}`}>
                          {fmtDate(b.expiryDate)}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-gray-900">{b.quantity}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                          {b.costPerUnit != null ? `${currency} ${Number(b.costPerUnit).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-800 font-medium whitespace-nowrap">
                          {b.sellingPrice != null ? `${currency} ${Number(b.sellingPrice).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{b.location || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 relative">
                            <button
                              onClick={() => onAdjust(b, +1)}
                              title="إدخال مخزون لهذه الدفعة"
                              className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition-colors">
                              <ArrowDown size={14} />
                            </button>
                            <button
                              onClick={() => onAdjust(b, -1)}
                              title="إخراج مخزون من هذه الدفعة"
                              disabled={b.quantity <= 0}
                              className="p-1.5 text-red-600 hover:text-white hover:bg-red-600 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-red-600">
                              <ArrowUp size={14} />
                            </button>
                            <button
                              onClick={() => onEdit(b)}
                              title="تعديل الدفعة"
                              className="p-1.5 text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg transition-colors">
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setMenuOpen(menuOpen === b.id ? null : b.id)
                              }}
                              title="خيارات إضافية"
                              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
                              <MoreHorizontal size={14} />
                            </button>
                            {menuOpen === b.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute end-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[180px] animate-in fade-in slide-in-from-top-1 duration-150">
                                <button
                                  onClick={() => { setMenuOpen(null); onEdit(b) }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50">
                                  <Pencil size={14} className="text-blue-600" /> تعديل بيانات الدفعة
                                </button>
                                <button
                                  onClick={() => { setMenuOpen(null); onAdjust(b, +1) }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50">
                                  <ArrowDown size={14} className="text-emerald-600" /> إضافة وحدة (+1)
                                </button>
                                <button
                                  onClick={() => { setMenuOpen(null); onAdjust(b, -1) }}
                                  disabled={b.quantity <= 0}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                  <ArrowUp size={14} className="text-red-600" /> سحب وحدة (-1)
                                </button>
                                <div className="my-1 border-t border-gray-100" />
                                <button
                                  onClick={() => { setMenuOpen(null); onDelete(b) }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50 font-medium">
                                  <Trash2 size={14} className="text-red-600" /> حذف الدفعة
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────────
type StatFilter = 'all' | 'low' | 'expiring' | 'expired' | 'dead' | 'review'
interface Filters {
  category: string
  stockRange: '' | '0-10' | '10-50' | '50-100' | '100-500' | '500+'
  stockStatus: '' | 'low' | 'in' | 'out'
  expiryStatus: '' | '30' | '60' | '90' | '120'
  movement: '' | 'active' | 'moderate' | 'stagnant'
  status: '' | 'expired' | 'expiring_soon' | 'low_stock' | 'inactive' | 'draft' | 'received' | 'pending' | 'store_draft' | 'cancelled' | 'completed' | 'refund'
  location: string
}

const EMPTY_FILTERS: Filters = {
  category: '', stockRange: '', stockStatus: '', expiryStatus: '',
  movement: '', status: '', location: '',
}

// Preset category list (Arabic). Combined with categories detected in the
// current inventory so user-defined values still appear.
const PRESET_CATEGORIES = [
  'أخرى','أدوية','أطعمة ومكملات','الجمال والعناية الشخصية','العناية الشخصية والإكسسوارات',
  'رعاية الأطفال','غير محدد','مستحضرات تجميل','مستلزمات طبية','أجهزة طبية',
  'أدوات الإسعافات الأولية','أدوات طبية','الدعامات الطبية','أعشاب','التغذية',
  'العناية بالأظافر','العناية بالبشرة','العناية بالشعر','العناية بالعين','صبغات الشعر',
  'عطور','مكياج','أغذية الأطفال','حفاضات الأطفال','حليب','منتجات الأطفال','أجهزة',
  'إكسسوارات','الصحة الجنسية','العناية الشخصية','العناية بالفم','جسم واستحمام',
  'منتجات ورقية','اخري',
] as const

const STOCK_RANGE_OPTS = [
  { value: '0-10',    label: '0 - 10' },
  { value: '10-50',   label: '10 - 50' },
  { value: '50-100',  label: '50 - 100' },
  { value: '100-500', label: '100 - 500' },
  { value: '500+',    label: '+500' },
] as const

const STOCK_STATUS_OPTS = [
  { value: 'low', label: 'مخزون منخفض' },
  { value: 'in',  label: 'متوفر' },
  { value: 'out', label: 'نفذ المخزون' },
] as const

const EXPIRY_OPTS = [
  { value: '30',  label: 'خلال 30 يوم' },
  { value: '60',  label: 'خلال 60 يوم' },
  { value: '90',  label: 'خلال 90 يوم' },
  { value: '120', label: 'خلال 120 يوم' },
] as const

const MOVEMENT_OPTS = [
  { value: 'active',    label: 'قيد الحركة' },
  { value: 'moderate',  label: 'معتدل' },
  { value: 'stagnant',  label: 'راكد' },
] as const

const STATUS_OPTS = [
  { value: 'expired',       label: 'منتهي الصلاحية' },
  { value: 'expiring_soon', label: 'ينتهي قريباً' },
  { value: 'low_stock',     label: 'مخزون منخفض' },
  { value: 'inactive',      label: 'غير مُفعل' },
  { value: 'draft',         label: 'مسودة' },
  { value: 'received',      label: 'مستلم' },
  { value: 'pending',       label: 'قيد الانتظار' },
  { value: 'store_draft',   label: 'مسودة المتجر' },
  { value: 'cancelled',     label: 'ملغي' },
  { value: 'completed',     label: 'مكتمل' },
  { value: 'refund',        label: 'استرداد' },
] as const

// Days since last update, used to classify movement
const movementBucket = (updatedAt?: string): 'active' | 'moderate' | 'stagnant' | null => {
  if (!updatedAt) return null
  const days = (Date.now() - new Date(updatedAt).getTime()) / 86400000
  if (days <= 7)  return 'active'
  if (days <= 30) return 'moderate'
  return 'stagnant'
}

const inStockRange = (qty: number, range: Filters['stockRange']) => {
  switch (range) {
    case '0-10':    return qty >= 0   && qty <= 10
    case '10-50':   return qty >  10  && qty <= 50
    case '50-100':  return qty >  50  && qty <= 100
    case '100-500': return qty >  100 && qty <= 500
    case '500+':    return qty >  500
    default:        return true
  }
}

export default function InventoryPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()

  // UI state
  const [search, setSearch]                   = useState('')
  const [statFilter, setStatFilter]           = useState<StatFilter>('all')
  const [showFilters, setShowFilters]         = useState(false)
  const [filters, setFilters]                 = useState<Filters>(EMPTY_FILTERS)
  const [showBulkUpload, setShowBulkUpload]   = useState(false)
  const [showAdd, setShowAdd]                 = useState(false)
  const [showExport, setShowExport]           = useState(false)
  const [uploadToast, setUploadToast]         = useState<any | null>(null)
  const [openMenu, setOpenMenu]               = useState<{ id: string; rect: DOMRect } | null>(null)
  const [stockInItem, setStockInItem]         = useState<InventoryItem | null>(null)
  const [stockOutItem, setStockOutItem]       = useState<InventoryItem | null>(null)
  const [addBatchItem, setAddBatchItem]       = useState<InventoryItem | null>(null)
  const [editItem, setEditItem]               = useState<InventoryItem | null>(null)
  const [editForm, setEditForm]               = useState({ quantity:'', minThreshold:'', expiryDate:'' })
  const [formError, setFormError]             = useState<string | null>(null)
  const [similarCandidates, setSimilarCandidates] = useState<Array<{ productId: string; score: number; signals: string[]; product: { id: string; name?: string; nameAr?: string; manufacturer?: string; strength?: string; dosageForm?: string; barcode?: string } }> | null>(null)
  const [expandedItemId, setExpandedItemId]   = useState<string | null>(null)
  const [editBatch, setEditBatch]             = useState<BatchRow | null>(null)
  const [deleteBatch, setDeleteBatch]         = useState<BatchRow | null>(null)
  const [requestItem, setRequestItem]         = useState<InventoryItem | null>(null)
  const [linkItem, setLinkItem]               = useState<InventoryItem | null>(null)
  const [showAIWizard, setShowAIWizard]       = useState(false)
  // Async catalog-matching: holds the id of the currently-running ImportBatch
  // so the ImportProgressToast can poll progress and show counters. Cleared
  // when the user dismisses the toast. Persisted across page reloads via
  // localStorage so the user always sees in-flight work.
  const [activeBatchId, setActiveBatchId]     = useState<string | null>(null)

  // Restore a running batch on first mount — handles browser refresh during
  // long imports. Validates via API; if the batch is already terminal we
  // silently clear it (the notification bell will surface the result).
  useEffect(() => {
    const remembered = getRememberedBatch()
    if (!remembered) return
    importsApi.get(remembered)
      .then(b => {
        if (b.status === 'queued' || b.status === 'matching') {
          setActiveBatchId(b.id)
        } else {
          rememberActiveBatch(null)
        }
      })
      .catch(() => rememberActiveBatch(null))
  }, [])

  // React to deep-links from notifications / toast CTA, e.g.
  //   /pharmacy/inventory?linkStatus=suggested&batchId=...
  // Sets the appropriate stat filter so the user lands directly on the rows
  // that need their attention. Runs on every URL change.
  useEffect(() => {
    const linkStatus = searchParams.get('linkStatus')
    const batchId = searchParams.get('batchId')
    if (linkStatus === 'suggested' || linkStatus === 'unlinked') {
      setStatFilter('review')
    } else if (linkStatus === 'linked' || linkStatus === 'all') {
      setStatFilter('all')
    }
    if (batchId) {
      // resume showing the toast for this batch (in case worker is still running)
      setActiveBatchId(prev => prev ?? batchId)
    }
    // We intentionally only run on searchParams changes — not on filter state
  }, [searchParams])
  // Close menu when clicking outside or scrolling/resizing
  useEffect(() => {
    if (!openMenu) return
    const close = () => setOpenMenu(null)
    document.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [openMenu])

  // Data
  const { data: inventoryData, isLoading } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.getAll().then(r => r.data) })
  const { data: productsData }             = useQuery({ queryKey: ['products'],   queryFn: () => inventoryApi.getProducts().then(r => r.data) })

  const inventory: InventoryItem[] = inventoryData || []
  const products: Product[]        = (productsData as any)?.data ?? productsData ?? []

  // Mutations
  const addMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); setShowAdd(false); setFormError(null) },
    onError: (err: any) => setFormError(err?.response?.data?.message || t('errors.server_error')),
  })
  const createMutation = useMutation({
    mutationFn: async ({ productData, inventoryData }: { productData: any; inventoryData: any }) => {
      const res = await inventoryApi.createProduct(productData)
      return inventoryApi.create({ productId: res.data.id, ...inventoryData })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); setShowAdd(false); setFormError(null); setSimilarCandidates(null) },
    onError: (err: any) => {
      const data = err?.response?.data
      // Backend pre-creation similarity gate — surface candidates so the user
      // can pick an existing product instead of duplicating the catalog.
      if (err?.response?.status === 409 && data?.code === 'SIMILAR_PRODUCT_EXISTS' && Array.isArray(data?.candidates)) {
        setSimilarCandidates(data.candidates)
        setFormError(data.message || 'يوجد منتج مشابه بالفعل')
        return
      }
      setSimilarCandidates(null)
      setFormError(data?.message || t('errors.server_error'))
    },
  })
  const forceCreateMutation = useMutation({
    mutationFn: async ({ productData, inventoryData }: { productData: any; inventoryData: any }) => {
      const res = await inventoryApi.createProduct({ ...productData, forceCreate: true })
      return inventoryApi.create({ productId: res.data.id, ...inventoryData })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); setShowAdd(false); setFormError(null); setSimilarCandidates(null) },
    onError: (err: any) => setFormError(err?.response?.data?.message || t('errors.server_error')),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => inventoryApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); setEditItem(null); setStockInItem(null); setStockOutItem(null); setAddBatchItem(null) },
    onError: (err: any) => setFormError(err?.response?.data?.message || t('errors.server_error')),
  })
  const addBatchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => inventoryApi.addBatch(id, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['batches'] })
      setAddBatchItem(null)
      setFormError(null)
    },
    onError: (err: any) => setFormError(err?.response?.data?.message || t('errors.server_error')),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })

  // Per-batch quick adjust (±1 from sub-row arrows + Stock In/Out modals)
  const adjustBatchMutation = useMutation({
    mutationFn: ({ batchId, delta, reason }: { batchId: string; delta: number; reason?: string }) =>
      inventoryApi.adjustBatch(batchId, { delta, reason }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['batches'] })
      setStockInItem(null)
      setStockOutItem(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'تعذّر تعديل الدفعة'
      // Use uploadToast surface for a quick non-blocking error notice
      setUploadToast({ error: true, message: msg })
    },
  })

  const updateBatchMutation = useMutation({
    mutationFn: ({ batchId, data }: { batchId: string; data: any }) =>
      inventoryApi.updateBatch(batchId, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['batches'] })
      setEditBatch(null)
      setFormError(null)
    },
    onError: (err: any) =>
      setFormError(err?.response?.data?.message || 'تعذّر حفظ التعديلات'),
  })

  const deleteBatchMutation = useMutation({
    mutationFn: (batchId: string) =>
      inventoryApi.removeBatch(batchId).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['batches'] })
      setDeleteBatch(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'تعذّر حذف الدفعة'
      setUploadToast({ error: true, message: msg })
    },
  })

  const catalogRequestMutation = useMutation({
    mutationFn: (data: any) =>
      catalogRequestsApi.create(data).then(r => r.data),
    onSuccess: (req) => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['catalog-requests'] })
      setRequestItem(null)
      setFormError(null)
      setUploadToast({
        message: `تم إرسال الطلب — رقم التتبّع: ${req.trackingNumber}`,
      })
    },
    onError: (err: any) =>
      setFormError(err?.response?.data?.message || 'تعذّر إرسال الطلب'),
  })

  // Smart Link — enqueue an async tenant-wide rematch job. The server returns
  // a batchId immediately; the ImportProgressToast then polls live progress.
  const runMatchingMutation = useMutation({
    mutationFn: () => importsApi.runMatching(),
    onSuccess: (res) => {
      rememberActiveBatch(res.batchId)
      setActiveBatchId(res.batchId)
      setShowAIWizard(false)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'تعذّر تشغيل الذكاء الاصطناعي'
      setUploadToast({ error: true, message: msg })
      setShowAIWizard(false)
    },
  })

  // Computed stats
  const now = Date.now()
  const stats = {
    all:      inventory.length,
    low:      inventory.filter(i => i.quantity <= i.minThreshold).length,
    // Strictly future expiry (within 30 days, not yet past). Expired stock
    // is counted separately so it never hides inside "expiring soon".
    expiring: inventory.filter(i => i.expiryDate && daysUntilExpiry(i.expiryDate)! <= 30 && daysUntilExpiry(i.expiryDate)! >= 0).length,
    // Already past expiry — regulatory/patient-safety priority. Drugs in this
    // bucket must be quarantined and removed from any dispense workflow.
    expired:  inventory.filter(i => i.expiryDate && daysUntilExpiry(i.expiryDate)! < 0).length,
    dead:     inventory.filter(i => i.quantity > 0 && i.updatedAt && (now - new Date(i.updatedAt).getTime()) > 60 * 86400000).length,
    review:   inventory.filter(i => i.linkStatus === 'suggested' || i.linkStatus === 'unlinked').length,
  }

  // Filtered data
  const filtered = inventory.filter(item => {
    const q = search.toLowerCase()
    if (q && !(
      item.product?.name?.toLowerCase().includes(q) ||
      (item.product as any)?.nameAr?.includes(q) ||
      item.product?.barcode?.includes(q) ||
      (item.product as any)?.sku?.includes(q) ||
      item.batchNumber?.includes(q)
    )) return false

    if (statFilter === 'low'      && item.quantity > item.minThreshold) return false
    if (statFilter === 'expiring' && !(item.expiryDate && daysUntilExpiry(item.expiryDate)! <= 30 && daysUntilExpiry(item.expiryDate)! >= 0)) return false
    if (statFilter === 'expired'  && !(item.expiryDate && daysUntilExpiry(item.expiryDate)! < 0)) return false
    if (statFilter === 'dead'     && !((now - new Date(item.updatedAt).getTime()) > 60 * 86400000)) return false
    if (statFilter === 'review'   && !(item.linkStatus === 'suggested' || item.linkStatus === 'unlinked')) return false

    // Category
    if (filters.category && item.product?.category !== filters.category) return false

    // Location
    if (filters.location && item.location !== filters.location) return false

    // Stock range
    if (filters.stockRange && !inStockRange(item.quantity, filters.stockRange)) return false

    // Stock status
    if (filters.stockStatus === 'low' && !(item.quantity > 0 && item.quantity <= item.minThreshold)) return false
    if (filters.stockStatus === 'in'  && !(item.quantity > item.minThreshold)) return false
    if (filters.stockStatus === 'out' && item.quantity !== 0) return false

    // Expiry within N days
    if (filters.expiryStatus) {
      const limit = Number(filters.expiryStatus)
      const d = item.expiryDate ? daysUntilExpiry(item.expiryDate) : null
      if (d === null || d < 0 || d > limit) return false
    }

    // Movement (based on updatedAt recency)
    if (filters.movement) {
      if (movementBucket(item.updatedAt) !== filters.movement) return false
    }

    // Composite status filter
    if (filters.status) {
      const days = item.expiryDate ? daysUntilExpiry(item.expiryDate) : null
      const isExpired      = days !== null && days < 0
      const isExpiringSoon = days !== null && days >= 0 && days <= 30
      const isLowStock     = item.quantity > 0 && item.quantity <= item.minThreshold
      const itemStatus = (item as any).status as string | undefined
      switch (filters.status) {
        case 'expired':       if (!isExpired)      return false; break
        case 'expiring_soon': if (!isExpiringSoon) return false; break
        case 'low_stock':     if (!isLowStock)     return false; break
        // Backend-driven statuses — match against item.status when present.
        case 'inactive':
        case 'draft':
        case 'received':
        case 'pending':
        case 'store_draft':
        case 'cancelled':
        case 'completed':
        case 'refund':
          if (itemStatus !== filters.status) return false
          break
      }
    }

    return true
  })

  // Categories: preset list + any user-defined values found in data
  const categories = useMemo(() => {
    const fromData = inventory.map(i => i.product?.category).filter(Boolean) as string[]
    return Array.from(new Set([...PRESET_CATEGORIES, ...fromData]))
  }, [inventory])

  const hasActiveFilters = Object.values(filters).some(Boolean)
  const activeFiltersCount = Object.values(filters).filter(Boolean).length

  // Export
  const doExport = () => {
    const header = 'الكود,المنتج (EN),المنتج (AR),الفئة,الدفعة,تاريخ الانتهاء,الكمية,الحد الأدنى,التكلفة,سعر البيع,الموقع'
    const rows = filtered.map(i => [
      (i.product as any)?.sku || '',
      i.product?.name || '',
      (i.product as any)?.nameAr || '',
      i.product?.category || '',
      i.batchNumber || '',
      i.expiryDate ? new Date(i.expiryDate).toLocaleDateString('ar-SA') : '',
      i.quantity,
      i.minThreshold,
      i.costPrice || '',
      i.sellingPrice || '',
      i.location || 'Main Warehouse',
    ].join(','))
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'inventory-export.csv'; a.click()
    setShowExport(false)
  }

  if (isLoading) return <FullPageSpinner />

  const sharedAddProps = {
    products, onClose: () => { setShowAdd(false); setFormError(null); setSimilarCandidates(null) },
    onBrowseAdd: (pid: string, qty: number, thr: number, exp?: string) => addMutation.mutate({ productId:pid, quantity:qty, minThreshold:thr, expiryDate:exp }),
    onCreate: (pd: any, inv: any) => createMutation.mutate({ productData:pd, inventoryData:inv }),
    isBrowsePending: addMutation.isPending, isCreatePending: createMutation.isPending || forceCreateMutation.isPending, error: formError,
    similarCandidates,
    onUseCandidate: (pid: string, qty: number, thr: number, exp?: string) => addMutation.mutate({ productId: pid, quantity: qty, minThreshold: thr, expiryDate: exp }),
    onForceCreate: (pd: any, inv: any) => forceCreateMutation.mutate({ productData: pd, inventoryData: inv }),
    onDismissSimilar: () => setSimilarCandidates(null),
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (inventory.length === 0) {
    return (
      <>
        {uploadToast && <UploadToast stats={uploadToast} onDismiss={() => setUploadToast(null)} />}
        <InventorySetupLanding onBulkUpload={() => setShowBulkUpload(true)} onAddManually={() => { setShowAdd(true); setFormError(null) }} />
        <Modal isOpen={showBulkUpload} onClose={() => setShowBulkUpload(false)} title={t('inventory.upload.title')} size="lg">
          <BulkUploadModal onClose={() => setShowBulkUpload(false)} onEnqueued={(batchId) => setActiveBatchId(batchId)} />
        </Modal>
        <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title={t('inventory.add.title')} size="lg">
          <AddProductModal {...sharedAddProps} />
        </Modal>
        {activeBatchId && (
          <ImportProgressToast batchId={activeBatchId} onDismiss={() => setActiveBatchId(null)} />
        )}
      </>
    )
  }

  // ── Populated state ──────────────────────────────────────────────────────────
  const STAT_CARDS = [
    { key:'all' as StatFilter,      label:'كل المنتجات',     count: stats.all,      desc:'عرض جميع المنتجات المتاحة في المخزون',    color:'teal'   },
    { key:'review' as StatFilter,   label:'بحاجة مراجعة',    count: stats.review,   desc:'اقتراحات الذكاء الاصطناعي ومنتجات بلا ربط بالكتالوج', color:'violet' },
    { key:'expired' as StatFilter,  label:'منتهية الصلاحية', count: stats.expired,  desc:'⚠ منتجات تجاوزت تاريخ الصلاحية — يجب عزلها فوراً ومنع الصرف', color:'crimson' },
    { key:'expiring' as StatFilter, label:'تنتهي قريباً',    count: stats.expiring, desc:'دفعات تقترب من تاريخ الانتهاء وتحتاج إلى إجراء سريع', color:'orange' },
    { key:'low' as StatFilter,      label:'مخزون منخفض',    count: stats.low,      desc:'منتجات أوشكت على النفاد وتحتاج إلى إعادة تعبئة',   color:'red'    },
    { key:'dead' as StatFilter,     label:'منتجات راكدة',    count: stats.dead,     desc:'منتجات لم تتحرك منذ فترة وتحتاج إلى متابعة', color:'gray'   },
  ] as const

  const colorMap = {
    teal:    { card: statFilter==='all'      ? 'border-teal-400 bg-teal-50'   : 'border-gray-200 hover:border-teal-300', count: 'text-teal-700',   icon: 'bg-teal-100 text-teal-600' },
    violet:  { card: statFilter==='review'   ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-300', count: 'text-violet-700', icon: 'bg-violet-100 text-violet-500' },
    gray:    { card: statFilter==='dead'     ? 'border-gray-400 bg-gray-50'   : 'border-gray-200 hover:border-gray-300', count: 'text-gray-700',   icon: 'bg-gray-100 text-gray-500' },
    orange:  { card: statFilter==='expiring' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-300', count: 'text-orange-600', icon: 'bg-orange-100 text-orange-500' },
    red:     { card: statFilter==='low'      ? 'border-red-400 bg-red-50'     : 'border-gray-200 hover:border-red-300', count: 'text-red-600',    icon: 'bg-red-100 text-red-500' },
    // Crimson = already-expired stock. Deliberately darker than `red` (low
    // stock) so the user instantly distinguishes "need to reorder" from
    // "must quarantine" — a regulatory + patient-safety priority.
    crimson: { card: statFilter==='expired'  ? 'border-rose-500 bg-rose-50 ring-1 ring-rose-300' : 'border-rose-200 hover:border-rose-400', count: 'text-rose-700',   icon: 'bg-rose-100 text-rose-600' },
  }

  return (
    <>
      {uploadToast && <UploadToast stats={uploadToast} onDismiss={() => setUploadToast(null)} />}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">لوحة المخزون</h1>
            <p className="text-sm text-gray-500 mt-0.5">راقب المنتجات والدفعات وحركات المخزون من مكان واحد.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAIWizard(true)}
              disabled={runMatchingMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 shadow-sm"
              title="مطابقة جميع منتجات المخزون مع الكتالوج تلقائياً">
              <Sparkles size={15} />
              مطابقة ذكية
            </button>
            <button onClick={() => setShowExport(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50">
              <Upload size={15} />تصدير
            </button>
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-2 px-4 py-2 border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 text-sm font-medium rounded-xl"
              title="رفع ملف Excel أو CSV لإضافة منتجات بالجملة">
              <FileSpreadsheet size={15} />رفع ملف
            </button>
            <button
              onClick={() => { setShowAdd(true); setFormError(null) }}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-xl shadow-sm">
              <Plus size={15} />منتج جديد
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {STAT_CARDS.map(card => {
            const c = colorMap[card.color]
            return (
              <button key={card.key} onClick={() => setStatFilter(card.key)}
                className={`text-start p-4 bg-white rounded-2xl border-2 transition-all ${c.card}`}>
                <p className={`text-3xl font-bold mb-1 ${c.count}`}>{card.count}</p>
                <p className="font-semibold text-gray-800 text-sm">{card.label}</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{card.desc}</p>
              </button>
            )
          })}
        </div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="ابحث بالاسم، المعرف، الباركود، الدفعة..." value={search} onChange={e => setSearch(e.target.value)}
              className="ps-9 pe-4 py-2.5 w-full text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500" />
            {search && <button onClick={() => setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border transition-colors ${showFilters || hasActiveFilters ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            <Filter size={15} />الفلاتر
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-teal-600 text-white text-[11px] font-bold">{activeFiltersCount}</span>
            )}
            <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          {hasActiveFilters && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-xl hover:bg-red-50">
              <X size={12} />إعادة تعيين
            </button>
          )}
          <p className="text-sm text-gray-400 ms-auto">عرض {filtered.length} من {inventory.length}</p>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Category */}
            <div>
              <label className={LABEL}>الفئة</label>
              <select value={filters.category} onChange={e => setFilters(p => ({ ...p, category: e.target.value }))} className={SELECT}>
                <option value="">الكل</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Stock range */}
            <div>
              <label className={LABEL}>المخزون</label>
              <select value={filters.stockRange} onChange={e => setFilters(p => ({ ...p, stockRange: e.target.value as Filters['stockRange'] }))} className={SELECT}>
                <option value="">الكل</option>
                {STOCK_RANGE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Stock status */}
            <div>
              <label className={LABEL}>حالة المخزون</label>
              <select value={filters.stockStatus} onChange={e => setFilters(p => ({ ...p, stockStatus: e.target.value as Filters['stockStatus'] }))} className={SELECT}>
                <option value="">الكل</option>
                {STOCK_STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Expiry status */}
            <div>
              <label className={LABEL}>حالة انتهاء الصلاحية</label>
              <select value={filters.expiryStatus} onChange={e => setFilters(p => ({ ...p, expiryStatus: e.target.value as Filters['expiryStatus'] }))} className={SELECT}>
                <option value="">الكل</option>
                {EXPIRY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Movement */}
            <div>
              <label className={LABEL}>منذ آخر بيع</label>
              <select value={filters.movement} onChange={e => setFilters(p => ({ ...p, movement: e.target.value as Filters['movement'] }))} className={SELECT}>
                <option value="">الكل</option>
                {MOVEMENT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Composite status */}
            <div>
              <label className={LABEL}>الحالة</label>
              <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value as Filters['status'] }))} className={SELECT}>
                <option value="">جميع الحالات</option>
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Location */}
            <div>
              <label className={LABEL}>الموقع</label>
              <select value={filters.location} onChange={e => setFilters(p => ({ ...p, location: e.target.value }))} className={SELECT}>
                <option value="">الكل</option>
                <option value="Main Warehouse">المستودع الرئيسي</option>
                <option value="Cold Storage">التخزين البارد</option>
              </select>
            </div>

            {/* Reset */}
            <div className="flex items-end">
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="w-full px-4 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">إعادة تعيين الفلاتر</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-10 px-2 py-3"></th>
                {['الكود','معلومات المنتج','الدفعة والانتهاء','الكمية','متوسط التكلفة','سعر البيع','الموقع','الحالة','الإجراءات'].map(h => (
                  <th key={h} className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-16 text-gray-400">
                  <Package size={32} className="mx-auto mb-3 opacity-30" />
                  <p>لا توجد أصناف مطابقة للبحث أو الفلاتر المختارة</p>
                </td></tr>
              ) : filtered.map(item => {
                const exp = expiryLabel(item)
                const isLow = item.quantity <= item.minThreshold
                const isExpanded = expandedItemId === item.id
                return (
                  <Fragment key={item.id}>
                  <tr
                    onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? 'bg-teal-50/30' : ''}`}>
                    {/* Expand chevron */}
                    <td className="px-2 py-3 w-10 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedItemId(isExpanded ? null : item.id) }}
                        title={isExpanded ? 'إخفاء الدفعات' : 'عرض الدفعات'}
                        className={`p-1.5 rounded-lg transition-all ${isExpanded ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-teal-600 hover:bg-teal-50'}`}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </td>
                    {/* Code */}
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {(item.product as any)?.sku || item.id.slice(0,8)}
                    </td>
                    {/* Product info */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[160px]">{item.product?.name}</p>
                      {(item.product as any)?.nameAr && <p className="text-xs text-gray-400 mt-0.5">{(item.product as any).nameAr}</p>}
                      {item.product?.barcode && <p className="text-xs text-gray-300 font-mono">{item.product.barcode}</p>}
                    </td>
                    {/* Batch + expiry */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.batchNumber ? <p className="text-xs font-medium text-teal-700">{item.batchNumber}</p> : <p className="text-xs text-gray-300">—</p>}
                      {item.expiryDate && <p className="text-xs text-gray-400">{new Date(item.expiryDate).toLocaleDateString('ar-SA')}</p>}
                    </td>
                    {/* Quantity */}
                    <td className="px-4 py-3">
                      <span className={`font-bold text-base ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{item.quantity}</span>
                      {isLow && <p className="text-xs text-red-400">دون الحد ({item.minThreshold})</p>}
                    </td>
                    {/* Cost */}
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {item.costPrice ? `${Number(item.costPrice).toFixed(2)} ر.س` : '—'}
                    </td>
                    {/* Selling price */}
                    <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                      {item.sellingPrice ? `${Number(item.sellingPrice).toFixed(2)} ر.س` : '—'}
                    </td>
                    {/* Location */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{item.location || 'Main Warehouse'}</td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        {/* Lifecycle status (single chip) */}
                        {exp ? (
                          <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-md border ${exp.color}`}>{exp.label}</span>
                        ) : isLow ? (
                          <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200">منخفض</span>
                        ) : (
                          <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">جيد</span>
                        )}

                        {/* Catalog link status — clickable to open AI matching modal */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setLinkItem(item) }}
                          title="إدارة الربط بالكتالوج المركزي"
                          className="group inline-flex items-center gap-1 hover:opacity-90 transition-opacity">
                          <LinkStatusBadge status={item.linkStatus} score={item.matchScore} />
                          {(item.linkStatus === 'unlinked' || item.linkStatus === 'suggested') && (
                            <Sparkles size={10} className="text-violet-500 group-hover:text-violet-700 animate-pulse" />
                          )}
                        </button>
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {/* ... menu */}
                        <div className="relative">
                          <button onClick={e => {
                              e.stopPropagation()
                              if (openMenu?.id === item.id) {
                                setOpenMenu(null)
                              } else {
                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                setOpenMenu({ id: item.id, rect })
                              }
                            }}
                            title="المزيد"
                            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg">
                            <MoreHorizontal size={15} />
                          </button>
                          {openMenu?.id === item.id && <RowMenu item={item} anchor={openMenu.rect} onClose={() => setOpenMenu(null)} />}
                        </div>
                        {/* Add batch */}
                        <button onClick={() => setAddBatchItem(item)} title="إضافة دفعة جديدة"
                          className="p-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors">
                          <Layers size={15} />
                        </button>
                        {/* Edit */}
                        <button onClick={() => { setEditItem(item); setEditForm({ quantity:String(item.quantity), minThreshold:String(item.minThreshold), expiryDate:item.expiryDate||'' }); setFormError(null) }}
                          title="تعديل"
                          className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil size={15} />
                        </button>
                        {/* Stock In ↓ (green = increase) */}
                        <button onClick={() => setStockInItem(item)} title="إدخال مخزون"
                          className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition-colors">
                          <ArrowDown size={15} />
                        </button>
                        {/* Stock Out ↑ (red = decrease) */}
                        <button onClick={() => setStockOutItem(item)} title="إخراج مخزون"
                          className="p-1.5 text-red-600 hover:text-white hover:bg-red-600 rounded-lg transition-colors">
                          <ArrowUp size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <BatchesSubRow
                      inventoryId={item.id}
                      currency="ر.س"
                      colSpan={10}
                      onAdjust={(b, delta) =>
                        adjustBatchMutation.mutate({ batchId: b.id, delta })
                      }
                      onEdit={(b) => { setEditBatch(b); setFormError(null) }}
                      onDelete={(b) => setDeleteBatch(b)}
                    />
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={showBulkUpload} onClose={() => setShowBulkUpload(false)} title={t('inventory.upload.title')} size="lg">
        <BulkUploadModal onClose={() => setShowBulkUpload(false)} onEnqueued={(batchId) => setActiveBatchId(batchId)} />
      </Modal>

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setFormError(null); setSimilarCandidates(null) }} title={t('inventory.add.title')} size="lg">
        <AddProductModal {...sharedAddProps} />
      </Modal>

      <Modal isOpen={showExport} onClose={() => setShowExport(false)} title="تصدير المخزون">
        <ExportConfirm count={filtered.length} onConfirm={doExport} onCancel={() => setShowExport(false)} />
      </Modal>

      <Modal isOpen={!!addBatchItem} onClose={() => setAddBatchItem(null)} title="إدخال دفعة جديدة">
        {addBatchItem && (
          <AddBatchModal item={addBatchItem} isPending={addBatchMutation.isPending} error={formError}
            onClose={() => { setAddBatchItem(null); setFormError(null) }}
            onSave={(data) => {
              if (!data.batchNumber?.trim()) { setFormError('رقم الدفعة مطلوب'); return }
              const qty = Number(data.quantity)
              if (!qty || qty < 1)            { setFormError('الكمية يجب أن تكون أكبر من صفر'); return }
              addBatchMutation.mutate({ id: addBatchItem.id, data: {
                batchNumber:  data.batchNumber.trim(),
                quantity:     qty,
                expiryDate:   data.expiryDate || undefined,
                location:     data.location,
                costPerUnit:  data.costPrice    ? Number(data.costPrice)    : undefined,
                sellingPrice: data.sellingPrice ? Number(data.sellingPrice) : undefined,
                notes:        data.notes?.trim() || undefined,
              }})
            }}
          />
        )}
      </Modal>

      <Modal isOpen={!!editBatch} onClose={() => { setEditBatch(null); setFormError(null) }} title="تعديل بيانات الدفعة">
        {editBatch && (
          <EditBatchModal
            batch={editBatch}
            isPending={updateBatchMutation.isPending}
            error={formError}
            onClose={() => { setEditBatch(null); setFormError(null) }}
            onSave={(data) => updateBatchMutation.mutate({ batchId: editBatch.id, data })}
          />
        )}
      </Modal>

      <Modal isOpen={!!deleteBatch} onClose={() => setDeleteBatch(null)} title="حذف الدفعة">
        {deleteBatch && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
              <AlertCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm text-red-700">
                <p className="font-semibold">سيتم وضع علامة «منتهية» على هذه الدفعة وتصفير كميتها.</p>
                <p className="text-xs mt-1 text-red-600/80">
                  الدفعة: <span className="font-mono">{deleteBatch.batchNumber || '—'}</span> · الكمية الحالية: {deleteBatch.quantity}
                </p>
              </div>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setDeleteBatch(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">إلغاء</button>
              <button
                onClick={() => deleteBatchMutation.mutate(deleteBatch.id)}
                disabled={deleteBatchMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl">
                {deleteBatchMutation.isPending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Trash2 size={14} />}
                تأكيد الحذف
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!stockInItem} onClose={() => setStockInItem(null)} title="إدخال مخزون">
        {stockInItem && (
          <StockInModal item={stockInItem} isPending={adjustBatchMutation.isPending}
            onClose={() => setStockInItem(null)}
            onSave={({ batchId, qty, notes }) =>
              adjustBatchMutation.mutate({ batchId, delta: qty, reason: notes || 'إدخال مخزون' })}
          />
        )}
      </Modal>

      <Modal isOpen={!!stockOutItem} onClose={() => setStockOutItem(null)} title="إخراج مخزون">
        {stockOutItem && (
          <StockOutModal item={stockOutItem} isPending={adjustBatchMutation.isPending}
            onClose={() => setStockOutItem(null)}
            onSave={({ batchId, qty, notes }) =>
              adjustBatchMutation.mutate({ batchId, delta: -qty, reason: notes || 'إخراج مخزون' })}
          />
        )}
      </Modal>

      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title={t('inventory.edit_title')}>
        {editItem && (
          <form onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id: editItem.id, data: { quantity:Number(editForm.quantity), minThreshold:Number(editForm.minThreshold), expiryDate:editForm.expiryDate||undefined } }) }} className="space-y-4">
            {formError && <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex gap-2 text-sm text-red-700"><AlertCircle size={14} className="mt-0.5 shrink-0" />{formError}</div>}
            <p className="text-sm font-semibold text-gray-800">{editItem.product?.name}</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>{t('inventory.quantity')}</label><input type="number" min={0} required value={editForm.quantity} onChange={e => setEditForm({...editForm, quantity:e.target.value})} className={INPUT} /></div>
              <div><label className={LABEL}>{t('inventory.threshold')}</label><input type="number" min={0} required value={editForm.minThreshold} onChange={e => setEditForm({...editForm, minThreshold:e.target.value})} className={INPUT} /></div>
            </div>
            <div><label className={LABEL}>{t('inventory.expiry')}</label><input type="date" value={editForm.expiryDate} onChange={e => setEditForm({...editForm, expiryDate:e.target.value})} className={INPUT} /></div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditItem(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">{t('common.cancel')}</button>
              <button type="submit" disabled={updateMutation.isPending} className="px-5 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl">
                {updateMutation.isPending ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {linkItem && (
        <ProductLinkModal
          item={linkItem}
          isOpen={!!linkItem}
          onClose={() => setLinkItem(null)}
          onSuccess={(message) => setUploadToast({ message })}
        />
      )}

      <AIMatchingWizard
        isOpen={showAIWizard}
        onClose={() => setShowAIWizard(false)}
        onConfirm={() => runMatchingMutation.mutate()}
        isPending={runMatchingMutation.isPending}
        unlinkedCount={inventory.filter(i => i.linkStatus === 'unlinked' || i.linkStatus === 'suggested').length}
      />

      <Modal isOpen={!!requestItem} onClose={() => { setRequestItem(null); setFormError(null) }} title="طلب إضافة منتج إلى الكتالوج">
        {requestItem && (
          <CatalogRequestModal
            item={requestItem}
            isPending={catalogRequestMutation.isPending}
            error={formError}
            onClose={() => { setRequestItem(null); setFormError(null) }}
            onSubmit={(payload) => catalogRequestMutation.mutate({
              inventoryItemId: requestItem.id,
              type: 'add',
              ...payload,
            })}
          />
        )}
      </Modal>

      {/* Sticky live-progress toast for any in-flight import / Smart Link.
          Persists across navigations within the inventory page and across
          page reloads (via localStorage). Auto-disappears 6 s after a
          terminal status (completed/failed/cancelled) is acknowledged. */}
      {activeBatchId && (
        <ImportProgressToast
          batchId={activeBatchId}
          onDismiss={() => setActiveBatchId(null)}
        />
      )}
    </>
  )
}
