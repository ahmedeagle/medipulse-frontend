import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { auditApi } from '../../api/audit.api';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';

const RESOURCE_OPTIONS = [
  'supplier_catalog','ai_recommendations','ai_audit_logs','audit_logs',
  'org_inventory','org_orders','procurement_drafts','demand_signals',
  'regional_pricing','analytics_dashboard',
];

const METHOD_COLOR: Record<string, string> = {
  POST: 'blue', PATCH: 'yellow', DELETE: 'red', GET: 'green',
};

export default function AuditLogPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ resource: '', userId: '', from: '', to: '', offset: 0 });
  const LIMIT = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => auditApi.query({ ...filters, limit: LIMIT }).then((r) => r.data),
    placeholderData: (prev: any) => prev,
  });

  const pollKc = useMutation({
    mutationFn: () => auditApi.pollKcEvents(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-logs'] }),
  });

  const logs  = (data as any)?.data  ?? [];
  const total = (data as any)?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-500 text-sm mt-1">
            Complete trail of all API mutations and sensitive reads. Immutable.
          </p>
        </div>
        <button
          onClick={() => pollKc.mutate()}
          disabled={pollKc.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <Shield size={15} />
          {pollKc.isPending ? 'Syncing KC…' : 'Sync KC Events'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Resource</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filters.resource}
            onChange={(e) => setFilters((f) => ({ ...f, resource: e.target.value, offset: 0 }))}
          >
            <option value="">All resources</option>
            {RESOURCE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">User ID</label>
          <input
            placeholder="UUID..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filters.userId}
            onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value, offset: 0 }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="datetime-local"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, offset: 0 }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="datetime-local"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, offset: 0 }))}
          />
        </div>
      </div>

      {isLoading ? <Spinner /> : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-500">{total.toLocaleString()} total records</p>
              <p className="text-xs text-gray-400">Showing {filters.offset + 1}–{Math.min(filters.offset + LIMIT, total)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left">Timestamp</th>
                    <th className="px-4 py-3 text-left">Method</th>
                    <th className="px-4 py-3 text-left">Resource / Path</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Latency</th>
                    <th className="px-4 py-3 text-left">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No records found</td></tr>
                  ) : logs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge status={log.method?.toLowerCase() ?? 'unknown'} label={log.method} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 text-xs">{log.resource || '—'}</p>
                        <p className="text-gray-400 text-xs truncate max-w-xs">{log.path}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold ${log.statusCode >= 400 ? 'text-red-600' : 'text-green-600'}`}>
                          {log.statusCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{log.latencyMs}ms</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{log.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <button
              disabled={filters.offset === 0}
              onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - LIMIT) }))}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              disabled={filters.offset + LIMIT >= total}
              onClick={() => setFilters((f) => ({ ...f, offset: f.offset + LIMIT }))}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
