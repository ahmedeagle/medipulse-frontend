import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, MessageSquare, Send, CheckCircle, XCircle, AlertTriangle,
  Package, FileText, RotateCcw, PauseCircle, Download, Clock,
} from 'lucide-react';
import clsx from 'clsx';
import { ordersApi } from '../../api/orders.api';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { getRoleFromToken } from '../../auth/oidc';

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
            <span className="text-gray-500">{new Date(entry.at).toLocaleString()}</span>
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-gray-900">Confirm Receipt — QC Inspection</h3>
        <p className="text-sm text-gray-500">Enter the quantity accepted and rejected per item after physical inspection.</p>

        {items.map((item: any) => (
          <div key={item.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="font-medium text-gray-900">{item.product?.name ?? item.productId}</p>
            <p className="text-xs text-gray-400">Ordered: {item.quantity} units</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Accepted</label>
                <input type="number" min={0} max={item.quantity}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={receipts[item.id]?.accepted ?? item.quantity}
                  onChange={(e) => setReceipts((r) => ({ ...r, [item.id]: { ...r[item.id], accepted: Number(e.target.value) } }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rejected</label>
                <input type="number" min={0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={receipts[item.id]?.rejected ?? 0}
                  onChange={(e) => setReceipts((r) => ({ ...r, [item.id]: { ...r[item.id], rejected: Number(e.target.value) } }))}
                />
              </div>
            </div>
            {(receipts[item.id]?.rejected ?? 0) > 0 && (
              <input placeholder="Rejection reason (defect, wrong product, damage…)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                value={receipts[item.id]?.reason ?? ''}
                onChange={(e) => setReceipts((r) => ({ ...r, [item.id]: { ...r[item.id], reason: e.target.value } }))}
              />
            )}
          </div>
        ))}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={() => confirm.mutate()} disabled={confirm.isPending}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            {confirm.isPending ? 'Confirming…' : 'Confirm Receipt'}
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

  const actionLabel: Record<string, { label: string; color: string; status?: string }> = {
    approve:              { label: t('order.actions.approve'),       color: 'green' },
    submit:               { label: t('order.actions.submit'),         color: 'blue',   status: 'submitted' },
    accept:               { label: t('order.actions.accept'),         color: 'green',  status: 'accepted' },
    ship:                 { label: t('order.actions.ship'),           color: 'purple', status: 'shipped' },
    back_order:           { label: t('order.actions.back_order'),     color: 'orange', status: 'back_ordered' },
    counter_offer:        { label: t('order.actions.counter_offer'),  color: 'orange', status: 'counter_offer' },
    accept_counter:       { label: 'Accept Counter',                  color: 'green',  status: 'accepted' },
    reject_counter:       { label: 'Reject Counter Offer',            color: 'red',    status: 'cancelled' },
    receive:              { label: t('order.actions.receive'),        color: 'blue' },
    mark_received_qc:     { label: 'Mark Goods Received',             color: 'sky',    status: 'received_pending_qc' },
    report_failed_delivery:{ label: 'Report Failed Delivery',         color: 'red',    status: 'failed_delivery' },
    reschedule:           { label: 'Reschedule Delivery',             color: 'orange', status: 'shipped' },
    retry_delivery:       { label: 'Retry Delivery',                  color: 'blue',   status: 'shipped' },
    dispute:              { label: t('order.actions.dispute'),        color: 'red',    status: 'disputed' },
    accept_as_delivered:  { label: 'Accept As Delivered',             color: 'green',  status: 'delivered' },
    hold:                 { label: t('order.actions.hold'),           color: 'gray',   status: 'on_hold' },
    release_hold:         { label: t('order.actions.release_hold'),   color: 'blue',   status: 'accepted' },
    unhold:               { label: 'Resume Order',                    color: 'blue',   status: 'accepted' },
    return:               { label: t('order.actions.return'),         color: 'orange' },
    approve_return:       { label: t('order.actions.approve_return'), color: 'green',  status: 'return_approved' },
    reject_return:        { label: 'Reject Return',                   color: 'red' },
    mark_received:        { label: 'Return Received',                 color: 'blue',   status: 'return_received' },
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
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Order #{order.id.slice(0, 8)}</h1>
            <Badge status={order.status} />
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            {new Date(order.createdAt).toLocaleString()} · SAR {Number(order.totalAmount).toLocaleString()}
            {order.vatAmount > 0 && ` (incl. VAT ${Number(order.vatAmount).toFixed(2)})`}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Action reason modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl space-y-4">
            <h3 className="font-semibold text-gray-900">{actionLabel[pendingAction]?.label}</h3>
            <textarea
              rows={3} placeholder="Reason…"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setPendingAction(null); setActionReason(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={confirmAction} disabled={statusMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                Confirm
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
              <span className="font-semibold text-gray-800 text-sm">{t('order.items')}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Product</th>
                  <th className="px-5 py-2 text-right">{t('order.ordered')}</th>
                  <th className="px-5 py-2 text-right">{t('order.accepted')}</th>
                  <th className="px-5 py-2 text-right">{t('order.rejected')}</th>
                  <th className="px-5 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(order.items ?? []).map((item: any) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{item.product?.name ?? item.productId}</p>
                      {item.batchNumber && <p className="text-xs text-gray-400">{t('order.batch')}: {item.batchNumber}</p>}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">{item.quantity}</td>
                    <td className="px-5 py-3 text-right">
                      {item.quantityAccepted != null
                        ? <span className="text-green-600 font-semibold">{item.quantityAccepted}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {item.quantityRejected != null && item.quantityRejected > 0
                        ? <span className="text-red-500 font-semibold">{item.quantityRejected}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      SAR {(Number(item.unitPrice) * item.quantity).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-5 py-2 text-right text-xs text-gray-500">Subtotal + VAT (15%)</td>
                  <td className="px-5 py-2 text-right font-bold text-gray-900">
                    SAR {Number(order.totalAmount).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Comment thread */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <MessageSquare size={15} className="text-gray-400" />
              <span className="font-semibold text-gray-800 text-sm">{t('order.messages')}</span>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-64 overflow-y-auto">
              {(comments as any[]).length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">No messages yet.</p>
              )}
              {(comments as any[]).map((c: any) => {
                const mine = (isPharmacy && c.authorRole === 'pharmacy_admin') ||
                             (isSupplier && c.authorRole === 'supplier_admin');
                return (
                  <div key={c.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                      {!mine && <p className="text-xs font-medium mb-0.5 opacity-70 capitalize">{c.authorRole.replace('_', ' ')}</p>}
                      <p>{c.body}</p>
                      <p className={`text-xs mt-1 ${mine ? 'text-blue-200' : 'text-gray-400'}`}>
                        {new Date(c.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
              <textarea ref={commentRef} rows={1} placeholder="Message supplier…"
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
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parties</p>
            <div>
              <p className="text-xs text-gray-400">Pharmacy</p>
              <p className="text-sm font-medium text-gray-900">{order.pharmacyTenant?.name ?? order.pharmacyTenantId.slice(0, 8)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Supplier</p>
              <p className="text-sm font-medium text-gray-900">{order.supplierTenant?.name ?? order.supplierTenantId.slice(0, 8)}</p>
            </div>
          </div>

          {/* Status history */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('order.history')}</p>
            </div>
            <StatusTimeline history={order.changeHistory ?? []} />
            {(!order.changeHistory?.length) && <p className="text-xs text-gray-400">No history yet.</p>}
          </div>

          {/* Dispute info */}
          {order.disputeReason && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-rose-700">Dispute Reason</p>
              <p className="text-sm text-rose-800">{order.disputeReason}</p>
              {order.disputeOpenedAt && (
                <p className="text-xs text-rose-500">{new Date(order.disputeOpenedAt).toLocaleString()}</p>
              )}
            </div>
          )}

          {/* Hold info */}
          {order.onHoldReason && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-600">Hold Reason</p>
              <p className="text-sm text-slate-700 mt-0.5">{order.onHoldReason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
