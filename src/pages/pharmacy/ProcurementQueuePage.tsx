import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, AlertTriangle, Clock, Package, ShoppingCart } from 'lucide-react';
import clsx from 'clsx';
import { procurementApi } from '../../api/procurement.api';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';

const URGENCY_COLOR = {
  critical: 'red',
  high:     'orange',
  medium:   'yellow',
} as const;

const URGENCY_LABEL = {
  critical: '🔴 Critical',
  high:     '🟠 High',
  medium:   '🟡 Medium',
};

export default function ProcurementQueuePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['procurement-queue'],
    queryFn: () => procurementApi.getQueue().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => procurementApi.approveDraft(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procurement-queue'] }),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      procurementApi.rejectDraft(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-queue'] });
      setRejectingId(null);
      setRejectReason('');
    },
  });

  if (isLoading) return <Spinner />;

  const drafts       = data?.criticalDrafts   ?? [];
  const expiring     = data?.expiringStock    ?? [];
  const inFlight     = data?.pendingOrders    ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('procurement.title')}</h1>
        <p className="text-gray-500 text-sm mt-1">Auto-generated actions ordered by urgency. Approve or reject each draft.</p>
      </div>

      {/* ── Auto-Generated Drafts ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" />
          {t('procurement.drafts')}
          {drafts.length > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{drafts.length}</span>
          )}
        </h2>

        {drafts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            <CheckCircle size={36} className="mx-auto mb-2 text-green-400" />
            {t('procurement.no_drafts')}
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft: any) => (
              <div key={draft.id} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-500">
                      {URGENCY_LABEL[draft.urgencyLevel as keyof typeof URGENCY_LABEL] ?? draft.urgencyLevel}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="text-xs text-gray-400">
                      Expires {new Date(draft.expiresAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-900 font-semibold">
                    {draft.suggestedQuantity} units — {draft.currency} {Number(draft.unitPrice).toFixed(2)} each
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Total: {draft.currency} {(draft.suggestedQuantity * Number(draft.unitPrice)).toFixed(2)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => approve.mutate(draft.id)}
                    disabled={approve.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle size={15} /> {t('common.approve')}
                  </button>
                  <button
                    onClick={() => setRejectingId(draft.id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
                  >
                    <XCircle size={15} /> {t('common.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reject reason modal */}
        {rejectingId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h3 className="font-semibold text-gray-900 mb-3">Reject Draft</h3>
              <textarea
                className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Reason (optional)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => { setRejectingId(null); setRejectReason(''); }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => reject.mutate({ id: rejectingId, reason: rejectReason })}
                  disabled={reject.isPending}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Expiring Stock ────────────────────────────────────────────────── */}
      {expiring.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Clock size={18} className="text-orange-500" />
            {t('inventory.expiry')} (30 days)
            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{expiring.length}</span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {expiring.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <Package size={16} className="text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.product?.name ?? item.productId}</p>
                    <p className="text-xs text-gray-400">{item.quantity} units remaining</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-orange-600">
                  Expires {new Date(item.expiryDate).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── In-Flight Orders ──────────────────────────────────────────────── */}
      {inFlight.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <ShoppingCart size={18} className="text-blue-500" />
            {t('procurement.inflight')}
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{inFlight.length}</span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {inFlight.map((order: any) => (
              <div key={order.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Order #{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-400">{order.items?.length ?? 0} items • SAR {Number(order.totalAmount).toFixed(2)}</p>
                </div>
                <Badge status={order.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
