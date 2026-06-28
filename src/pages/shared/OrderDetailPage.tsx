import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, MessageSquare, Send, CheckCircle, XCircle, AlertTriangle,
  Package, FileText, RotateCcw, PauseCircle, Download, Clock,
  Phone, Mail, MessageCircle, Truck, Tag, Receipt, Ban, Store, Building2,
} from 'lucide-react';
import clsx from 'clsx';
import { ordersApi } from '../../api/orders.api';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { getRoleFromToken } from '../../auth/oidc';

// ── Money helpers ─────────────────────────────────────────────────────────────

/** Localised currency label — backend stores 'SAR'/'EGP'; Egypt shows ج.م. */
function currencyLabel(code?: string): string {
  switch ((code ?? '').toUpperCase()) {
    case 'EGP': return 'ج.م';
    case 'SAR': return 'ر.س';
    case 'AED': return 'د.إ';
    case 'USD': return '$';
    default:    return code || 'ج.م';
  }
}
function fmtMoney(n: number | string | undefined): string {
  return new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n ?? 0));
}

// ── Cancel-order reasons (pharmacy) ───────────────────────────────────────────
// Radio list matching the agreed UX. "إلغاء الطلب" stays disabled until one is
// chosen; the selected reason is logged on the order (cancellationReason) and
// flows into the audit trail via the status-change event.
const CANCEL_REASONS: string[] = [
  'أريد إنشاء طلبية جديدة بناءً على طلبي',
  'أريد إنشاء طلبية بناءً على طلب الموزع',
  'الأصناف غير متوفرة',
  'الكميات غير متوفرة',
  'طلب مني الموزع الإلغاء',
  'المندوب طلب مني الإلغاء',
  'أخرى',
];


// ── Which actions are available per role × status ─────────────────────────────

// Complete action map — covers all 21 statuses per role
const PHARMACY_ACTIONS: Record<string, string[]> = {
  // Initiation
  draft:               ['submit'],
  pending_approval:    ['approve'],
  submitted:           [],           // waiting for supplier
  counter_offer:       ['accept_counter', 'reject_counter'],
  // Delivery flow
  shipped:             ['mark_received_qc', 'report_failed_delivery'],
  failed_delivery:     ['reschedule'],
  received_pending_qc: ['receive'],
  // Post-delivery
  delivered:           ['dispute', 'return'],
  partially_delivered: ['dispute', 'return'],
  disputed:            ['return', 'accept_as_delivered'],
  // Hold
  accepted:            ['hold'],
  on_hold:             ['release_hold'],
  // Returns
  return_approved:     [],
  return_in_transit:   [],
  return_received:     [],
  credit_issued:       [],
  cancelled:           [],
};

const SUPPLIER_ACTIONS: Record<string, string[]> = {
  submitted:           ['accept', 'back_order', 'counter_offer'],
  counter_offer:       ['accept'],
  accepted:            ['ship', 'back_order', 'hold'],
  back_ordered:        ['ship'],
  shipped:             [],           // pharmacy side takes it from here
  failed_delivery:     ['retry_delivery'],
  on_hold:             ['release_hold'],
  // Returns
  return_requested:    ['approve_return', 'reject_return'],
  return_in_transit:   ['mark_received'],
  return_received:     ['issue_credit'],
  // Terminals — no actions
  delivered:           [],
  partially_delivered: [],
  disputed:            [],
  credit_issued:       [],
  cancelled:           [],
};

