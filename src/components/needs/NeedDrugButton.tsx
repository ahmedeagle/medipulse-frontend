import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Pill, Search, Loader2, CheckCircle2, Truck, Store,
  Sparkles, Clock, X, ListChecks, AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import {
  needsApi, type CreateNeedResult, type DrugNeed, type NeedUrgency, type NeedSnapshot,
} from '../../api/needs.api';

const EGP = (n: number) =>
  new Intl.NumberFormat('en-EG', { maximumFractionDigits: 2 }).format(n);

type Tab = 'new' | 'mine';

const URGENCY_OPTIONS: { value: NeedUrgency; ar: string; en: string; hintAr: string; hintEn: string }[] = [
  { value: 'normal',   ar: 'عادي',  en: 'Normal',   hintAr: '',                                hintEn: '' },
  { value: 'urgent',   ar: 'عاجل',  en: 'Urgent',   hintAr: '',                                hintEn: '' },
  { value: 'critical', ar: 'طارئ',  en: 'Critical', hintAr: 'يوصل للصيدليات القريبة فوراً',     hintEn: 'reaches nearby pharmacies instantly' },
];

const STATUS_STYLE: Record<DrugNeed['status'], { ar: string; en: string; cls: string }> = {
  open:      { ar: 'قيد البحث',  en: 'Searching', cls: 'bg-amber-50 text-amber-700' },
  sourced:   { ar: 'تم الإيجاد', en: 'Sourced',   cls: 'bg-emerald-50 text-emerald-700' },
  fulfilled: { ar: 'تم الشراء',  en: 'Fulfilled', cls: 'bg-teal-50 text-teal-700' },
  cancelled: { ar: 'ملغي',       en: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
  expired:   { ar: 'منتهي',      en: 'Expired',   cls: 'bg-gray-100 text-gray-500' },
};

function SourcesResult({ snapshot, isRTL }: { snapshot: NeedSnapshot; isRTL: boolean }) {
  if (!snapshot.splits.length) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex gap-2">
        <Clock size={18} className="shrink-0 mt-0.5" />
        <span>
          {isRTL
            ? 'مفيش مصدر متاح دلوقتي — سجّلنا طلبك وهننبّهك أول ما يتوفّر.'
            : 'No source available right now — we saved your request and will alert you once it’s available.'}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {snapshot.bestUnitPrice != null && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {isRTL ? 'أفضل سعر' : 'Best price'} {EGP(snapshot.bestUnitPrice)} {isRTL ? 'ج.م' : 'EGP'}
          </span>
        )}
        {snapshot.savedVsHistoricalAvg != null && snapshot.savedVsHistoricalAvg > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
            <Sparkles size={13} /> {isRTL ? 'وفّرت' : 'You save'} {EGP(snapshot.savedVsHistoricalAvg)} {isRTL ? 'ج.م' : 'EGP'}
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
        {snapshot.splits.map((s, i) => {
          const isPharmacy = s.source === 'p2p';
          return (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className={clsx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                isPharmacy ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600',
              )}>
                {isPharmacy ? <Store size={17} /> : <Truck size={17} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{s.sourceName}</p>
                <p className="truncate text-xs text-gray-500">
                  {isPharmacy ? (isRTL ? 'صيدلية قريبة' : 'Nearby pharmacy') : (isRTL ? 'موزّع' : 'Distributor')}
                  {s.reason ? ` · ${s.reason}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm font-bold text-gray-900">{EGP(s.unitPrice)} <span className="text-xs font-normal text-gray-400">{isRTL ? 'ج.م' : 'EGP'}</span></p>
                <p className="text-xs text-gray-500">× {s.qty}</p>
              </div>
            </div>
          );
        })}
      </div>

      {snapshot.delayReason && (
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">{snapshot.delayReason}</div>
      )}
    </div>
  );
}

function NewNeedForm({ onSourced }: { onSourced: () => void }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const qc = useQueryClient();

  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState(1);
  const [urgency, setUrgency] = useState<NeedUrgency>('normal');
  const [result, setResult] = useState<CreateNeedResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => needsApi.create({ productName: productName.trim(), requestedQty: qty, urgency }),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['my-needs'] });
      onSourced();
    },
  });

  if (result) {
    const snap = result.need.resultSnapshot;
    const sourced = result.need.status === 'sourced';
    return (
      <div className="space-y-4">
        <div className={clsx(
          'flex items-start gap-2 rounded-xl p-4 text-sm',
          sourced ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800',
        )}>
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>
            {sourced
              ? (isRTL ? `لقينالك ${result.need.sourceOptionsCount} مصدر للدواء «${result.need.productName}».` : `Found ${result.need.sourceOptionsCount} source(s) for “${result.need.productName}”.`)
              : (isRTL ? 'تم تسجيل طلبك. هنبحث وننبّهك فور توفّره. تابعه من «طلباتي».' : 'Request saved. We’ll search and alert you. Track it under “My Requests”.')}
          </span>
        </div>

        {snap && <SourcesResult snapshot={snap} isRTL={isRTL} />}

        <button
          onClick={() => { setResult(null); setProductName(''); setQty(1); setUrgency('normal'); }}
          className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          {isRTL ? 'طلب دواء آخر' : 'Request another drug'}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (productName.trim()) mutation.mutate(); }}
      className="space-y-4"
    >
      <p className="text-sm text-gray-500 leading-relaxed">
        {isRTL
          ? 'اكتب اسم الدواء والكمية، وهنبحثلك فوراً عن أفضل مصدر (موزّع أو صيدلية قريبة) بأفضل سعر. لو مفيش حد عنده دلوقتي، هنسجّل طلبك وننبّهك أول ما يتوفّر.'
          : 'Type the drug name and quantity — we’ll instantly find the best source (distributor or nearby pharmacy) at the best price. If none is available now, we’ll save your request and alert you.'}
      </p>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-600">{isRTL ? 'اسم الدواء' : 'Drug name'}</label>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400 start-3" />
          <input
            autoFocus
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder={isRTL ? 'اكتب اسم الدواء أو الباركود' : 'Drug name or barcode'}
            className="w-full rounded-xl border border-gray-200 py-2.5 ps-9 pe-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-600">{isRTL ? 'الكمية (كام علبة؟)' : 'Quantity'}</label>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          className="w-full rounded-xl border border-gray-200 py-2.5 px-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-600">{isRTL ? 'الاستعجال' : 'Urgency'}</label>
        <div className="grid grid-cols-3 gap-2">
          {URGENCY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setUrgency(o.value)}
              className={clsx(
                'rounded-xl border py-2 text-sm font-semibold transition-colors',
                urgency === o.value
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {isRTL ? o.ar : o.en}
            </button>
          ))}
        </div>
        {urgency === 'critical' && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-600">
            <AlertTriangle size={12} /> {isRTL ? URGENCY_OPTIONS[2].hintAr : URGENCY_OPTIONS[2].hintEn}
          </p>
        )}
      </div>

      {mutation.isError && (
        <p className="text-xs text-rose-600">{isRTL ? 'حصل خطأ، حاول تاني.' : 'Something went wrong, please retry.'}</p>
      )}

      <button
        type="submit"
        disabled={!productName.trim() || mutation.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {mutation.isPending
          ? <><Loader2 size={16} className="animate-spin" /> {isRTL ? 'بنبحثلك...' : 'Searching...'}</>
          : <><Search size={16} /> {isRTL ? 'دوّرلي على أفضل مصدر' : 'Find the best source'}</>}
      </button>
    </form>
  );
}

function MyNeeds() {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-needs'],
    queryFn: () => needsApi.list(),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => needsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-needs'] }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-gray-400" /></div>;
  }

  if (!data?.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-gray-400">
        <ListChecks size={28} className="text-gray-300" />
        {isRTL ? 'لسه مفيش طلبات. اطلب أول دواء من تبويب «طلب جديد».' : 'No requests yet. Submit your first from “New request”.'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {data.map((n) => {
        const st = STATUS_STYLE[n.status];
        const canCancel = n.status === 'open' || n.status === 'sourced';
        return (
          <div key={n.id} className="rounded-xl border border-gray-100 p-3">
            <div className="flex items-center gap-2">
              <Pill size={16} className="shrink-0 text-emerald-600" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{n.productName}</p>
              <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-bold', st.cls)}>{isRTL ? st.ar : st.en}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
              <span>
                {isRTL ? 'الكمية' : 'Qty'}: {n.requestedQty}
                {n.sourceOptionsCount > 0 && ` · ${n.sourceOptionsCount} ${isRTL ? 'مصدر' : 'sources'}`}
                {n.resultSnapshot?.bestUnitPrice != null && ` · ${EGP(n.resultSnapshot.bestUnitPrice)} ${isRTL ? 'ج.م' : 'EGP'}`}
              </span>
              {canCancel && (
                <button
                  onClick={() => cancelMutation.mutate(n.id)}
                  disabled={cancelMutation.isPending}
                  className="inline-flex items-center gap-1 text-rose-500 hover:text-rose-700 disabled:opacity-50"
                >
                  <X size={12} /> {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NeedDrugButton() {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('new');

  return (
    <>
      <button
        onClick={() => { setTab('new'); setOpen(true); }}
        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-2.5 sm:px-3.5 py-2 text-sm font-bold text-white shadow-sm transition-all hover:from-emerald-700 hover:to-teal-700 shrink-0"
        title={isRTL ? 'أحتاج دواء' : 'I need a drug'}
      >
        <Pill size={16} />
        <span className="hidden sm:inline whitespace-nowrap">{isRTL ? 'أحتاج دواء' : 'I Need a Drug'}</span>
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={isRTL ? 'أحتاج دواء غير متوفر عندك؟' : 'Need a drug you’re out of?'}
        size="md"
      >
        <div className="p-6 pt-4">
          <div className="mb-4 flex gap-1 rounded-xl bg-gray-50 p-1">
            <button
              onClick={() => setTab('new')}
              className={clsx('flex-1 rounded-lg py-2 text-sm font-semibold transition-colors', tab === 'new' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500')}
            >
              {isRTL ? 'طلب جديد' : 'New request'}
            </button>
            <button
              onClick={() => setTab('mine')}
              className={clsx('flex-1 rounded-lg py-2 text-sm font-semibold transition-colors', tab === 'mine' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500')}
            >
              {isRTL ? 'طلباتي' : 'My requests'}
            </button>
          </div>

          {tab === 'new' ? <NewNeedForm onSourced={() => {}} /> : <MyNeeds />}
        </div>
      </Modal>
    </>
  );
}
