import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TrendingUp, ShoppingCart, Sparkles, Target } from 'lucide-react';
import { analyticsApi } from '../../api/analytics.api';
import { Spinner } from '../../components/ui/Spinner';
import { StatCard } from '../../components/ui/StatCard';

function SpendBar({ week, maxSpend }: { week: any; maxSpend: number }) {
  const pct = maxSpend > 0 ? Math.round((Number(week.totalSpend) / maxSpend) * 100) : 0;
  return (
    <div className="flex items-end gap-2">
      <div className="text-xs text-gray-400 w-20 text-right">{new Date(week.weekStart).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
        <div
          className="h-4 bg-blue-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-gray-600 w-24">SAR {Number(week.totalSpend).toLocaleString()}</div>
    </div>
  );
}

export default function AnalyticsDashboardPage() {
  const { t } = useTranslation();
  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: () => analyticsApi.getDashboard(12).then((r) => r.data),
  });

  if (isLoading) return <Spinner />;

  const latest = snapshots[0];
  const maxSpend = Math.max(...snapshots.map((s: any) => Number(s.totalSpend)), 1);
  const totalSpend = snapshots.reduce((s: number, w: any) => s + Number(w.totalSpend), 0);
  const totalOrders = snapshots.reduce((s: number, w: any) => s + w.totalOrders, 0);
  const avgConversion = snapshots.length
    ? snapshots.reduce((s: number, w: any) => s + Number(w.recommendationConversionRate), 0) / snapshots.length
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('analytics.title')}</h1>
        <p className="text-gray-500 text-sm mt-1">Last 12 weeks of procurement activity.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('analytics.total_spend')}
          value={`${t('common.currency')} ${totalSpend.toLocaleString()}`}
          icon={TrendingUp}
          iconColor="text-blue-600" iconBg="bg-blue-50"
        />
        <StatCard
          title="Total Orders (12w)"
          value={totalOrders}
          icon={ShoppingCart}
          iconColor="text-green-600" iconBg="bg-green-50"
        />
        <StatCard
          title="Rec. Conversion Rate"
          value={`${Math.round(avgConversion * 100)}%`}
          icon={Sparkles}
          iconColor="text-purple-600" iconBg="bg-purple-50"
        />
        <StatCard
          title="This Week's Spend"
          value={`SAR ${Number(latest?.totalSpend ?? 0).toLocaleString()}`}
          icon={Target}
          iconColor="text-orange-600" iconBg="bg-orange-50"
        />
      </div>

      {/* Spend trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Weekly Spend Trend</h2>
        {snapshots.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">No data yet — spend data appears after the first delivered order.</p>
        ) : (
          <div className="space-y-2">
            {[...snapshots].reverse().map((week: any) => (
              <SpendBar key={week.weekStart} week={week} maxSpend={maxSpend} />
            ))}
          </div>
        )}
      </div>

      {/* Weekly breakdown table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Weekly Breakdown</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3 text-left">Week</th>
              <th className="px-6 py-3 text-right">Orders</th>
              <th className="px-6 py-3 text-right">Spend</th>
              <th className="px-6 py-3 text-right">Recs Generated</th>
              <th className="px-6 py-3 text-right">Acted On</th>
              <th className="px-6 py-3 text-right">Conversion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {snapshots.map((week: any) => (
              <tr key={week.weekStart} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-gray-700">
                  {new Date(week.weekStart).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-6 py-3 text-right text-gray-900 font-medium">{week.totalOrders}</td>
                <td className="px-6 py-3 text-right text-gray-900 font-medium">SAR {Number(week.totalSpend).toLocaleString()}</td>
                <td className="px-6 py-3 text-right text-gray-600">{week.recommendationsGenerated}</td>
                <td className="px-6 py-3 text-right text-green-600">{week.recommendationsActedOn}</td>
                <td className="px-6 py-3 text-right">
                  <span className={`font-semibold ${Number(week.recommendationConversionRate) >= 0.5 ? 'text-green-600' : 'text-gray-500'}`}>
                    {Math.round(Number(week.recommendationConversionRate) * 100)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
