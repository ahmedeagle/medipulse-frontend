import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Plus, Trash2, Star, Search, ShieldCheck, Truck, Wallet, Building2,
  BadgeCheck, X, Network, Users, Loader2,
} from 'lucide-react';
import { connectionsApi } from '../../api/connections.api';
import { supplierApi, type SupplierMarketplaceCard } from '../../api/supplier.api';
import { Spinner } from '../../components/ui/Spinner';

interface Connection {
  id: string;
  supplierTenantId: string;
  priority?: number;
  notes?: string | null;
}

const REL: Record<string, string> = {
  high:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  medium: 'bg-teal-50 text-teal-700 ring-teal-200',
  low:    'bg-amber-50 text-amber-700 ring-amber-200',
};

export default function ConnectionsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const currency = t('common.currency');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ card: SupplierMarketplaceCard } | null>(null);
  const [form, setForm] = useState({ priority: 5, notes: '' });

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionsApi.list().then((r) => r.data as Connection[]),
  });

  const { data: marketplace = [] } = useQuery({
    queryKey: ['supplier-marketplace', 'connections'],
    queryFn: () => supplierApi.getMarketplace({ limit: 100 }).then((r) => r.data?.data ?? []),
  });

  const connect = useMutation({
    mutationFn: (payload: { supplierTenantId: string; priority: number; notes: string }) =>
      connectionsApi.connect(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setModal(null);
      setForm({ priority: 5, notes: '' });
    },
  });

  const disconnect = useMutation({
    mutationFn: (sid: string) => connectionsApi.disconnect(sid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });

  const cardByTenant = useMemo(() => {
    const m = new Map<string, SupplierMarketplaceCard>();
    for (const c of marketplace) m.set(c.supplierTenantId, c);
    return m;
  }, [marketplace]);

  const connectedIds = useMemo(() => new Set(connections.map((c) => c.supplierTenantId)), [connections]);

  const connectedList = useMemo(
    () =>
      connections
        .map((c) => ({ conn: c, card: cardByTenant.get(c.supplierTenantId) }))
        .sort((a, b) => (a.conn.priority ?? 99) - (b.conn.priority ?? 99)),
    [connections, cardByTenant],
  );

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return marketplace
      .filter((c) => !connectedIds.has(c.supplierTenantId))
      .filter((c) => !q || c.companyName?.toLowerCase().includes(q));
  }, [marketplace, connectedIds, search]);

  const avgReliability = useMemo(() => {
    const scores = connectedList
      .map((x) => x.card?.reliabilityScore)
      .filter((s): s is number => typeof s === 'number');
    if (!scores.length) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [connectedList]);

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6 pb-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('connections.title')}</h1>
          <p className="text-gray-500 text-sm mt-0.5 max-w-xl">{t('connections.subtitle')}</p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile icon={Network} label={t('connections.stat_connected')} value={String(connections.length)} tone="emerald" />
        <StatTile icon={ShieldCheck} label={t('connections.stat_avg_reliability')} value={avgReliability != null ? `${avgReliability}%` : '—'} tone="teal" />
        <StatTile icon={Users} label={t('connections.stat_available')} value={String(available.length)} tone="emerald" />
      </div>

      {/* Connected suppliers */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Star size={18} className="text-emerald-600" /> {t('connections.connected')}
          <span className="text-xs font-normal text-gray-400">({connections.length})</span>
        </h2>

        {connectedList.length === 0 ? (
          <EmptyState icon={Star} title={t('connections.empty_connected')} hint={t('connections.empty_connected_hint')} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {connectedList.map(({ conn, card }) => (
              <SupplierCard
                key={conn.id}
                card={card}
                fallbackId={conn.supplierTenantId}
                currency={currency}
                priority={conn.priority}
                notes={conn.notes}
                t={t}
                action={
                  <button
                    onClick={() => disconnect.mutate(conn.supplierTenantId)}
                    disabled={disconnect.isPending}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={14} /> {t('connections.disconnect')}
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Available to connect */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Building2 size={18} className="text-emerald-600" /> {t('connections.available')}
            <span className="text-xs font-normal text-gray-400">({available.length})</span>
          </h2>
          <div className="relative">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 text-gray-400 end-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('connections.search')}
              className="w-56 ps-3 pe-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {available.length === 0 ? (
          <EmptyState icon={BadgeCheck} title={t('connections.empty_available')} hint={t('connections.empty_available_hint')} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {available.map((card) => (
              <SupplierCard
                key={card.id}
                card={card}
                fallbackId={card.supplierTenantId}
                currency={currency}
                t={t}
                action={
                  <button
                    onClick={() => { setModal({ card }); setForm({ priority: 5, notes: '' }); }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                  >
                    <Plus size={14} /> {t('connections.connect')}
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Connect modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Building2 size={20} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{modal.card.companyName}</h3>
                  <p className="text-xs text-gray-400">{t('connections.add')}</p>
                </div>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('connections.priority')}</label>
              <input
                type="number" min={1} max={10}
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
              />
              <p className="text-xs text-gray-400 mt-1">{t('connections.priority_hint')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('connections.notes')}</label>
              <input
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={t('connections.notes_ph')}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => connect.mutate({ supplierTenantId: modal.card.supplierTenantId, priority: form.priority, notes: form.notes })}
                disabled={connect.isPending}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {connect.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {t('connections.connect')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── card ────────────────────────────────────────────────────────────────────

function SupplierCard({
  card, fallbackId, currency, priority, notes, action, t,
}: {
  card?: SupplierMarketplaceCard;
  fallbackId: string;
  currency: string;
  priority?: number;
  notes?: string | null;
  action: React.ReactNode;
  t: (k: string, o?: any) => string;
}) {
  const name = card?.companyName || fallbackId.slice(0, 8);
  const rel = card?.reliabilityLabel ? REL[card.reliabilityLabel] : null;
  return (
    <div className="rounded-xl border border-gray-200 p-4 hover:border-emerald-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Building2 size={18} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {priority != null && (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  <Star size={10} /> {t('connections.priority')} {priority}
                </span>
              )}
              {card?.verifiedAt && (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-teal-700">
                  <BadgeCheck size={11} /> {t('connections.verified')}
                </span>
              )}
            </div>
          </div>
        </div>
        {rel && (
          <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ring-1 ${rel}`}>
            {t(`connections.rel_${card!.reliabilityLabel}`)}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        {card?.minOrderAmount != null && (
          <span className="inline-flex items-center gap-1">
            <Wallet size={12} /> {t('connections.min_order')} {Math.round(card.minOrderAmount).toLocaleString('en-US')} {currency}
          </span>
        )}
        {card?.maxDeliveryDays != null && (
          <span className="inline-flex items-center gap-1">
            <Truck size={12} /> {t('connections.delivery_days', { count: card.maxDeliveryDays })}
          </span>
        )}
      </div>

      {notes && <p className="mt-2 text-xs text-gray-400 line-clamp-2">{notes}</p>}

      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
        {action}
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, tone }: { icon: typeof Network; label: string; value: string; tone: 'emerald' | 'teal' }) {
  const tones = { emerald: 'bg-emerald-50 text-emerald-600', teal: 'bg-teal-50 text-teal-600' };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon size={20} />
      </span>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: typeof Star; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300 ring-1 ring-gray-100">
        <Icon size={22} />
      </span>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {hint && <p className="text-xs text-gray-400 mt-1 max-w-[40ch]">{hint}</p>}
    </div>
  );
}
