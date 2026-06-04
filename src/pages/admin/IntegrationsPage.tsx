import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Plug, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import client from '../../api/client';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';

const integrationsApi = {
  list:    () => client.get('/integrations'),
  create:  (data: any) => client.post('/integrations', data),
  enable:  (id: string) => client.patch(`/integrations/${id}/enable`),
  disable: (id: string) => client.patch(`/integrations/${id}/disable`),
  remove:  (id: string) => client.delete(`/integrations/${id}`),
};

const TYPE_LABELS = { erp: 'ERP System', pos: 'POS System', supplier_api: 'Supplier API' };

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ tenantId: '', type: 'erp', connectorId: '', secretsArn: '' });

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => integrationsApi.list().then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () => integrationsApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['integrations'] }); setShowCreate(false); },
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? integrationsApi.disable(id) : integrationsApi.enable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => integrationsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="text-gray-500 text-sm mt-1">Manage ERP, POS, and supplier API connector configurations.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} /> New Integration
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>SDK layer ready.</strong> Connector interfaces are defined — ERP, POS, and Supplier API connectors can be implemented per vendor and registered here.
      </div>

      {integrations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Plug size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No integrations configured yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {integrations.map((intg: any) => (
            <div key={intg.id} className="flex items-center justify-between px-6 py-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-medium text-gray-900">{intg.connectorId ?? intg.type}</p>
                  <Badge status={intg.status} />
                </div>
                <p className="text-xs text-gray-400">{TYPE_LABELS[intg.type as keyof typeof TYPE_LABELS]} · Tenant {intg.tenantId.slice(0, 8)}</p>
                {intg.lastSyncAt && <p className="text-xs text-gray-400">Last sync: {new Date(intg.lastSyncAt).toLocaleString()}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggle.mutate({ id: intg.id, active: intg.status === 'active' })}
                  className="text-gray-400 hover:text-blue-600"
                >
                  {intg.status === 'active' ? <ToggleRight size={22} className="text-blue-600" /> : <ToggleLeft size={22} />}
                </button>
                <button
                  onClick={() => remove.mutate(intg.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
            <h3 className="font-semibold text-gray-900">New Integration</h3>
            {[
              { label: 'Tenant ID (UUID)', key: 'tenantId' },
              { label: 'Connector ID (e.g. sap-b1)', key: 'connectorId' },
              { label: 'Secrets Manager ARN (optional)', key: 'secretsArn' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="erp">ERP System</option>
                <option value="pos">POS System</option>
                <option value="supplier_api">Supplier API</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={() => create.mutate()}
                disabled={!form.tenantId || !form.connectorId || create.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
