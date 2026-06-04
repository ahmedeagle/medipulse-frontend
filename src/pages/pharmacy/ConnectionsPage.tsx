import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Star } from 'lucide-react';
import { connectionsApi } from '../../api/connections.api';
import { profileApi } from '../../api/profile.api';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';

export default function ConnectionsPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ supplierTenantId: '', priority: 5, notes: '' });

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionsApi.list().then((r) => r.data),
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ['supplier-profiles'],
    queryFn: () => profileApi.listAll('verified').then((r) => r.data),
  });

  const connect = useMutation({
    mutationFn: () => connectionsApi.connect(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setShowAdd(false);
      setForm({ supplierTenantId: '', priority: 5, notes: '' });
    },
  });

  const disconnect = useMutation({
    mutationFn: (sid: string) => connectionsApi.disconnect(sid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });

  if (isLoading) return <Spinner />;

  const connectedIds = new Set(connections.map((c: any) => c.supplierTenantId));
  const available = allProfiles.filter((p: any) => !connectedIds.has(p.supplierTenantId));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Preferred Suppliers</h1>
          <p className="text-gray-500 text-sm mt-1">Your preferred network — connected suppliers rank higher in AI recommendations.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} /> Add Supplier
        </button>
      </div>

      {connections.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Star size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No preferred suppliers yet.</p>
          <p className="text-gray-400 text-sm mt-1">Connect with suppliers to boost their ranking in your AI recommendations.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {connections.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                  {c.priority}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {allProfiles.find((p: any) => p.supplierTenantId === c.supplierTenantId)?.companyName ?? c.supplierTenantId.slice(0, 8)}
                  </p>
                  {c.notes && <p className="text-xs text-gray-400">{c.notes}</p>}
                </div>
              </div>
              <button
                onClick={() => disconnect.mutate(c.supplierTenantId)}
                disabled={disconnect.isPending}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
            <h3 className="font-semibold text-gray-900">Add Preferred Supplier</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.supplierTenantId}
                onChange={(e) => setForm((f) => ({ ...f, supplierTenantId: e.target.value }))}
              >
                <option value="">Select a supplier…</option>
                {available.map((p: any) => (
                  <option key={p.supplierTenantId} value={p.supplierTenantId}>{p.companyName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority (1 = highest)</label>
              <input
                type="number" min={1} max={10}
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <input
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={() => connect.mutate()}
                disabled={!form.supplierTenantId || connect.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
