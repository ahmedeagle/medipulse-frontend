import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, GitBranch, Trash2 } from 'lucide-react';
import { organizationsApi } from '../../api/organizations.api';
import { adminApi } from '../../api/admin.api';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';

const TYPE_LABELS = { chain: 'Pharmacy Chain', hospital_network: 'Hospital Network', group: 'Group' };

export default function OrganizationsPage() {
  const qc = useQueryClient();
  const [createForm, setCreateForm] = useState({ name: '', slug: '', type: 'chain' });
  const [showCreate, setShowCreate] = useState(false);
  const [addBranch, setAddBranch] = useState<{ orgId: string; tenantId: string; branchRole: string } | null>(null);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationsApi.list().then((r) => r.data),
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ['admin-tenants', 'all'],
    queryFn: () => adminApi.getTenants({ limit: 200 }).then((r) => r.data?.data ?? r.data),
  });

  const create = useMutation({
    mutationFn: () => organizationsApi.create(createForm as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organizations'] }); setShowCreate(false); },
  });

  const linkBranch = useMutation({
    mutationFn: () => organizationsApi.addBranch(addBranch!.orgId, { tenantId: addBranch!.tenantId, branchRole: addBranch!.branchRole }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organizations'] }); setAddBranch(null); },
  });

  const removeBranch = useMutation({
    mutationFn: ({ orgId, tenantId }: { orgId: string; tenantId: string }) =>
      organizationsApi.removeBranch(orgId, tenantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });

  if (isLoading) return <Spinner />;

  const pharmacyTenants = (tenants as any[]).filter((t: any) => t.type === 'pharmacy');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-500 text-sm mt-1">Manage pharmacy chains, hospital networks, and multi-branch groups.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} /> New Organization
        </button>
      </div>

      {orgs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Building2 size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No organizations yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orgs.map((org: any) => (
            <div key={org.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 size={18} className="text-blue-600" />
                  <div>
                    <p className="font-semibold text-gray-900">{org.name}</p>
                    <p className="text-xs text-gray-400">{org.slug} · {TYPE_LABELS[org.type as keyof typeof TYPE_LABELS] ?? org.type}</p>
                  </div>
                </div>
                <button
                  onClick={() => setAddBranch({ orgId: org.id, tenantId: '', branchRole: 'branch' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <GitBranch size={14} /> Add Branch
                </button>
              </div>
              {/* Branches would be shown here with an org-specific query */}
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl space-y-4">
            <h3 className="font-semibold text-gray-900">New Organization</h3>
            {[
              { label: 'Name', key: 'name', placeholder: 'Al-Nahdi Pharmacy Chain' },
              { label: 'Slug', key: 'slug', placeholder: 'al-nahdi' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  placeholder={placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={(createForm as any)[key]}
                  onChange={(e) => setCreateForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={createForm.type}
                onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="chain">Pharmacy Chain</option>
                <option value="hospital_network">Hospital Network</option>
                <option value="group">Group</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={() => create.mutate()}
                disabled={!createForm.name || !createForm.slug || create.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add branch modal */}
      {addBranch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl space-y-4">
            <h3 className="font-semibold text-gray-900">Add Branch</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pharmacy tenant</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={addBranch.tenantId}
                onChange={(e) => setAddBranch((b) => b && ({ ...b, tenantId: e.target.value }))}
              >
                <option value="">Select tenant…</option>
                {pharmacyTenants.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch role</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={addBranch.branchRole}
                onChange={(e) => setAddBranch((b) => b && ({ ...b, branchRole: e.target.value }))}
              >
                <option value="branch">Branch</option>
                <option value="central">Central (HQ)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setAddBranch(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={() => linkBranch.mutate()}
                disabled={!addBranch.tenantId || linkBranch.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Add Branch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
