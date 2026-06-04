import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, X, Loader2, RefreshCw, Package, TrendingDown,
  ArrowLeftRight, TrendingUp, AlertTriangle, Calendar,
  ThumbsUp, ThumbsDown, Clock, BarChart2,
} from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { aiApi } from '../../api/ai.api';
import { FullPageSpinner } from '../../components/ui/Spinner';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; labelKey: string; bg: string; border: string; iconColor: string }> = {
  reorder:            { icon: Package,       labelKey: 'ai.types.reorder',           bg: 'bg-red-50',    border: 'border-red-200',    iconColor: 'text-red-600' },
  price_comparison:   { icon: TrendingDown,  labelKey: 'ai.types.price_comparison',  bg: 'bg-cyan-50',   border: 'border-cyan-200',   iconColor: 'text-cyan-600' },
  alternative:        { icon: ArrowLeftRight,labelKey: 'ai.types.alternative',       bg: 'bg-violet-50', border: 'border-violet-200', iconColor: 'text-violet-600' },
  dead_stock_alert:   { icon: AlertTriangle, labelKey: 'ai.types.dead_stock_alert',  bg: 'bg-gray-50',   border: 'border-gray-300',   iconColor: 'text-gray-500' },
  consumption_spike:  { icon: TrendingUp,    labelKey: 'ai.types.consumption_spike', bg: 'bg-orange-50', border: 'border-orange-200', iconColor: 'text-orange-600' },
  forecast_alert:     { icon: BarChart2,     labelKey: 'ai.types.forecast_alert',    bg: 'bg-purple-50', border: 'border-purple-200', iconColor: 'text-purple-600' },
  reorder_schedule:   { icon: Calendar,      labelKey: 'ai.types.reorder_schedule',  bg: 'bg-blue-50',   border: 'border-blue-200',   iconColor: 'text-blue-600' },
  liquidation:        { icon: AlertTriangle, labelKey: 'ai.types.liquidation',       bg: 'bg-amber-50',  border: 'border-amber-200',  iconColor: 'text-amber-600' },
  insufficient_data:  { icon: AlertTriangle, labelKey: 'ai.types.reorder',           bg: 'bg-blue-50',   border: 'border-blue-200',   iconColor: 'text-blue-500' },
};
const RISK_BADGE: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700', MEDIUM: 'bg-orange-100 text-orange-700', LOW: 'bg-gray-100 text-gray-600',
};

function PayloadPanel({ type, payload }: { type: string; payload: any }) {
  const { t } = useTranslation();
  if (!payload) return null;
  const Row = ({ l, v, cls }: { l: string; v: string; cls?: string }) => (
    <div className={`flex justify-between rounded px-2 py-1 ${cls ?? 'bg-white/60'}`}>
      <span className="text-gray-500 text-xs">{l}</span>
      <span className="font-semibold text-gray-800 text-xs">{v}</span>
    </div>
  );
  if (type === 'reorder') return (
    <div className="grid grid-cols-2 gap-1.5">
      <Row l="Stock" v={`${payload.currentQuantity} units`} />
      <Row l="Days left" v={`~${payload.stockDays}d`} />
      <Row l="Reorder qty" v={`${payload.suggestedReorderQty} units`} />
      {payload.eoq && <Row l="EOQ qty" v={`${payload.eoq.eoqQty} units`} />}
      {payload.forecast && <Row l="14d forecast" v={`${payload.forecast.forecastedQty} units`} cls="bg-purple-50" />}
      {payload.demand?.trend !== 'stable' && <Row l="Trend" v={payload.demand.trend} cls="bg-orange-50" />}
      {payload.seasonality?.event && (
        <div className="col-span-2">
          <Row l={`🗓 ${payload.seasonality.source === 'hajj' ? t('ai.seasonal.hajj') : payload.seasonality.source === 'ramadan' ? t('ai.seasonal.ramadan') : t('ai.seasonal.school_return')}`}
               v={`${payload.seasonality.event} × ${payload.seasonality.multiplier?.toFixed(2) ?? '1.00'}`}
               cls="bg-indigo-50" />
        </div>
      )}
    </div>
  );
  if (type === 'forecast_alert') return (
    <div className="grid grid-cols-2 gap-1.5">
      <Row l="Forecast (14d)" v={`${payload.forecastedQty14d} units`} cls="bg-purple-50" />
      <Row l="Current pace" v={`${payload.currentTrend14d} units`} cls="bg-purple-50" />
      <div className="col-span-2"><Row l="Demand increase" v={`+${payload.increasePercent}%`} cls="bg-purple-100" /></div>
    </div>
  );
  if (type === 'reorder_schedule') return (
    <div className="grid grid-cols-2 gap-1.5">
      <Row l="Order by" v={payload.reorderByDate ? new Date(payload.reorderByDate).toLocaleDateString() : '-'} cls="bg-blue-50" />
      <Row l="Days left" v={`${payload.daysUntilReorderNeeded}d`} cls="bg-blue-50" />
      <Row l="Stockout risk" v={payload.predictedStockoutDate ? new Date(payload.predictedStockoutDate).toLocaleDateString() : '-'} cls="bg-red-50" />
      <Row l="Qty (EOQ)" v={`${payload.eoqQty} units`} cls="bg-blue-50" />
    </div>
  );
  if (type === 'consumption_spike') return (
    <div className="grid grid-cols-2 gap-1.5">
      <Row l="This week" v={`${payload.currentWeekQty} units`} cls="bg-orange-50" />
      <Row l="4-week avg" v={`${payload.avg4WeekQty} units`} cls="bg-orange-50" />
      <div className="col-span-2"><Row l="Above average" v={`+${payload.spikePercent}%`} cls="bg-orange-100" /></div>
    </div>
  );
  return null;
}

