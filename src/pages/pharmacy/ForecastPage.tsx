import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BarChart2, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { forecastingApi } from '../../api/forecasting.api';
import { inventoryApi } from '../../api/inventory.api';
import { Spinner } from '../../components/ui/Spinner';

const TREND_CONFIG = {
  increasing: { icon: TrendingUp,   color: 'text-green-600',  bg: 'bg-green-50',  label: 'Increasing' },
  stable:     { icon: Minus,        color: 'text-gray-500',   bg: 'bg-gray-50',   label: 'Stable' },
  decreasing: { icon: TrendingDown, color: 'text-red-500',    bg: 'bg-red-50',    label: 'Decreasing' },
} as const;

function HorizonCard({ forecast }: { forecast: any }) {
  const trend = TREND_CONFIG[forecast.trend as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.stable;
  const TrendIcon = trend.icon;
  const maxQty = Number(forecast.confidenceIntervalHigh) || Number(forecast.forecastedQty) * 1.5;
  const forecastPct = Math.round((Number(forecast.forecastedQty) / maxQty) * 100);
  const loPct       = Math.round((Number(forecast.confidenceIntervalLow) / maxQty) * 100);
  const hiPct       = Math.round((Number(forecast.confidenceIntervalHigh) / maxQty) * 100);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold text-gray-900">{forecast.horizonDays}d</p>
          <p className="text-xs text-gray-400 mt-0.5">horizon</p>
        </div>
        <div className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full', trend.bg)}>
          <TrendIcon size={14} className={trend.color} />
          <span className={clsx('text-xs font-medium', trend.color)}>{trend.label}</span>
        </div>
      </div>

      {/* Forecast quantity */}
      <div className="text-center">
        <p className="text-4xl font-bold text-gray-900">{Math.round(Number(forecast.forecastedQty))}</p>
        <p className="text-sm text-gray-400 mt-1">predicted units</p>
      </div>

      {/* Confidence interval visual */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-400 text-center">90% confidence interval</p>
        <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
          {/* CI band */}
          <div
            className="absolute h-full bg-blue-100 rounded-full"
            style={{ left: `${loPct}%`, width: `${hiPct - loPct}%` }}
          />
          {/* Point estimate */}
          <div
            className="absolute h-full w-1 bg-blue-600 rounded-full"
            style={{ left: `${forecastPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{Math.round(Number(forecast.confidenceIntervalLow))}</span>
          <span className="font-medium text-blue-600">{Math.round(Number(forecast.forecastedQty))}</span>
          <span>{Math.round(Number(forecast.confidenceIntervalHigh))}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">{Number(forecast.estimatedDailyDemand).toFixed(1)}</p>
          <p className="text-xs text-gray-400">units/day</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">{forecast.trainingDataPoints}</p>
          <p className="text-xs text-gray-400">data points</p>
        </div>
      </div>

      {/* Accuracy (if available) */}
      {forecast.mapeError != null && (
        <div className="text-center text-xs text-gray-400 pt-1 border-t border-gray-100">
          Historical accuracy: <span className="font-medium text-gray-700">{Math.round((1 - Number(forecast.mapeError)) * 100)}%</span>
        </div>
      )}
    </div>
  );
}

export default function ForecastPage() {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const { data: inventory = [], isLoading: loadingInventory } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => inventoryApi.getAll({ limit: 200 }).then((r) => r.data?.data ?? r.data),
  });

  const { data: forecasts = [], isLoading: loadingForecasts } = useQuery({
    queryKey: ['demand-forecast', selectedProductId],
    queryFn: () => forecastingApi.getDemandForecast(selectedProductId!).then((r) => r.data),
    enabled: !!selectedProductId,
  });

  const refresh = useMutation({
    mutationFn: () => forecastingApi.refreshForecasts(),
  });

  const products = (inventory as any[]).map((item: any) => item.product).filter(Boolean);
  const selectedProduct = products.find((p: any) => p.id === selectedProductId);

  if (loadingInventory) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demand Forecast</h1>
          <p className="text-gray-500 text-sm mt-1">
            Holt-Winters double exponential smoothing · 90% confidence intervals
          </p>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {refresh.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Refresh
        </button>
      </div>

      {/* Product selector */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-medium text-gray-700">Select a product to view its forecast</p>
        </div>
        <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
          {products.length === 0 && (
            <p className="px-4 py-8 text-center text-gray-400 text-sm">No inventory items found.</p>
          )}
          {products.map((product: any) => (
            <button
              key={product.id}
              onClick={() => setSelectedProductId(product.id)}
              className={clsx(
                'w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-blue-50',
                selectedProductId === product.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : '',
              )}
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{product.name}</p>
                <p className="text-xs text-gray-400">{product.category}</p>
              </div>
              <ChevronRight size={15} className="text-gray-300" />
            </button>
          ))}
        </div>
      </div>

      {/* Forecasts */}
      {selectedProductId && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BarChart2 size={18} className="text-blue-600" />
            <h2 className="font-semibold text-gray-800">
              {selectedProduct?.name ?? 'Product'} — Demand Forecast
            </h2>
          </div>

          {loadingForecasts ? (
            <Spinner />
          ) : forecasts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <BarChart2 size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">No forecast available yet.</p>
              <p className="text-gray-400 text-sm mt-1">
                Forecasts are computed weekly from consumption snapshots. At least 4 weeks of data are needed.
              </p>
              <button
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Compute Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(forecasts as any[]).map((f) => (
                <HorizonCard key={f.horizonDays} forecast={f} />
              ))}
            </div>
          )}

          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
            <strong>Algorithm:</strong> Holt-Winters Double Exponential Smoothing (α=0.4 level, β=0.15 trend).
            Seasonal component handled separately by the seasonality engine.
            Designed to upgrade to Prophet/ARIMA/LSTM when 12+ months of data is available — same interface, no consumer changes.
          </div>
        </div>
      )}
    </div>
  );
}
