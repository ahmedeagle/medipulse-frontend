import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Rocket, CheckCircle2, Circle, AlertCircle, Upload, Database,
  Users, BookOpen, ArrowUpRight, Sparkles, Plus, Trash2, Info,
} from 'lucide-react';
import clsx from 'clsx';

import { onboardingApi, type OnboardingChecklist, type SeedConsumptionItem } from '../../api/onboarding.api';
import { Modal } from '../../components/ui/Modal';

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
//
// "Are we live yet?" hub for new pharmacies. Combines the backend
// /pharmacy/onboarding/checklist signal with shortcut entry-points to:
//   - Data Migration (Excel/CSV upload)
//   - Catalog Requests (resolve unmatched SKUs)
//   - Seed Consumption (skip 28-day AI cold start)
//
// Designed for non-technical pharmacy admins: every action has a one-line
// explanation in Arabic + English, every status has a colored chip, and
// the "AI ready" green check is the celebratory north star.

export default function OnboardingHubPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [seedOpen, setSeedOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery<OnboardingChecklist>({
    queryKey: ['onboarding', 'checklist'],
    queryFn:  () => onboardingApi.getChecklist(),
    staleTime: 30_000,
  });

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-44 bg-gray-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const completedSteps = data.nextSteps.filter((s) => s.severity === 'done').length;
  const totalSteps = data.nextSteps.length;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
            <Rocket className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {isAr ? 'مرحباً بك في MediPulse' : 'Welcome to MediPulse'}
            </h1>
            <p className="mt-1 text-sm text-gray-600 max-w-xl">
              {isAr
                ? 'هذه الصفحة تساعدك على نقل بيانات صيدليتك القديمة وتفعيل الذكاء الاصطناعي خطوة بخطوة. كل خطوة لها زر مباشر — لا حاجة لمعرفة تقنية.'
                : 'This page walks you through migrating your legacy pharmacy data and turning on the AI step-by-step. Every step has a direct button — no technical knowledge required.'}
            </p>

            {/* Progress bar */}
            <div className="mt-4 max-w-md">
              <div className="flex items-center justify-between text-xs font-medium text-gray-600 mb-1">
                <span>{isAr ? 'تقدّم الإعداد' : 'Setup progress'}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>

          {data.aiReady ? (
            <div className="hidden sm:flex flex-col items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-700">
              <Sparkles className="h-5 w-5" />
              <span className="text-xs font-semibold">{isAr ? 'الذكاء جاهز' : 'AI ready'}</span>
            </div>
          ) : (
            <div className="hidden sm:flex flex-col items-center gap-1 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800">
              <AlertCircle className="h-5 w-5" />
              <span className="text-xs font-semibold">
                {isAr ? `الذكاء يتعلّم (${data.consumptionWeeksCovered}/4)` : `AI warming up (${data.consumptionWeeksCovered}/4)`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Stat strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Database className="h-4 w-4" />}
          label={isAr ? 'أصناف في المخزون' : 'Inventory items'}
          value={data.inventoryItemsCount.toLocaleString('en-US')}
          hint={
            data.inventoryUnlinkedCount > 0
              ? (isAr ? `أدخل ${data.inventoryUnlinkedCount} يحتاج مراجعة` : `${data.inventoryUnlinkedCount} need review`)
              : (isAr ? 'كل الأصناف مرتبطة' : 'All items linked')
          }
          tone={data.inventoryItemsCount === 0 ? 'amber' : data.inventoryUnlinkedCount > 0 ? 'amber' : 'emerald'}
        />
        <StatTile
          icon={<Sparkles className="h-4 w-4" />}
          label={isAr ? 'تاريخ المبيعات' : 'Consumption history'}
          value={`${data.consumptionWeeksCovered} ${isAr ? 'أسبوع' : 'wk'}`}
          hint={data.aiReady ? (isAr ? 'يكفي لتفعيل التوقّعات' : 'enough for forecasts') : (isAr ? 'يحتاج 4 أسابيع' : 'need 4 weeks')}
          tone={data.aiReady ? 'emerald' : 'amber'}
        />
        <StatTile
          icon={<BookOpen className="h-4 w-4" />}
          label={isAr ? 'طلبات كتالوج مفتوحة' : 'Open catalog requests'}
          value={data.catalogRequestsOpenCount.toLocaleString('en-US')}
          hint={
            data.catalogRequestsOpenCount === 0
              ? (isAr ? 'لا يوجد ما ينتظر' : 'nothing pending')
              : (isAr ? 'بانتظار قرار الإدارة' : 'awaiting admin')
          }
          tone={data.catalogRequestsOpenCount > 0 ? 'sky' : 'emerald'}
        />
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label={isAr ? 'موردون متاحون' : 'Suppliers available'}
          value={data.suppliersAvailableCount.toLocaleString('en-US')}
          hint={
            data.suppliersAvailableCount === 0
              ? (isAr ? 'تواصل مع الدعم' : 'contact support')
              : (isAr ? 'جاهز للشراء' : 'ready to order')
          }
          tone={data.suppliersAvailableCount === 0 ? 'red' : 'emerald'}
        />
      </div>

      {/* ── Action cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ActionCard
          icon={<Upload className="h-5 w-5" />}
          tone="emerald"
          to="/pharmacy/migration"
          title={isAr ? '1. ارفع المخزون من نظامك القديم' : '1. Upload inventory from your old system'}
          desc={
            isAr
              ? 'ادعم ملفات Excel أو CSV — النظام يطابق المنتجات تلقائياً مع الكتالوج المركزي ويخبرك بما يحتاج مراجعة.'
              : 'Supports Excel / CSV. The system auto-matches products against the central catalog and flags rows that need review.'
          }
          cta={isAr ? 'افتح مساعد النقل' : 'Open migration assistant'}
          status={data.inventoryItemsCount > 0 ? 'done' : 'todo'}
        />

        <ActionCard
          icon={<BookOpen className="h-5 w-5" />}
          tone="emerald"
          to="/pharmacy/catalog-requests"
          title={isAr ? '2. راجع الأصناف غير المتطابقة' : '2. Resolve unmatched items'}
          desc={
            isAr
              ? `${data.inventoryUnlinkedCount} صنف لم يتطابق تلقائياً. يمكنك إرسالها جميعاً للمراجعة بنقرة واحدة، وفريق الكتالوج يرد عليك.`
              : `${data.inventoryUnlinkedCount} items did not auto-match. You can submit them all for review in one click — the catalog team will respond.`
          }
          cta={isAr ? 'افتح طلبات الكتالوج' : 'Open catalog requests'}
          status={
            data.inventoryUnlinkedCount === 0 ? 'done'
            : data.catalogRequestsOpenCount > 0 ? 'in_progress'
            : 'todo'
          }
        />

        <ActionCard
          icon={<Sparkles className="h-5 w-5" />}
          tone="emerald"
          onClick={() => setSeedOpen(true)}
          title={isAr ? '3. فعّل الذكاء الاصطناعي فوراً' : '3. Unlock AI immediately'}
          desc={
            isAr
              ? 'بدلاً من انتظار 28 يوم، أدخل تاريخ مبيعات آخر 4 أسابيع من نظامك القديم وستحصل على توقّعات شراء حقيقية اليوم.'
              : 'Skip the 28-day cold start. Paste 4 weeks of historical sales from your legacy ERP and the AI will produce real forecasts today.'
          }
          cta={isAr ? 'أدخل بيانات المبيعات' : 'Seed consumption data'}
          status={data.aiReady ? 'done' : 'recommended'}
        />
      </div>

      {/* ── Checklist ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">
            {isAr ? 'قائمة الخطوات' : 'Setup checklist'}
          </h2>
          <span className="ms-auto text-xs text-gray-400 tabular-nums">
            {completedSteps}/{totalSteps}
          </span>
        </div>
        <ul className="divide-y divide-gray-100">
          {data.nextSteps.map((step) => {
            const isDone = step.severity === 'done';
            const isTodo = step.severity === 'todo';
            return (
              <li
                key={step.key}
                className="flex items-center gap-3 px-5 sm:px-6 py-3.5 text-sm hover:bg-gray-50/60 transition-colors"
              >
                <div className={clsx(
                  'shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
                  isDone ? 'bg-emerald-100' : isTodo ? 'bg-amber-100' : 'bg-sky-100',
                )}>
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : isTodo ? (
                    <Circle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <Info className="h-4 w-4 text-sky-600" />
                  )}
                </div>
                <span className={clsx(
                  'leading-relaxed flex-1',
                  isDone ? 'text-gray-500 line-through decoration-emerald-300' : 'text-gray-800',
                )}>
                  {isAr ? step.titleAr : step.titleEn}
                </span>
                {!isDone && (
                  <span className={clsx(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide',
                    isTodo ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700',
                  )}>
                    {isTodo
                      ? (isAr ? 'التالي' : 'Next')
                      : (isAr ? 'اختياري' : 'Optional')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <SeedConsumptionModal
        open={seedOpen}
        onClose={() => { setSeedOpen(false); refetch(); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatTile(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: 'emerald' | 'amber' | 'sky' | 'red';
}) {
  const toneIcon: Record<typeof props.tone, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    sky:     'bg-sky-50 text-sky-600',
    red:     'bg-red-50 text-red-600',
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', toneIcon[props.tone])}>
          {props.icon}
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{props.label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{props.value}</div>
      <div className="mt-1 text-xs text-gray-500">{props.hint}</div>
    </div>
  );
}

function ActionCard(props: {
  icon: React.ReactNode;
  tone: 'violet' | 'sky' | 'emerald';
  to?: string;
  onClick?: () => void;
  title: string;
  desc: string;
  cta: string;
  status: 'done' | 'todo' | 'in_progress' | 'recommended';
}) {
  // All cards use the same emerald icon — white card / green icon, matching
  // the rest of the pharmacy pages. The `tone` prop is preserved for API
  // compatibility but no longer drives color.
  void props.tone;
  const accent = 'bg-emerald-50 text-emerald-600';
  const statusBadge: Record<typeof props.status, { label: string; cls: string }> = {
    done:        { label: '✓',    cls: 'bg-emerald-100 text-emerald-700' },
    todo:        { label: 'ابدأ', cls: 'bg-amber-100 text-amber-700' },
    in_progress: { label: '…',    cls: 'bg-sky-100 text-sky-700' },
    recommended: { label: '⭐',    cls: 'bg-emerald-100 text-emerald-700' },
  };

  const inner = (
    <div className="group h-full flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition">
      <div className="flex items-start justify-between gap-2">
        <div className={clsx('flex h-10 w-10 items-center justify-center rounded-lg', accent)}>
          {props.icon}
        </div>
        <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', statusBadge[props.status].cls)}>
          {statusBadge[props.status].label}
        </span>
      </div>
      <h3 className="mt-3 text-base font-semibold text-gray-900">{props.title}</h3>
      <p className="mt-1 text-sm text-gray-600 leading-relaxed flex-1">{props.desc}</p>
      <div className="mt-4 flex items-center gap-1 text-sm font-medium text-gray-700 group-hover:text-gray-900">
        {props.cta}
        <ArrowUpRight className="h-4 w-4" />
      </div>
    </div>
  );

  if (props.to) return <Link to={props.to}>{inner}</Link>;
  return <button type="button" onClick={props.onClick} className="text-start">{inner}</button>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed Consumption modal — pasteable table
// ─────────────────────────────────────────────────────────────────────────────

interface SeedRow {
  productId: string;
  /** Weekly quantities, oldest-to-newest (w4 = 4 weeks ago, w1 = last week). Reversed before send. */
  w4: string;
  w3: string;
  w2: string;
  w1: string;
}

function SeedConsumptionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const qc = useQueryClient();
  const [rows, setRows] = useState<SeedRow[]>([
    { productId: '', w4: '', w3: '', w2: '', w1: '' },
  ]);
  const [result, setResult] = useState<{ inserted: number; skipped: number; productsSeeded: number } | null>(null);

  const seedMutation = useMutation({
    mutationFn: (items: SeedConsumptionItem[]) => onboardingApi.seedConsumption(items, true),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['onboarding', 'checklist'] });
    },
  });

  const parsed = useMemo(() => {
    const items: SeedConsumptionItem[] = [];
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const weekStrings = [r.w4, r.w3, r.w2, r.w1];
      const hasAnyQty = weekStrings.some((s) => s.trim() !== '');
      if (!r.productId.trim() && !hasAnyQty) continue;
      const idOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.productId.trim());
      if (!idOk) {
        errors.push(`${isAr ? 'سطر' : 'Row'} ${i + 1}: ${isAr ? 'معرّف المنتج غير صالح (UUID)' : 'invalid productId (UUID)'}`);
        continue;
      }
      const qtys = weekStrings.map((s) => Number(s.trim() === '' ? 0 : s));
      if (qtys.some((n) => !Number.isFinite(n) || n < 0)) {
        errors.push(`${isAr ? 'سطر' : 'Row'} ${i + 1}: ${isAr ? 'كميات غير صالحة' : 'invalid quantities'}`);
        continue;
      }
      if (qtys.every((n) => n === 0)) {
        errors.push(`${isAr ? 'سطر' : 'Row'} ${i + 1}: ${isAr ? 'أدخل كمية أسبوع واحد على الأقل' : 'enter at least one week quantity'}`);
        continue;
      }
      // UI is oldest → newest (w4..w1); backend wants newest → oldest.
      items.push({ productId: r.productId.trim(), weeklyQty: [...qtys].reverse() });
    }
    return { items, errors };
  }, [rows, isAr]);

  const canSubmit = parsed.items.length > 0 && parsed.errors.length === 0 && !seedMutation.isPending;

  // Sticky action bar — rendered via Modal's `footer` slot so primary actions
  // never get clipped on shorter laptop viewports.
  const footerNode = !result ? (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-gray-600">
        {isAr
          ? `${parsed.items.length} منتج جاهز للحفظ`
          : `${parsed.items.length} products ready to save`}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {isAr ? 'إلغاء' : 'Cancel'}
        </button>
        <button
          onClick={() => seedMutation.mutate(parsed.items)}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="h-4 w-4" />
          {seedMutation.isPending
            ? (isAr ? 'جارٍ الحفظ…' : 'Saving…')
            : (isAr ? 'فعّل الذكاء الاصطناعي' : 'Unlock AI')}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isAr ? 'تفعيل الذكاء الاصطناعي بتاريخ المبيعات (اختياري)' : 'Unlock AI with historical sales (optional)'}
      size="xl"
      footer={footerNode}
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 mb-2" />
            <h3 className="text-lg font-semibold">{isAr ? 'تم بنجاح' : 'Done'}</h3>
            <p className="mt-1 text-sm">
              {isAr
                ? `أُدخل ${result.inserted} سجل أسبوعي لـ ${result.productsSeeded} منتج (تم تخطّي ${result.skipped} موجود مسبقاً).`
                : `Inserted ${result.inserted} weekly rows for ${result.productsSeeded} products (skipped ${result.skipped} pre-existing).`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {isAr ? 'تم' : 'Close'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Optional badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
              <Info className="h-3.5 w-3.5" />
              {isAr ? 'اختياري — لكنه يوفّر عليك 28 يوم انتظار' : 'Optional — but skips the 28-day cold start'}
            </span>
          </div>

          {/* Explainer */}
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 flex gap-2">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="leading-relaxed">
              <div className="font-semibold mb-1">{isAr ? 'لماذا هذه الخطوة؟' : 'Why this step?'}</div>
              <p>
                {isAr
                  ? 'افتراضياً، يحتاج الذكاء الاصطناعي إلى 28 يوم من المبيعات الفعلية قبل أن يبدأ في توقّع طلبات الشراء بدقة. إذا أدخلت تاريخ آخر 4 أسابيع لأهم منتجاتك الآن، ستحصل على توقّعات حقيقية اليوم — لا تنتظر.'
                  : 'By default the AI needs 28 days of real sales before it can forecast purchase orders accurately. Paste the last 4 weeks for your top-selling products now, and you get real forecasts today — no waiting.'}
              </p>
              <p className="mt-1 text-xs text-sky-800/80">
                {isAr
                  ? 'لا تحتاج إدخال كل المنتجات — ابدأ بـ 10-20 من الأكثر مبيعاً يكفي.'
                  : 'No need to enter every product — 10–20 top sellers is enough.'}
              </p>
            </div>
          </div>

          {/* Help link */}
          <div className="flex items-center gap-1.5 text-xs">
            <Info className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-gray-500">
              {isAr ? 'لا تعرف معرّف المنتج؟' : "Don't know the productId?"}
            </span>
            <Link
              to="/pharmacy/inventory"
              className="font-semibold text-emerald-600 hover:text-emerald-700 underline"
              onClick={onClose}
            >
              {isAr ? 'انسخه من شاشة المخزون' : 'Copy it from the Inventory screen'}
            </Link>
          </div>

          {/* Rows */}
          <div className="space-y-3 max-h-[40vh] overflow-y-auto pe-1">
            {rows.map((row, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 w-6 tabular-nums">{i + 1}.</span>
                  <input
                    type="text"
                    value={row.productId}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...next[i], productId: e.target.value };
                      setRows(next);
                    }}
                    placeholder={isAr ? 'الصق معرّف المنتج (UUID)' : 'Paste productId (UUID)'}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                    className="shrink-0 w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-red-600 hover:border-red-200 flex items-center justify-center"
                    aria-label={isAr ? 'حذف' : 'Delete'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { key: 'w4' as const, ar: 'قبل 4 أسابيع', en: '4 wks ago' },
                    { key: 'w3' as const, ar: 'قبل 3 أسابيع', en: '3 wks ago' },
                    { key: 'w2' as const, ar: 'قبل أسبوعين', en: '2 wks ago' },
                    { key: 'w1' as const, ar: 'الأسبوع الماضي', en: 'Last week' },
                  ]).map(({ key, ar, en }) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {isAr ? ar : en}
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={row[key]}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...next[i], [key]: e.target.value };
                          setRows(next);
                        }}
                        placeholder="0"
                        className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-center tabular-nums focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {parsed.errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <ul className="space-y-1 list-disc list-inside">
                {parsed.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => setRows([...rows, { productId: '', w4: '', w3: '', w2: '', w1: '' }])}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            <Plus className="h-4 w-4" /> {isAr ? 'أضف منتج آخر' : 'Add another product'}
          </button>

        </div>
      )}
    </Modal>
  );
}
