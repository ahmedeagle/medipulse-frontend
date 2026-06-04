import { useQuery } from '@tanstack/react-query';
import { Building2, Package, ShoppingCart, TrendingUp } from 'lucide-react';
import { organizationsApi } from '../../api/organizations.api';
import { Spinner } from '../../components/ui/Spinner';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';

export default function ChainDashboardPage() {
  const { data: branches = [], isLoading: loadingBranches } = useQuery({
    queryKey: ['org-branches'],
    queryFn: () => organizationsApi.getBranches().then((r) => r.data),
  });

  const { data: inventory = [], isLoading: loadingInventory } = useQuery({
    queryKey: ['org-inventory'],
    queryFn: () => organizationsApi.getAggregatedInventory().then((r) => r.data),
  });

  const { data: spend = [], isLoading: loadingSpend } = useQuery({
    queryKey: ['org-spend'],
    queryFn: () => organizationsApi.getSpendAnalytics().then((r) => r.data),
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['org-orders'],
    queryFn: () => organizationsApi.getOrders().then((r) => r.data),
  });

  if (loadingBranches || loadingInventory || loadingSpend) return <Spinner />;

  const totalSpend   = spend.reduce((s: number, b: any) => s + b.totalSpend, 0);
  const totalOrders  = spend.reduce((s: number, b: any) => s + b.orderCount, 0);
  const lowStockBranches = inventory.length;
  const totalLowStock = inventory.reduce((s: number, b: any) => s + b.lowStockItems.length, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chain Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">{branches.length} branches · last 90 days</p>
      </div>

      {/* Network stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Branches"        value={branches.length}                      icon={Building2} />
        <StatCard title="Total Spend (90d)"    value={`SAR ${totalSpend.toLocaleString()}`}  icon={TrendingUp}   iconColor="text-green-600"  iconBg="bg-green-50" />
        <StatCard title="Total Orders (90d)"   value={totalOrders}                           icon={ShoppingCart} iconColor="text-purple-600" iconBg="bg-purple-50" />
        <StatCard title="Branches w/ Low Stock" value={lowStockBranches}                    icon={Package}      iconColor="text-orange-600" iconBg="bg-orange-50" />
      </div>

      {/* Low stock by branch */}
      {inventory.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Low Stock Alerts by Branch</h2>
            <p className="text-sm text-gray-400 mt-0.5">{totalLowStock} items at or below minimum threshold</p>
          </div>
          <div className="divide-y divide-gray-100">
            {inventory.map((branch: any) => (
              <div key={branch.tenantId} className="px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium text-gray-900">{branch.tenantName}</p>
                  <Badge status="low" label={`${branch.lowStockItems.length} items`} />
                </div>
                <div className="space-y-1">
                  {branch.lowStockItems.slice(0, 5).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{item.product?.name ?? item.productId}</span>
                      <span className="text-red-600 font-medium">{item.quantity} / {item.minThreshold}</span>
                    </div>
                  ))}
                  {branch.lowStockItems.length > 5 && (
                    <p className="text-xs text-gray-400">+{branch.lowStockItems.length - 5} more</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spend by branch */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Spend by Branch (last 90 days)</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3 text-left">Branch</th>
              <th className="px-6 py-3 text-right">Orders</th>
              <th className="px-6 py-3 text-right">Total Spend</th>
              <th className="px-6 py-3 text-right">Avg / Order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {spend.map((b: any) => (
              <tr key={b.branchId} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{b.branchName}</td>
                <td className="px-6 py-3 text-right text-gray-600">{b.orderCount}</td>
                <td className="px-6 py-3 text-right font-semibold text-gray-900">SAR {b.totalSpend.toLocaleString()}</td>
                <td className="px-6 py-3 text-right text-gray-500">
                  {b.orderCount > 0 ? `SAR ${Math.round(b.totalSpend / b.orderCount).toLocaleString()}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