function FeedbackBtns({ id, score }: { id: string; score?: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fb = useMutation({
    mutationFn: (s: 1 | -1) => aiApi.submitFeedback(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-recs'] }),
  });
  return (
    <div className="flex gap-1">
      {([1, -1] as const).map((s) => (
        <button key={s} onClick={() => fb.mutate(s)} disabled={fb.isPending}
          title={s === 1 ? t('ai.feedback.helpful') : t('ai.feedback.not_helpful')}
          className={clsx('p-1.5 rounded-lg transition-colors', {
            'bg-green-100 text-green-600': score === 1 && s === 1,
            'bg-red-100 text-red-500':     score === -1 && s === -1,
            'text-gray-300 hover:text-green-500 hover:bg-green-50': s === 1 && score !== 1,
            'text-gray-300 hover:text-red-400 hover:bg-red-50':     s === -1 && score !== -1,
          })}>
          {s === 1 ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}
        </button>
      ))}
    </div>
  );
}

export default function AIRecommendationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ['ai-recs'] }), [qc]);

  const [jobId, setJobId]     = useState<string | null>(null);
  const [jobSt, setJobSt]     = useState<string | null>(null);
  const [jobErr, setJobErr]   = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const iv = setInterval(async () => {
      try {
        const r = await aiApi.getJobStatus(jobId);
        setJobSt(r.data.status);
        if (r.data.status === 'completed') { setJobId(null); invalidate(); }
        else if (r.data.status === 'failed') { setJobId(null); setJobErr(r.data.error ?? 'Failed'); }
      } catch { setJobId(null); setJobErr('Server error'); }
    }, 3000);
    return () => clearInterval(iv);
  }, [jobId, invalidate]);

  const { data, isLoading } = useQuery({
    queryKey: ['ai-recs'],
    queryFn: () => aiApi.getRecommendations().then((r) => r.data),
  });
  const generate = useMutation({
    mutationFn: () => aiApi.generate(),
    onSuccess: (r) => { setJobId(r.data.jobId); setJobSt('queued'); setJobErr(null); },
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => aiApi.dismiss(id),
    onSuccess: invalidate,
  });

  const riskLabel = (level: string) => t(`ai.risk.${level}`, { defaultValue: level });

  const recs: any[] = data || [];
  const active = recs.filter((r) => !r.isDismissed);
  // Separate insufficient_data from real recommendations
  const insufficientData = active.filter((r) => r.type === 'insufficient_data');
  const realRecs = active.filter((r) => r.type !== 'insufficient_data');
  const dismissed = recs.filter((r) => r.isDismissed);
  const isPolling = !!jobId;

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('ai.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{active.length} active · rules engine + GPT-4o-mini</p>
        </div>
        <button onClick={() => generate.mutate()} disabled={generate.isPending || isPolling}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors">
          {(generate.isPending || isPolling) ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {t('ai.generate')}
        </button>
      </div>

      {isPolling && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
          <Loader2 size={15} className="animate-spin shrink-0" />
          <span className="font-medium">{t('ai.analysing')}</span>
          <span className="text-blue-400 capitalize ml-1">{jobSt}</span>
        </div>
      )}
      {jobErr && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{jobErr}</div>}

      {/* Insufficient data banner */}
      {insufficientData.length > 0 && (
        <div className="px-4 py-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
          <div className="p-1.5 bg-blue-100 rounded-lg shrink-0 mt-0.5">
            <AlertTriangle size={15} className="text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-blue-800 text-sm">Getting Started — Limited Order History</p>
            <p className="text-sm text-blue-600 mt-0.5">{insufficientData[0]?.payload?.message}</p>
            {insufficientData[0]?.payload?.daysOfHistoryNeeded > 0 && (
              <p className="text-xs text-blue-400 mt-1">
                {insufficientData[0].payload.daysOfHistoryNeeded} more days of orders needed for AI demand forecasting.
              </p>
            )}
          </div>
        </div>
      )}

      {realRecs.length === 0 && insufficientData.length === 0 && !isPolling && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Sparkles size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">{t('ai.no_recommendations')}</p>
          <p className="text-sm text-gray-400 mt-1">Click "Generate New" to run the intelligence engine.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {realRecs.map((rec) => {
          const cfg = TYPE_CONFIG[rec.type] ?? TYPE_CONFIG.reorder;
          const Icon = cfg.icon;
          return (
            <div key={rec.id} className={clsx('rounded-xl border p-5 flex flex-col gap-3 hover:shadow-md transition-shadow', cfg.bg, cfg.border)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-white/70 shrink-0"><Icon size={14} className={cfg.iconColor} /></div>
                  <span className={clsx('text-xs font-bold uppercase tracking-wide truncate', cfg.iconColor)}>{t(cfg.labelKey)}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', RISK_BADGE[rec.riskLevel] ?? RISK_BADGE.LOW)}>{riskLabel(rec.riskLevel)}</span>
                  <button onClick={() => dismiss.mutate(rec.id)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg" title="Dismiss"><X size={13} /></button>
                </div>
              </div>

              {rec.product && <p className="font-semibold text-gray-900 text-sm">{rec.product.name}</p>}
              <p className="text-sm text-gray-700 leading-relaxed">{rec.explanation}</p>
              <PayloadPanel type={rec.type} payload={rec.payload} />

              {rec.confidence != null && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{t('ai.confidence')}</span>
                  <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
                    <div className={clsx('h-full rounded-full', { 'bg-green-500': rec.confidenceLabel === 'high', 'bg-yellow-400': rec.confidenceLabel === 'medium', 'bg-gray-400': rec.confidenceLabel === 'low' })}
                      style={{ width: `${Math.round(Number(rec.confidence) * 100)}%` }} />
                  </div>
                  <span className="font-medium capitalize">{rec.confidenceLabel}</span>
                </div>
              )}

              <div className="flex items-center justify-between mt-auto pt-2 border-t border-black/5">
                <span className="text-xs text-gray-400 flex items-center gap-1"><Clock size={11} />{new Date(rec.createdAt).toLocaleDateString()}</span>
                <FeedbackBtns id={rec.id} score={rec.feedbackScore} />
              </div>
            </div>
          );
        })}
      </div>

      {dismissed.length > 0 && (
        <details>
          <summary className="text-sm font-medium text-gray-400 cursor-pointer mb-3">Dismissed ({dismissed.length})</summary>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 opacity-40 mt-3">
            {dismissed.map((rec) => {
              const cfg = TYPE_CONFIG[rec.type] ?? TYPE_CONFIG.reorder;
              return (
                <div key={rec.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
                  <span className="text-xs font-bold text-gray-400 uppercase">{t(cfg.labelKey)}</span>
                  {rec.product && <p className="font-medium text-gray-700 text-sm">{rec.product.name}</p>}
                  <p className="text-xs text-gray-500 line-clamp-2">{rec.explanation}</p>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
