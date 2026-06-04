import { useQuery } from '@tanstack/react-query';
import { TrendingUp, ShieldCheck, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { profileApi } from '../../api/profile.api';
import { Spinner } from '../../components/ui/Spinner';

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-50',    border: 'border-red-200',   badge: 'bg-red-100 text-red-700',   label: 'Critical',  dot: 'bg-red-500' },
  high:     { bg: 'bg-orange-50', border: 'border-orange-200',badge: 'bg-orange-100 text-orange-700',label:'High',    dot: 'bg-orange-500' },
  medium:   { bg: 'bg-yellow-50', border: 'border-yellow-200',badge: 'bg-yellow-100 text-yellow-700',label:'Medium',  dot: 'bg-yellow-400' },
} as const;

export default function DemandSignalsPage() {
  const { t } = useTranslation();

  const { data: signals = [] as any[], isLoading } = useQuery<any[]>({
    queryKey: ['demand-signals'],
    queryFn: () => profileApi.getDemandSignals().then((r) => r.data),
    refetchInterval: 5 * 60_000, // refresh every 5 minutes
  });

  if (isLoading) return <Spinner />;

  const byCategory = signals.reduce((acc: Record<string, any[]>, s: any) => {
    const cat = s.category ?? 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('supplier.demand_signals')}</h1>
        <p className="text-gray-500 text-sm mt-1">Shortages detected in your delivery zones — updated every 5 minutes.</p>
      </div>

      {/* Privacy notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck size={18} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-700">
          <strong>Fully anonymized.</strong> This data shows product shortages aggregated across pharmacies in your delivery zones.
          No pharmacy names, IDs, or individual data are disclosed. Only product category, severity, and region count are shown.
        </div>
      </div>

      {signals.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <TrendingUp size={36} className="mx-auto mb-3 text-green-400" />
          <p className="text-gray-500 font-medium">No shortages detected in your delivery zones.</p>
          <p className="text-gray-400 text-sm mt-1">
            Make sure your supplier profile has delivery zones configured.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {(Object.entries(byCategory) as [string, any[]][]).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 capitalize">{category}</h2>
              <div className="space-y-3">
                {items.map((signal: any) => {
                  const cfg = SEVERITY_CONFIG[signal.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.medium;
                  return (
                    <div key={signal.productId} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex items-center gap-4`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{signal.productName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {signal.regionCount} region{signal.regionCount !== 1 ? 's' : ''} affected
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">{signal.affectedCount}</p>
                          <p className="text-xs text-gray-400">pharmacies</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Info size={12} />
        Severity: Critical = 5+ pharmacies, High = 2+, Medium = 1
      </div>
    </div>
  );
}
