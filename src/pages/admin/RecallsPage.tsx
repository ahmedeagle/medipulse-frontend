import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertTriangle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { recallsApi } from '../../api/recalls.api';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';

export default function RecallsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    productId: '', batchNumber: '', recallType: 'urgent',
    recallReferenceNumber: '', description: '', effectiveAt: '', resolutionDeadline: '',
  });

  const RECALL_TYPES = [
    { value: 'urgent',            label: `🔴 ${t('recall.recall_type.urgent')}` },
    { value: 'voluntary',         label: `🟡 ${t('recall.recall_type.voluntary')}` },
    { value: 'market_withdrawal', label: `⚪ ${t('recall.recall_type.market_withdrawal')}` },
  ];

  const { data: recalls = [], isLoading } = useQuery<any[]>({
    queryKey: ['recalls'],
    queryFn: () => recallsApi.list().then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () => recallsApi.create({
      productId:             form.productId,
      batchNumber:           form.batchNumber || undefined,
      recallType:            form.recallType as any,
      recallReferenceNumber: form.recallReferenceNumber,
      description:           form.description || undefined,
      effectiveAt:           form.effectiveAt || undefined,
      resolutionDeadline:    form.resolutionDeadline || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recalls'] }); setShowCreate(false); },
  });

  const resolve = useMutation({
    mutationFn: (id: string) => recallsApi.resolve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recalls'] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('recall.title')}</h1>
          <p className="text-gray-500 text-sm mt-1">SFDA recall management — all affected pharmacies are notified automatically.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">
          <Plus size={16} /> {t('recall.issue_recall')}
        </button>
      </div>

      {/* Active recalls warning */}
      {(recalls as any[]).filter((r: any) => r.status === 'active').length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-red-800">
              {(recalls as any[]).filter((r: any) => r.status === 'active').length} {t('recall.title')}
            </p>
            <p className="text-sm text-red-600">Affected pharmacies have been notified. Monitor resolution progress.</p>
          </div>
        </div>
      )}

      {/* List */}
      {(recalls as any[]).length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CheckCircle size={36} className="mx-auto mb-3 text-green-400" />
          <p className="text-gray-500 font-medium">{t('recall.all_clear')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {(recalls as any[]).map((recall: any) => (
            <div key={recall.id} className="px-6 py-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge status={recall.recallType} label={recall.recallType.replace('_', ' ')} />
                  <Badge status={recall.status} />
                  <span className="text-xs font-mono text-gray-400">{recall.recallReferenceNumber}</span>
                </div>
                <p className="text-sm font-medium text-gray-900">Product: {recall.productId.slice(0, 8)}</p>
                {recall.batchNumber && <p className="text-xs text-gray-500">Batch: {recall.batchNumber}</p>}
                {recall.description && <p className="text-xs text-gray-500 mt-0.5">{recall.description}</p>}
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs text-gray-400">
                    Issued: {new Date(recall.issuedAt).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-red-500 font-medium">
                    {recall.affectedPharmacyIds?.length ?? 0} {t('recall.affected_pharmacies')}
                  </span>
                </div>
              </div>
              {recall.status === 'active' && (
                <button
                  onClick={() => resolve.mutate(recall.id)}
                  disabled={resolve.isPending}
                  className="shrink-0 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {t('recall.resolve')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="font-semibold text-gray-900">Issue Product Recall</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                All pharmacies holding the affected product/batch will be notified immediately.
              </p>
            </div>

            {[
              { label: 'Product ID (UUID) *', key: 'productId', placeholder: 'xxxxxxxx-xxxx-…' },
              { label: 'Batch Number (leave blank for all batches)', key: 'batchNumber', placeholder: 'Optional' },
              { label: `${t('recall.sfda_reference')} *`, key: 'recallReferenceNumber', placeholder: 'SFDA-2025-XXXXX' },
              { label: 'Description', key: 'description', placeholder: 'Optional details' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input placeholder={placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recall Type *</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                value={form.recallType}
                onChange={(e) => setForm((f) => ({ ...f, recallType: e.target.value }))}>
                {RECALL_TYPES.map((rt) => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
                <input type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={form.effectiveAt}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveAt: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resolution Deadline</label>
                <input type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={form.resolutionDeadline}
                  onChange={(e) => setForm((f) => ({ ...f, resolutionDeadline: e.target.value }))}
                />
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              ⚠️ This action cannot be undone. All affected pharmacies will receive an immediate urgent notification and email.
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('common.cancel')}</button>
              <button onClick={() => create.mutate()}
                disabled={!form.productId || !form.recallReferenceNumber || create.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {create.isPending ? 'Issuing…' : t('recall.issue_recall')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