function StatusTimeline({ history }: { history: any[] }) {
  if (!history?.length) return null;
  return (
    <div className="space-y-2">
      {history.map((entry: any, i: number) => (
        <div key={i} className="flex items-start gap-3 text-sm">
          <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
          <div>
            <span className="text-gray-500">{new Date(entry.at).toLocaleString('ar-EG')}</span>
            <span className="mx-1.5 text-gray-300">·</span>
            <Badge status={entry.from} className="mr-1" />
            <span className="text-gray-400 text-xs">→</span>
            <Badge status={entry.to} className="ml-1" />
            {entry.reason && <p className="text-gray-400 text-xs mt-0.5">{entry.reason}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReceiveModal({ orderId, items, onClose, onDone }: {
  orderId: string; items: any[]; onClose: () => void; onDone: () => void;
}) {
  const [receipts, setReceipts] = useState<Record<string, { accepted: number; rejected: number; reason: string }>>(
    Object.fromEntries(items.map((i: any) => [i.id, { accepted: i.quantity, rejected: 0, reason: '' }])),
  );
  const qc = useQueryClient();
  const confirm = useMutation({
    mutationFn: () => ordersApi.confirmReceipt(orderId, {
      items: items.map((i: any) => ({
        orderItemId:      i.id,
        quantityAccepted: receipts[i.id]?.accepted ?? i.quantity,
        quantityRejected: receipts[i.id]?.rejected ?? 0,
        rejectionReason:  receipts[i.id]?.reason || undefined,
      })),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order', orderId] }); onDone(); },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-gray-900">تأكيد الاستلام — فحص الجودة</h3>
        <p className="text-sm text-gray-500">أدخل الكمية المقبولة والمرفوضة لكل صنف بعد الفحص الفعلي.</p>

        {items.map((item: any) => (
          <div key={item.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="font-medium text-gray-900">{item.product?.name ?? item.productId}</p>
            <p className="text-xs text-gray-400">المطلوب: {item.quantity} وحدة</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">مقبول</label>
                <input type="number" min={0} max={item.quantity}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={receipts[item.id]?.accepted ?? item.quantity}
                  onChange={(e) => setReceipts((r) => ({ ...r, [item.id]: { ...r[item.id], accepted: Number(e.target.value) } }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">مرفوض</label>
                <input type="number" min={0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={receipts[item.id]?.rejected ?? 0}
                  onChange={(e) => setReceipts((r) => ({ ...r, [item.id]: { ...r[item.id], rejected: Number(e.target.value) } }))}
                />
              </div>
            </div>
            {(receipts[item.id]?.rejected ?? 0) > 0 && (
              <input placeholder="سبب الرفض (تلف، صنف خاطئ، ضرر…)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                value={receipts[item.id]?.reason ?? ''}
                onChange={(e) => setReceipts((r) => ({ ...r, [item.id]: { ...r[item.id], reason: e.target.value } }))}
              />
            )}
          </div>
        ))}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">إلغاء</button>
          <button onClick={() => confirm.mutate()} disabled={confirm.isPending}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            {confirm.isPending ? 'جارٍ التأكيد…' : 'تأكيد الاستلام'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cancel-order reason modal ─────────────────────────────────────────────────

function CancelReasonModal({ onClose, onConfirm, pending }: {
  onClose: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const isOther = choice === 'أخرى';
  const finalReason = isOther ? other.trim() : choice;
  const canSubmit = choice !== '' && (!isOther || other.trim().length >= 3);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-red-50 text-red-600"><Ban size={18} /></span>
          <div>
            <h3 className="font-bold text-gray-900 text-base">إلغاء الطلب</h3>
            <p className="text-xs text-gray-500">اختر سبب الإلغاء — سيُسجَّل على الطلب</p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-1.5 max-h-72 overflow-y-auto">
          {CANCEL_REASONS.map((r) => (
            <label
              key={r}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors',
                choice === r ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <input
                type="radio"
                name="cancel-reason"
                value={r}
                checked={choice === r}
                onChange={() => setChoice(r)}
                className="accent-red-600"
              />
              <span className="text-sm text-gray-800">{r}</span>
            </label>
          ))}
          {isOther && (
            <textarea
              autoFocus
              rows={2}
              placeholder="اكتب السبب…"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              className="w-full mt-1 border border-gray-300 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-3 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold text-sm rounded-xl transition-colors"
          >
            تراجع
          </button>
          <button
            onClick={() => onConfirm(finalReason)}
            disabled={!canSubmit || pending}
            className="flex-1 py-2.5 px-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-colors"
          >
            {pending ? 'جارٍ الإلغاء…' : 'إلغاء الطلب'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const role = getRoleFromToken(auth.user) ?? '';
  const qc = useQueryClient();

  const [comment, setComment] = useState('');
  const [showReceive, setShowReceive] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getOne(id!).then((r) => r.data),
    enabled: !!id,
  });

  const { data: comments = [] } = useQuery<any[]>({
    queryKey: ['order-comments', id],
    queryFn: () => ordersApi.getComments(id!).then((r) => r.data),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      ordersApi.updateStatus(id!, status, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      setPendingAction(null);
      setActionReason('');
      setShowCancel(false);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => ordersApi.approve(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', id] }),
  });

  const commentMutation = useMutation({
    mutationFn: () => ordersApi.addComment(id!, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-comments', id] });
      setComment('');
    },
  });

  if (isLoading || !order) return <Spinner />;

  const isPharmacy = role === 'pharmacy_admin';
  const isSupplier = role === 'supplier_admin';
  const actions = isPharmacy ? (PHARMACY_ACTIONS[order.status] ?? []) : (SUPPLIER_ACTIONS[order.status] ?? []);

  // Currency + financial breakdown (real backend fields — no fabrication)
  const cur = currencyLabel(order.currency);
  const vatPct = order.vatRate != null ? Math.round(Number(order.vatRate) * 100) : null;
  const subtotal = order.subtotalAmount != null
    ? Number(order.subtotalAmount)
    : (order.items ?? []).reduce((s: number, i: any) => s + Number(i.unitPrice) * i.quantity, 0);
  const contact = (order as any).supplierContact ?? null;

  // Pharmacy can cancel only before the supplier has acted on the order.
  const canCancel = isPharmacy && ['draft', 'pending_approval', 'submitted'].includes(order.status);

  // Direct-contact dispatch text (WhatsApp / email) — lets the pharmacist reach
  // the supplier outside the platform while the order is still being arranged.
  const dispatchBody = [
    `طلب شراء — رقم ${order.id.slice(0, 8).toUpperCase()}`,
    `التاريخ: ${new Date(order.createdAt).toLocaleDateString('ar-EG')}`,
    '',
    'الأصناف:',
    ...(order.items ?? []).map((i: any, idx: number) =>
      `${idx + 1}. ${i.product?.name ?? ''} × ${i.quantity} @ ${fmtMoney(i.unitPrice)} ${cur}`,
    ),
    '',
    `الإجمالي: ${fmtMoney(order.totalAmount)} ${cur}`,
  ].join('\n');
  const supplierName = order.supplierTenant?.name ?? 'المورد';
  const mailtoHref = contact?.email
    ? `mailto:${contact.email}?subject=${encodeURIComponent(`أمر شراء ${order.id.slice(0, 8).toUpperCase()}`)}&body=${encodeURIComponent(dispatchBody)}`
    : null;
  const whatsappHref = contact?.whatsapp
    ? `https://wa.me/${String(contact.whatsapp).replace(/[^\d]/g, '')}?text=${encodeURIComponent(dispatchBody)}`
    : null;
  const telHref = contact?.phone ? `tel:${contact.phone}` : null;

  const actionLabel: Record<string, { label: string; color: string; status?: string }> = {
    approve:              { label: t('order.actions.approve'),       color: 'green' },
    submit:               { label: t('order.actions.submit'),         color: 'blue',   status: 'submitted' },
    accept:               { label: t('order.actions.accept'),         color: 'green',  status: 'accepted' },
    ship:                 { label: t('order.actions.ship'),           color: 'purple', status: 'shipped' },
    back_order:           { label: t('order.actions.back_order'),     color: 'orange', status: 'back_ordered' },
    counter_offer:        { label: t('order.actions.counter_offer'),  color: 'orange', status: 'counter_offer' },
    accept_counter:       { label: 'قبول العرض المضاد',               color: 'green',  status: 'accepted' },
    reject_counter:       { label: 'رفض العرض المضاد',                color: 'red',    status: 'cancelled' },
    receive:              { label: t('order.actions.receive'),        color: 'blue' },
    mark_received_qc:     { label: 'تأكيد استلام البضاعة',            color: 'sky',    status: 'received_pending_qc' },
    report_failed_delivery:{ label: 'الإبلاغ عن فشل التسليم',          color: 'red',    status: 'failed_delivery' },
    reschedule:           { label: 'إعادة جدولة التسليم',             color: 'orange', status: 'shipped' },
    retry_delivery:       { label: 'إعادة محاولة التسليم',            color: 'blue',   status: 'shipped' },
    dispute:              { label: t('order.actions.dispute'),        color: 'red',    status: 'disputed' },
    accept_as_delivered:  { label: 'قبول كمُسلَّم',                   color: 'green',  status: 'delivered' },
    hold:                 { label: t('order.actions.hold'),           color: 'gray',   status: 'on_hold' },
    release_hold:         { label: t('order.actions.release_hold'),   color: 'blue',   status: 'accepted' },
    unhold:               { label: 'استئناف الطلب',                   color: 'blue',   status: 'accepted' },
    return:               { label: t('order.actions.return'),         color: 'orange' },
    approve_return:       { label: t('order.actions.approve_return'), color: 'green',  status: 'return_approved' },
    reject_return:        { label: 'رفض الإرجاع',                     color: 'red' },
    mark_received:        { label: 'تم استلام الإرجاع',               color: 'blue',   status: 'return_received' },
    issue_credit:         { label: t('order.actions.issue_credit'),   color: 'green',  status: 'credit_issued' },
  };

  const colorClass: Record<string, string> = {
    green:  'bg-green-600 hover:bg-green-700 text-white',
    blue:   'bg-blue-600 hover:bg-blue-700 text-white',
    sky:    'bg-sky-600 hover:bg-sky-700 text-white',
    purple: 'bg-purple-600 hover:bg-purple-700 text-white',
    orange: 'bg-orange-500 hover:bg-orange-600 text-white',
    red:    'bg-red-600 hover:bg-red-700 text-white',
    gray:   'bg-gray-500 hover:bg-gray-600 text-white',
  };

  const needsReason = ['dispute', 'hold', 'counter_offer', 'reject_return', 'back_order'];

  const handleAction = (action: string) => {
    if (action === 'approve')  { approveMutation.mutate(); return; }
    if (action === 'receive')  { setShowReceive(true); return; }
    if (needsReason.includes(action)) { setPendingAction(action); return; }
    const cfg = actionLabel[action];
    if (cfg?.status) statusMutation.mutate({ status: cfg.status });
  };

  const confirmAction = () => {
    if (!pendingAction) return;
    const cfg = actionLabel[pendingAction];
    if (cfg?.status) statusMutation.mutate({ status: cfg.status, reason: actionReason });
    else statusMutation.mutate({ status: pendingAction, reason: actionReason });
  };

  return (
    <div className="space-y-5 max-w-5xl" dir="rtl">
      {/* Hero header — matches the reports/catalog card style */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="flex items-start gap-4 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors shrink-0"
              aria-label="رجوع"
            >
              <ArrowLeft size={18} className="rtl:rotate-180" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">طلب #{order.id.slice(0, 8).toUpperCase()}</h1>
                <Badge status={order.status} />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(order.createdAt).toLocaleString('ar-EG')}
                <span className="mx-1.5 text-gray-300">·</span>
                <strong className="text-gray-900">{fmtMoney(order.totalAmount)} {cur}</strong>
                {Number(order.vatAmount) > 0 && (
                  <span className="text-gray-400"> (شامل ضريبة {fmtMoney(order.vatAmount)} {cur})</span>
                )}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
            {order.status === 'delivered' || order.status === 'partially_delivered' ? (
              <button onClick={() => ordersApi.getInvoice(id!).then((r) => {
                const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url;
                a.download = `invoice-${order.id.slice(0, 8)}.json`; a.click();
              })}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
              >
                <FileText size={14} /> {t('order.actions.invoice')}
              </button>
            ) : null}
            {actions.map((action) => {
              const cfg = actionLabel[action];
              if (!cfg) return null;
              const cc = colorClass[(cfg.color as keyof typeof colorClass)] ?? colorClass.blue;
              return (
                <button key={action} onClick={() => handleAction(action)}
                  disabled={statusMutation.isPending || approveMutation.isPending}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium disabled:opacity-50 transition-colors ${cc}`}
                >
                  {cfg.label}
                </button>
              );
            })}
            {canCancel && (
              <button
                onClick={() => setShowCancel(true)}
                disabled={statusMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <Ban size={14} /> إلغاء الطلب
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cancel-reason modal */}
      {showCancel && (
        <CancelReasonModal
          pending={statusMutation.isPending}
          onClose={() => setShowCancel(false)}
          onConfirm={(reason) => statusMutation.mutate({ status: 'cancelled', reason })}
        />
      )}

      {/* Action reason modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl space-y-4">
            <h3 className="font-semibold text-gray-900">{actionLabel[pendingAction]?.label}</h3>
            <textarea
              rows={3} placeholder="السبب…"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setPendingAction(null); setActionReason(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">تراجع</button>
              <button onClick={confirmAction} disabled={statusMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Receive modal */}
      {showReceive && (
        <ReceiveModal orderId={id!} items={order.items ?? []}
          onClose={() => setShowReceive(false)}
          onDone={() => setShowReceive(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: order details */}
        <div className="lg:col-span-2 space-y-5">

          {/* Items */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <Package size={15} className="text-gray-400" />
              <span className="font-semibold text-gray-800 text-sm">الأصناف</span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">الصنف</th>
                  <th className="px-4 py-2 text-center font-medium">الكمية</th>
                  <th className="px-4 py-2 text-center font-medium">سعر الوحدة</th>
                  <th className="px-4 py-2 text-center font-medium">ض.ق.م{vatPct != null ? ` (${vatPct}%)` : ''}</th>
                  <th className="px-4 py-2 text-left font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(order.items ?? []).map((item: any) => {
                  const code = item.product?.sku ?? item.product?.barcode ?? null;
                  const lineSubtotal = Number(item.unitPrice) * item.quantity;
                  const lineVat = order.vatRate != null ? lineSubtotal * Number(order.vatRate) : 0;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{item.product?.name ?? item.productId}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          {code && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                              <Tag size={10} /> كود: {code}
                            </span>
                          )}
                          {item.batchNumber && (
                            <span className="text-[11px] text-gray-400">تشغيلة: {item.batchNumber}</span>
                          )}
                        </div>
                        {(item.quantityAccepted != null || (item.quantityRejected ?? 0) > 0) && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {item.quantityAccepted != null && (
                              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                                <CheckCircle size={10} /> مقبول {item.quantityAccepted}
                              </span>
                            )}
                            {(item.quantityRejected ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                                <XCircle size={10} /> مرفوض {item.quantityRejected}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 tabular-nums">{item.quantity}</td>
                      <td className="px-4 py-3 text-center text-gray-700 tabular-nums">{fmtMoney(item.unitPrice)} {cur}</td>
                      <td className="px-4 py-3 text-center text-gray-500 tabular-nums">{fmtMoney(lineVat)} {cur}</td>
                      <td className="px-4 py-3 text-left font-medium text-gray-900 tabular-nums">{fmtMoney(lineSubtotal)} {cur}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {/* Financial breakdown */}
            <div className="border-t border-gray-200 bg-gray-50 px-5 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">المجموع الفرعي</span>
                <span className="text-gray-800 tabular-nums">{fmtMoney(subtotal)} {cur}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">ضريبة القيمة المضافة{vatPct != null ? ` (${vatPct}%)` : ''}</span>
                <span className="text-gray-800 tabular-nums">{fmtMoney(order.vatAmount)} {cur}</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-1.5 border-t border-gray-200">
                <span className="font-semibold text-gray-900">الإجمالي</span>
                <span className="font-bold text-gray-900 tabular-nums">{fmtMoney(order.totalAmount)} {cur}</span>
              </div>
              <p className="text-[11px] text-gray-400 pt-1">
                <Truck size={11} className="inline -mt-0.5 ml-1" />
                التوصيل: حسب اتفاقك مع الموزّع — غير محتسب ضمن الإجمالي
              </p>
            </div>
          </div>


          {/* Comment thread */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <MessageSquare size={15} className="text-gray-400" />
              <span className="font-semibold text-gray-800 text-sm">{t('order.messages')}</span>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-64 overflow-y-auto">
              {(comments as any[]).length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">لا توجد رسائل بعد.</p>
              )}
              {(comments as any[]).map((c: any) => {
                const mine = (isPharmacy && c.authorRole === 'pharmacy_admin') ||
                             (isSupplier && c.authorRole === 'supplier_admin');
                const who = c.authorRole === 'pharmacy_admin' ? 'الصيدلية' : c.authorRole === 'supplier_admin' ? 'الموزّع' : c.authorRole;
                return (
                  <div key={c.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                      {!mine && <p className="text-xs font-medium mb-0.5 opacity-70">{who}</p>}
                      <p>{c.body}</p>
                      <p className={`text-xs mt-1 ${mine ? 'text-blue-200' : 'text-gray-400'}`}>
                        {new Date(c.createdAt).toLocaleTimeString('ar-EG')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
              <textarea ref={commentRef} rows={1} placeholder="راسل الموزّع…"
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && comment.trim()) { e.preventDefault(); commentMutation.mutate(); } }}
              />
              <button onClick={() => commentMutation.mutate()} disabled={!comment.trim() || commentMutation.isPending}
                className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40">
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Right: status timeline + meta */}
        <div className="space-y-5">
          {/* Parties */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2.5">
            <p className="text-xs font-semibold text-gray-500 tracking-wide">الأطراف</p>
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0"><Store size={14} /></span>
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400">الصيدلية</p>
                <p className="text-sm font-medium text-gray-900 truncate">{order.pharmacyTenant?.name ?? order.pharmacyTenantId.slice(0, 8)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 shrink-0"><Building2 size={14} /></span>
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400">الموزّع</p>
                <p className="text-sm font-medium text-gray-900 truncate">{order.supplierTenant?.name ?? order.supplierTenantId.slice(0, 8)}</p>
              </div>
            </div>
          </div>

          {/* Contact supplier CTA (pharmacy side) */}
          {isPharmacy && (telHref || whatsappHref || mailtoHref) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageCircle size={14} className="text-emerald-500" />
                <p className="text-xs font-semibold text-gray-700">تواصل مع {supplierName}</p>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                للتنسيق المباشر حول التسليم أو التوفّر أو السعر — تواصل مع الموزّع عبر القناة المناسبة.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {whatsappHref && (
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors">
                    <MessageCircle size={15} /> واتساب
                  </a>
                )}
                <div className="flex gap-2">
                  {telHref && (
                    <a href={telHref}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors">
                      <Phone size={14} /> اتصال
                    </a>
                  )}
                  {mailtoHref && (
                    <a href={mailtoHref}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors">
                      <Mail size={14} /> بريد
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Status history */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 tracking-wide">سجل الطلب</p>
            </div>
            <StatusTimeline history={order.changeHistory ?? []} />
            {(!order.changeHistory?.length) && <p className="text-xs text-gray-400">لا يوجد سجل بعد.</p>}
          </div>

          {/* Cancellation info */}
          {order.cancellationReason && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5"><Ban size={12} /> سبب الإلغاء</p>
              <p className="text-sm text-red-800">{order.cancellationReason}</p>
            </div>
          )}

          {/* Dispute info */}
          {order.disputeReason && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-rose-700">سبب النزاع</p>
              <p className="text-sm text-rose-800">{order.disputeReason}</p>
              {order.disputeOpenedAt && (
                <p className="text-xs text-rose-500">{new Date(order.disputeOpenedAt).toLocaleString('ar-EG')}</p>
              )}
            </div>
          )}

          {/* Hold info */}
          {order.onHoldReason && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-600">سبب التعليق</p>
              <p className="text-sm text-slate-700 mt-0.5">{order.onHoldReason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
