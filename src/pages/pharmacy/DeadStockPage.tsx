import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, Tag, Trash2, Eye, DollarSign } from 'lucide-react';
import clsx from 'clsx';
import { forecastingApi } from '../../api/forecasting.api';
import { Spinner } from '../../components/ui/Spinner';
import { StatCard } from '../../components/ui/StatCard';

const ACTION_CONFIG = {
  return_to_supplier: { label: 'Return to Supplier', icon: ArrowUpRight, color: 'text-blue-600',  bg: 'bg-blue-50',  border: 'border-blue-200' },
  markdown:           { label: 'Markdown Price',      icon: Tag,          color: 'text-orange-600',bg: 'bg-orange-50',border: 'border-orange-200' },
  write_off:          { label: 'Write Off',           icon: Trash2,       color: 'text-red-600',   bg: 'bg-red-50',   border: 'border-red-200' },
  monitor:            { label: 'Monitor',             icon: Eye,          color: 'text-gray-500',  bg: 'bg-gray-50',  border: 'border-gray-200' },
} as const;

const EXPIRY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  none:     'bg-gray-100 text-gray-500',
};

function UrgencyBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full', {
            'bg-red-500':    score >= 80,
            'bg-orange-400': score >= 60,
            'bg-yellow-400': score >= 40,
            'bg-gray-300':   score < 40,
          })}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-600 w-8 text-right">{score}</span>
    </div>
  );
}

export default function DeadStockPage() {
  const { data: analyses = [], isLoading: loadingAnalyses } = useQuery({
    queryKey: ['dead-stock'],
    queryFn: () => forecastingApi.getDeadStock().then((r) => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ['dead-stock-summary'],
    queryFn: () => forecastingApi.getDeadStockSummary().then((r) => r.data),
  });

  if (loadingAnalyses) return <Spinner />;

  const totalValue   = summary?.value ?? 0;
  const totalCount   = summary?.count ?? 0;
  const criticalCount = (analyses as any[]).filter((a: any) => a.urgencyScore >= 80).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dead Stock Intelligence</h1>
        <p className="text-gray-500 text-sm mt-1">
          Products with 8+ weeks of zero movement — financial impact + liquidation recommendations.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="Locked Capital"
          value={`SAR ${totalValue.toLocaleString()}`}
          icon={DollarSign}
          iconColor="text-red-600"
          iconBg="bg-red-50"
        />
        <StatCard
          title="Dead Stock Items"
          value={totalCount}
          icon={AlertTriangle}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
        />
        <StatCard
          title="Critical (act now)"
          value={criticalCount}
          icon={AlertTriangle}
          iconColor="text-red-700"
          iconBg="bg-red-100"
        />
      </div>

      {/* Analysis table */}
      {(analyses as any[]).length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <AlertTriangle size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No dead stock detected.</p>
          <p className="text-gray-400 text-sm mt-1">All inventory has moved in the last 8 weeks.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(analyses as any[]).map((item: any) => {
            const actionCfg = ACTION_CONFIG[item.recommendedAction as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.monitor;
            const ActionIcon = actionCfg.icon;
            return (
              <div
                key={item.productId}
                className={clsx('bg-white rounded-xl border p-5', actionCfg.border)}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900 truncate">{item.productName}</p>
                      {item.expiryRisk !== 'none' && (
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-bold shrink-0', EXPIRY_BADGE[item.expiryRisk])}>
                          Expires {item.daysToExpiry}d
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span>{item.currentQuantity} units in stock</span>
                      <span>·</span>
                      <span>{item.weeksWithoutMovement} weeks dormant</span>
                      {item.estimatedValue > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-gray-700">SAR {item.estimatedValue.toLocaleString()} locked</span>
                        </>
                      )}
                    </div>
                    {/* Action reason */}
                    <p className="text-sm text-gray-600 mt-2">{item.actionReason}</p>
                  </div>

                  {/* Right: urgency + action */}
                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <div className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold', actionCfg.bg, actionCfg.color)}>
                      <ActionIcon size={14} />
                      {actionCfg.label}
                    </div>
                    <div className="w-32">
                      <p className="text-xs text-gray-400 mb-1 text-right">Urgency</p>
                      <UrgencyBar score={item.urgencyScore} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
        <strong>Dead stock criteria:</strong> Zero consumption for 8+ consecutive weekly snapshots with current quantity &gt; 0.
        <strong className="ml-2">Value estimate:</strong> Based on most recent supplier price snapshot.
        <strong className="ml-2">Urgency score:</strong> 0–100 combining expiry risk, weeks dormant, and locked capital.
      </div>
    </div>
  );
}
