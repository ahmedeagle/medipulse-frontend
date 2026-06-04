import { useQuery } from '@tanstack/react-query';
import { Calendar, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import clsx from 'clsx';
import { forecastingApi } from '../../api/forecasting.api';
import { inventoryApi } from '../../api/inventory.api';
import { Spinner } from '../../components/ui/Spinner';

function urgencyConfig(days: number | null) {
  if (days === null || days === undefined) return { color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200', label: 'No data' };
  if (days <= 2) return { color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    label: 'Critical' };
  if (days <= 5) return { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Urgent' };
  if (days <= 7) return { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', label: 'Soon' };
  return { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'On track' };
}

export default function EoqPage() {
  const { data: inventory = [], isLoading: loadingInv } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => inventoryApi.getAll().then((r) => r.data),
  });

  // Fetch schedules for all products in parallel
  const products = (inventory as any[]).filter((i: any) => i.product);

  const { data: scheduleResults = [], isLoading: loadingSchedules } = useQuery({
    queryKey: ['eoq-schedules', products.map((p: any) => p.productId)],
    queryFn: async () => {
      const results = await Promise.all(
        products.map((item: any) =>
          forecastingApi.getEoqSchedule(item.productId)
            .then((r) => ({ product: item.product, schedule: r.data }))
            .catch(() => ({ product: item.product, schedule: null })),
        ),
      );
      return results.filter((r) => r.schedule);
    },
    enabled: products.length > 0,
  });

  const sorted = [...scheduleResults].sort((a: any, b: any) => {
    const da = a.schedule?.daysUntilReorderNeeded ?? 9999;
    const db = b.schedule?.daysUntilReorderNeeded ?? 9999;
    return da - db;
  });

  const critical = sorted.filter((r: any) => (r.schedule?.daysUntilReorderNeeded ?? 9999) <= 7);

  if (loadingInv || loadingSchedules) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Procurement Schedule</h1>
        <p className="text-gray-500 text-sm mt-1">
          Economic Order Quantity · Safety Stock · Dynamic Reorder Points
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-red-600">{critical.length}</p>
          <p className="text-xs text-red-500 mt-1">Order within 7 days</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{sorted.length}</p>
          <p className="text-xs text-gray-400 mt-1">Products scheduled</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{sorted.length - critical.length}</p>
          <p className="text-xs text-green-500 mt-1">On track</p>
        </div>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No procurement schedules computed yet.</p>
          <p className="text-gray-400 text-sm mt-1">Schedules are generated daily at 3am from EOQ calculations.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left">Product</th>
                <th className="px-5 py-3 text-right">EOQ Qty</th>
                <th className="px-5 py-3 text-right">Safety Stock</th>
                <th className="px-5 py-3 text-right">Reorder Point</th>
                <th className="px-5 py-3 text-center">Lead Time</th>
                <th className="px-5 py-3 text-center">Order By</th>
                <th className="px-5 py-3 text-center">Stockout</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(({ product, schedule }: any) => {
                const days   = schedule?.daysUntilReorderNeeded;
                const cfg    = urgencyConfig(days);
                const Icon   = days !== null && days <= 5 ? AlertTriangle : CheckCircle;
                return (
                  <tr key={product.id} className={clsx('hover:bg-gray-50', days !== null && days <= 5 ? 'bg-red-50/30' : '')}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.category}</p>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">
                      {schedule?.eoqQty ? `${Math.round(Number(schedule.eoqQty))} units` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {schedule?.safetyStockQty ? `${Math.round(Number(schedule.safetyStockQty))} units` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {schedule?.reorderPoint ? `${Math.round(Number(schedule.reorderPoint))} units` : '—'}
                    </td>
                    <td className="px-5 py-3 text-center text-gray-500">
                      {schedule?.effectiveLeadTimeDays ? `${Math.ceil(Number(schedule.effectiveLeadTimeDays))}d` : '—'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {schedule?.reorderByDate ? (
                        <span className={clsx('text-xs font-semibold', cfg.color)}>
                          {new Date(schedule.reorderByDate).toLocaleDateString()}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-center text-xs text-red-500">
                      {schedule?.predictedStockoutDate
                        ? new Date(schedule.predictedStockoutDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold', cfg.bg, cfg.color)}>
                        <Icon size={11} />{cfg.label}
                        {days !== null && days <= 7 && ` · ${days}d`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
        <strong>EOQ Formula:</strong> √(2DK/H) where D=annual demand, K=SAR 50 ordering cost, H=15% of unit price.
        <strong className="ml-3">Safety Stock:</strong> z × σ_daily × √leadTime at 95% service level (z=1.645).
        <strong className="ml-3">Lead Time:</strong> Supplier's avg delivery days × 1.2 buffer from reliability score.
      </div>
    </div>
  );
}
