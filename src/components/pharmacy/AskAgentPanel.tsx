import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Send,
  CheckCircle2,
  AlertCircle,
  ShoppingCart,
  Loader2,
  Lightbulb,
  Plus,
  Minus,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import {
  procurementApi,
  type AskPreview,
  type AskResolvedLine,
} from '../../api/procurement.api';

interface AskAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const EXAMPLES = [
  '50 أوجمنتين 1جم، 30 بانادول إكسترا، 20 فولتارين',
  '50 augmentin 1g + 30 panadol extra',
  '100 paracetamol 500mg و50 amoxicillin 250mg',
];

/**
 * Conversational procurement intake — pharmacist types free text in
 * Arabic or English, system parses it, resolves products, runs the
 * Decision Engine per line, then lets the user accept and bulk-add.
 */
export function AskAgentPanel({ isOpen, onClose }: AskAgentPanelProps) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<AskPreview | null>(null);
  // Map<rawLineIndex, qty> — user can edit qty before applying.
  const [qtyOverrides, setQtyOverrides] = useState<Record<number, number>>({});
  // Set<rawLineIndex> — items the user de-selected.
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [applied, setApplied] = useState<{ added: number; skipped: number } | null>(null);

  const previewMutation = useMutation({
    mutationFn: (t: string) => procurementApi.askAgent(t),
    onSuccess: (data) => {
      setPreview(data);
      setQtyOverrides({});
      setSkipped(new Set());
      setApplied(null);
    },
  });

  const applyMutation = useMutation({
    mutationFn: (items: Array<{ productId: string; qty: number }>) =>
      procurementApi.applyAskAgent(items),
    onSuccess: (result) => {
      setApplied({ added: result.added, skipped: result.skipped.length });
      qc.invalidateQueries({ queryKey: ['procurement-cart'] });
      qc.invalidateQueries({ queryKey: ['procurement-queue'] });
    },
  });

  const reset = () => {
    setText('');
    setPreview(null);
    setQtyOverrides({});
    setSkipped(new Set());
    setApplied(null);
    previewMutation.reset();
    applyMutation.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;
    previewMutation.mutate(trimmed);
  };

  // Items eligible for "add all" — matched, not skipped.
  const selectable = (preview?.items ?? [])
    .map((item, idx) => ({ item, idx }))
    .filter(({ item, idx }) => item.match && !skipped.has(idx));

  const selectedCount = selectable.length;
  const selectedTotalCost = selectable.reduce(
    (s, { item, idx }) => {
      const qty = qtyOverrides[idx] ?? item.qty;
      const planUnit = item.plan ? item.plan.totalCost / Math.max(1, item.qty) : 0;
      return s + planUnit * qty;
    },
    0,
  );

  const handleApply = () => {
    const items = selectable.map(({ item, idx }) => ({
      productId: item.match!.productId,
      qty: qtyOverrides[idx] ?? item.qty,
    }));
    if (items.length === 0) return;
    applyMutation.mutate(items);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="" size="xl">
      <div className="-m-6">
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-t-xl bg-gradient-to-br from-violet-50 via-white to-emerald-50 px-6 pt-6 pb-5 border-b border-gray-100">
          <div className="absolute -top-16 -end-16 w-48 h-48 rounded-full bg-violet-200/40 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -start-12 w-40 h-40 rounded-full bg-emerald-200/40 blur-3xl pointer-events-none" />

          <div className="relative flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
              <Sparkles size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold mb-1">
                <Sparkles size={11} />
                المساعد الذكي
              </div>
              <h2 className="text-xl font-bold text-gray-900">اطلب الأدوية بالكلام</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                اكتب ما تحتاجه بأسلوبك الطبيعي — النظام سيتعرف على كل دواء، يحدد أفضل مورد، ويُجهّز الخطة لك في ثوانٍ.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="إغلاق"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="p-6 space-y-5">
          {/* Input area — always visible */}
          {!applied && (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-700">
                ماذا تحتاج اليوم؟
              </label>
              <textarea
                dir="auto"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder={EXAMPLES[0]}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none resize-y text-sm leading-relaxed transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                }}
              />

              {/* Example chips */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Lightbulb size={12} /> أمثلة:
                </span>
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setText(ex)}
                    className="px-2.5 py-1 text-xs rounded-full bg-gray-50 border border-gray-200 text-gray-600 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-400">
                  اضغط Ctrl+Enter للإرسال السريع
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={previewMutation.isPending || text.trim().length < 2}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 text-white text-sm font-semibold shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {previewMutation.isPending ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      جارٍ التحليل…
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      حلّل واقترح خطة
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {previewMutation.isError && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">تعذّر تحليل النص</p>
                <p className="text-red-700/80 mt-0.5">
                  {(previewMutation.error as any)?.response?.data?.message ??
                    'حدث خطأ أثناء معالجة طلبك — جرّب صياغة أبسط أو تأكد من الاتصال.'}
                </p>
              </div>
            </div>
          )}

          {/* Success — applied */}
          {applied && (
            <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 p-6 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 mb-3">
                <CheckCircle2 size={28} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                تمت إضافة {applied.added} {applied.added === 1 ? 'صنف' : 'أصناف'} للسلة
              </h3>
              {applied.skipped > 0 && (
                <p className="text-sm text-amber-700 mt-1">
                  تخطّى النظام {applied.skipped} صنفاً (لا يوجد مورد متاح أو نفد المخزون).
                </p>
              )}
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 inline-flex items-center gap-2"
                >
                  <ShoppingCart size={15} />
                  افتح السلة
                </button>
                <button
                  onClick={reset}
                  className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
                >
                  أضف طلبية أخرى
                </button>
              </div>
            </div>
          )}

          {/* Preview — results */}
          {!applied && preview && (
            <>
              <PreviewHeader
                matched={preview.items.filter((i) => i.match).length}
                unmatched={preview.items.filter((i) => !i.match).length + preview.unparsable.length}
                totalCost={preview.totalCost}
              />

              {/* Result list */}
              <ul className="space-y-2.5">
                {preview.items.map((item, idx) => (
                  <ResolvedLineCard
                    key={`${item.raw}-${idx}`}
                    item={item}
                    qty={qtyOverrides[idx] ?? item.qty}
                    onQtyChange={(q) =>
                      setQtyOverrides((prev) => ({ ...prev, [idx]: q }))
                    }
                    skipped={skipped.has(idx)}
                    onToggleSkip={() =>
                      setSkipped((prev) => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        return next;
                      })
                    }
                  />
                ))}

                {preview.unparsable.map((line, i) => (
                  <li
                    key={`unparsable-${i}`}
                    className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm"
                  >
                    <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-amber-900 truncate">{line}</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        لم نتمكن من استخراج اسم دواء من هذا السطر — تجاهلناه.
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Apply bar */}
              {selectedCount > 0 && (
                <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-between gap-4">
                  <div className="text-sm">
                    <p className="font-semibold text-gray-900">
                      {selectedCount} {selectedCount === 1 ? 'صنف' : 'أصناف'} جاهزة للإضافة
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      الإجمالي التقديري: {Math.round(selectedTotalCost).toLocaleString('en-US')} جنيه
                    </p>
                  </div>
                  <button
                    onClick={handleApply}
                    disabled={applyMutation.isPending}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {applyMutation.isPending ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        جارٍ الإضافة…
                      </>
                    ) : (
                      <>
                        <ShoppingCart size={15} />
                        أضف الكل للسلة
                      </>
                    )}
                  </button>
                </div>
              )}

              {selectedCount === 0 && preview.items.length > 0 && (
                <div className="text-center text-sm text-gray-500 py-4">
                  لم تختر أي صنف بعد — استخدم زر «إضافة» على البطاقات أعلاه.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function PreviewHeader({
  matched,
  unmatched,
  totalCost,
}: {
  matched: number;
  unmatched: number;
  totalCost: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat
        label="تم التعرف"
        value={matched}
        accent="emerald"
        icon={<CheckCircle2 size={14} />}
      />
      <Stat
        label="لم يُعثر"
        value={unmatched}
        accent="amber"
        icon={<AlertCircle size={14} />}
      />
      <Stat
        label="الإجمالي التقديري"
        value={`${Math.round(totalCost).toLocaleString('en-US')} ج.م`}
        accent="violet"
        icon={<Sparkles size={14} />}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  accent: 'emerald' | 'amber' | 'violet';
  icon: React.ReactNode;
}) {
  const tones: Record<typeof accent, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    violet: 'bg-violet-50 border-violet-200 text-violet-900',
  } as const;
  const iconTones: Record<typeof accent, string> = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    violet: 'text-violet-600',
  } as const;

  return (
    <div className={clsx('rounded-xl border p-3', tones[accent])}>
      <div className={clsx('flex items-center gap-1.5 text-[11px] font-semibold', iconTones[accent])}>
        {icon}
        {label}
      </div>
      <div className="text-base font-bold mt-1">{value}</div>
    </div>
  );
}

function ResolvedLineCard({
  item,
  qty,
  onQtyChange,
  skipped,
  onToggleSkip,
}: {
  item: AskResolvedLine;
  qty: number;
  onQtyChange: (q: number) => void;
  skipped: boolean;
  onToggleSkip: () => void;
}) {
  const hasMatch = !!item.match;
  const matched = item.match;

  return (
    <li
      className={clsx(
        'rounded-xl border p-3.5 transition-all',
        !hasMatch
          ? 'bg-rose-50/40 border-rose-200'
          : skipped
            ? 'bg-gray-50 border-gray-200 opacity-60'
            : 'bg-white border-gray-200 hover:border-emerald-300 hover:shadow-sm',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Confidence indicator */}
        <div className="shrink-0">
          {!hasMatch ? (
            <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertCircle size={16} />
            </div>
          ) : (
            <ConfidenceDot confidence={matched!.confidence} />
          )}
        </div>

        {/* Match details */}
        <div className="flex-1 min-w-0">
          {hasMatch ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 truncate">
                  {matched!.nameAr || matched!.name}
                </span>
                {matched!.strength && (
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px] font-medium">
                    {matched!.strength}
                  </span>
                )}
                {matched!.dosageForm && (
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px] font-medium">
                    {matched!.dosageForm}
                  </span>
                )}
                <ConfidenceBadge confidence={matched!.confidence} />
              </div>
              <p className="text-[12px] text-gray-500 mt-0.5">
                <span className="text-gray-400">طلبت:</span> «{item.raw}»
                {matched!.genericName && (
                  <>
                    <span className="mx-1.5 text-gray-300">•</span>
                    {matched!.genericName}
                  </>
                )}
              </p>
              {item.plan && (
                <div className="flex items-center gap-3 mt-2 text-[12px]">
                  <span className="text-gray-600">
                    <span className="font-semibold text-gray-900">
                      {Math.round(item.plan.totalCost / Math.max(1, item.qty) * qty).toLocaleString('en-US')}
                    </span>{' '}
                    <span className="text-gray-400">ج.م</span>
                  </span>
                  <span className="text-gray-300">•</span>
                  <span className="text-gray-600">
                    {item.plan.splits.length} {item.plan.splits.length === 1 ? 'مصدر' : 'مصادر'}
                  </span>
                  <span className="text-gray-300">•</span>
                  <RiskPill score={item.plan.riskScore} />
                </div>
              )}
              {!item.plan && (
                <p className="text-[12px] text-amber-700 mt-1.5">
                  ⚠️ لا توجد مصادر متاحة لهذا المنتج الآن — لن يُضاف للسلة.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="font-semibold text-gray-900">«{item.raw}»</p>
              <p className="text-[12px] text-rose-700 mt-0.5">
                لم يُعثر على منتج مطابق في الكتالوج — جرّب اسماً تجارياً مختلفاً أو
                <a
                  href="/pharmacy/catalog-requests"
                  className="underline text-rose-800 hover:text-rose-900 mx-1"
                >
                  اطلب إضافة المنتج
                </a>
                .
              </p>
            </>
          )}
        </div>

        {/* Qty stepper + actions */}
        <div className="shrink-0 flex flex-col items-end gap-2">
          {hasMatch && (
            <QtyStepper qty={qty} onChange={onQtyChange} disabled={skipped} />
          )}
          {hasMatch && item.plan && (
            <button
              onClick={onToggleSkip}
              className={clsx(
                'text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors',
                skipped
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-gray-50 text-gray-500 hover:bg-rose-50 hover:text-rose-700',
              )}
            >
              {skipped ? 'إعادة الإضافة' : 'تخطّي'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ConfidenceDot({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const tones = {
    high: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-gray-100 text-gray-500',
  } as const;
  return (
    <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', tones[confidence])}>
      <CheckCircle2 size={16} />
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const meta = {
    high: { label: 'تطابق عالي', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    medium: { label: 'تطابق جزئي', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
    low: { label: 'تطابق ضعيف — راجع', tone: 'bg-gray-50 text-gray-600 border-gray-200' },
  } as const;
  const { label, tone } = meta[confidence];
  return (
    <span className={clsx('px-1.5 py-0.5 rounded border text-[10px] font-semibold', tone)}>
      {label}
    </span>
  );
}

function RiskPill({ score }: { score: number }) {
  const tone =
    score >= 70
      ? 'bg-rose-100 text-rose-700'
      : score >= 40
        ? 'bg-amber-100 text-amber-700'
        : 'bg-emerald-100 text-emerald-700';
  const label = score >= 70 ? 'خطر مرتفع' : score >= 40 ? 'خطر متوسط' : 'منخفض';
  return (
    <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold', tone)}>
      {label}
    </span>
  );
}

function QtyStepper({
  qty,
  onChange,
  disabled,
}: {
  qty: number;
  onChange: (q: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={clsx(
        'inline-flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden text-sm',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, qty - 1))}
        className="px-2 py-1 text-gray-500 hover:bg-gray-50"
        aria-label="إنقاص"
      >
        <Minus size={13} />
      </button>
      <input
        type="number"
        min={1}
        max={100000}
        value={qty}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (Number.isFinite(v) && v >= 1) onChange(Math.min(100000, v));
        }}
        className="w-12 text-center bg-transparent border-0 outline-none font-semibold text-gray-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(100000, qty + 1))}
        className="px-2 py-1 text-gray-500 hover:bg-gray-50"
        aria-label="زيادة"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
