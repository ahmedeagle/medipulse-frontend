import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Clock, AlertTriangle, DollarSign, Package } from 'lucide-react'
import clsx from 'clsx'
import { DomainShell } from '../components/DomainShell'
import { ReportShell } from '../components/ReportShell'
import { ReportBuilder } from '../components/ReportBuilder'
import { SummaryView } from '../components/views/SummaryView'
import { TrendView } from '../components/views/TrendView'
import { TableView } from '../components/views/TableView'
import { RankingView } from '../components/views/RankingView'
import { inventoryApi } from '../../../../api/inventory.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import { useSearchParams } from 'react-router-dom'
import type { Insight } from '../components/views/InsightPanel'

type InvItem = {
  id: string; quantity: number; costPrice?: number; expiryDate?: string
  product?: { name?: string; nameAr?: string; category?: string }
}
type ExpiryRow = InvItem & { daysLeft: number; displayName: string }

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />
      ))}
    </div>
  )
}

export default function ExpiryIntelligencePage() {
  const { fmt } = useCurrency()
  const [params] = useSearchParams()
  const daysFilter = Number(params.get('days') ?? 90)

  const { data: invData, isLoading, isError } = useQuery({
    queryKey: ['expiry-report'],
    queryFn: async () => {
      const PAGE = 200
      let offset = 0
      const all: unknown[] = []
      while (true) {
        const r: any = await inventoryApi.getAll({ limit: PAGE, offset })
        const page: unknown[] = r.data?.data ?? r.data ?? []
        all.push(...page)
        if (page.length < PAGE) break
        offset += PAGE
      }
      return all
    },
  })

  const withExpiry: ExpiryRow[] = useMemo(() => {
    const list: InvItem[] = Array.isArray(invData) ? invData as InvItem[] : []
    return list
      .filter(i => i.expiryDate)
      .map(i => ({
        ...i,
        daysLeft: daysUntil(i.expiryDate!),
        displayName: i.product?.nameAr ?? i.product?.name ?? '—',
      }))
      .filter(i => i.daysLeft <= daysFilter)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [invData, daysFilter])

  const kpis = useMemo(() => ({
    expired:     withExpiry.filter(i => i.daysLeft < 0).length,
    within30:    withExpiry.filter(i => i.daysLeft >= 0 && i.daysLeft <= 30).length,
    within90:    withExpiry.filter(i => i.daysLeft > 30 && i.daysLeft <= 90).length,
    atRiskValue: withExpiry.filter(i => i.daysLeft <= 30).reduce((s, i) => s + i.quantity * Number(i.costPrice ?? 0), 0),
  }), [withExpiry])

  const bucketData = [
    { label: 'منتهي الصلاحية', count: withExpiry.filter(i => i.daysLeft < 0).length },
    { label: 'أقل من 30 يوم',  count: withExpiry.filter(i => i.daysLeft >= 0 && i.daysLeft <= 30).length },
    { label: '31 – 60 يوم',   count: withExpiry.filter(i => i.daysLeft > 30 && i.daysLeft <= 60).length },
    { label: '61 – 90 يوم',   count: withExpiry.filter(i => i.daysLeft > 60 && i.daysLeft <= 90).length },
  ].filter(b => b.count > 0)

  const exportRows = withExpiry.map(i => ({
    'المنتج': i.displayName,
    'الكمية': i.quantity,
    'تاريخ الانتهاء': i.expiryDate,
    'الأيام المتبقية': i.daysLeft,
    'القيمة': (i.quantity * Number(i.costPrice ?? 0)).toFixed(2),
  }))

  const tableCols = [
    { key: 'displayName' as keyof ExpiryRow, label: 'اسم المنتج', render: (row: ExpiryRow) => row.displayName },
    { key: 'expiryDate'  as keyof ExpiryRow, label: 'تاريخ الانتهاء', sortable: true },
    {
      key: 'daysLeft' as keyof ExpiryRow, label: 'الأيام المتبقية', sortable: true,
      render: (row: ExpiryRow) => (
        <span className={clsx('font-bold', row.daysLeft < 0 ? 'text-red-600' : row.daysLeft <= 30 ? 'text-amber-600' : 'text-emerald-600')}>
          {row.daysLeft < 0 ? `منتهي منذ ${Math.abs(row.daysLeft)} يوم` : `${row.daysLeft} يوم`}
        </span>
      ),
    },
    { key: 'quantity' as keyof ExpiryRow, label: 'الكمية', sortable: true },
    { key: 'category' as keyof ExpiryRow, label: 'الفئة' },
    {
      key: 'id' as keyof ExpiryRow,
      label: '',
      render: (row: ExpiryRow) =>
        row.daysLeft > 0 && row.daysLeft <= 90 ? (
          <Link
            to={`/pharmacy/p2p?tab=sell&openAdd=1&itemId=${row.id}`}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors whitespace-nowrap font-medium"
          >
            أدرج للبيع
          </Link>
        ) : null,
    },
  ]

  const insights = useMemo((): Insight[] => {
    const list: Insight[] = []
    if (kpis.expired > 0)
      list.push({ severity: 'critical', text: `${kpis.expired} منتج منتهي الصلاحية — يجب سحبه من الرفوف فوراً لتجنب المسؤولية القانونية` })
    if (kpis.within30 > 0)
      list.push({ severity: 'warning', text: `${kpis.within30} منتج تنتهي خلال 30 يوم — القيمة في خطر: ${fmt(kpis.atRiskValue)}. ابدأ خطة تخفيض أو إعادة توزيع الآن` })
    if (kpis.within90 > 0 && kpis.within30 === 0)
      list.push({ severity: 'info', text: `${kpis.within90} منتج تنتهي خلال 90 يوم — راقبها شهرياً وابدأ تصفيتها قبل 30 يوم من الانتهاء` })
    if (kpis.expired === 0 && kpis.within30 === 0 && kpis.within90 === 0)
      list.push({ severity: 'ok', text: 'لا توجد منتجات منتهية أو قريبة الانتهاء ضمن النطاق المحدد' })
    return list
  }, [kpis, fmt])

  return (
    <DomainShell
      icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-50"
      title="ذكاء الصلاحيات"
      subtitle="تتبع تواريخ انتهاء صلاحية جميع المنتجات في مخزونك. يساعدك في تجنب الخسائر من المنتجات المنتهية، وتخطيط تخفيضات التصفية قبل فوات الأوان."
      hint="المنتجات الحمراء منتهية الصلاحية ويجب سحبها فوراً. المنتجات البرتقالية (أقل من 30 يوم) تحتاج خطة تصفية الآن."
    >
      <ReportBuilder />

      <ReportShell
        domain="expiry" domainLabel="ذكاء الصلاحيات"
        exportRows={exportRows} exportFilename="expiry-report"
        loading={isLoading} insights={insights}
      >
        {view => isLoading ? <ReportSkeleton /> : isError ? (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-8 text-center">
            <p className="text-red-600 font-medium mb-1">تعذّر تحميل البيانات</p>
            <p className="text-sm text-red-400">تحقق من الاتصال بالشبكة وحاول مجدداً</p>
          </div>
        ) : (
          <div className="space-y-4">
            {view === 'summary' && (
              <>
                <p className="text-sm text-gray-500">ملخص وضع الصلاحيات في مخزونك الآن</p>
                <SummaryView cards={[
                  { title: 'منتهية الصلاحية', value: kpis.expired.toString(),    icon: AlertTriangle, iconColor: 'text-red-600',    iconBg: 'bg-red-50',    trendUp: false, sub: 'يجب سحبها فوراً' },
                  { title: 'خلال 30 يوم',    value: kpis.within30.toString(),   icon: Clock,         iconColor: 'text-amber-600',  iconBg: 'bg-amber-50',  trendUp: false, sub: 'تحتاج خطة تصفية عاجلة' },
                  { title: 'خلال 90 يوم',    value: kpis.within90.toString(),   icon: Package,       iconColor: 'text-blue-600',   iconBg: 'bg-blue-50',   sub: 'راقب هذه المنتجات' },
                  { title: 'قيمة في خطر',    value: fmt(kpis.atRiskValue),      icon: DollarSign,    iconColor: 'text-violet-600', iconBg: 'bg-violet-50', trendUp: false, sub: 'تكلفة المنتجات (أقل 30 يوم)' },
                ]} />
              </>
            )}
            {view === 'trend' && (
              <>
                <p className="text-sm text-gray-500">توزيع المنتجات حسب قرب انتهاء صلاحيتها</p>
                <TrendView data={bucketData} series={[{ key: 'count', label: 'عدد الأصناف', type: 'bar', color: '#f59e0b' }]} yLabel="صنف" />
              </>
            )}
            {view === 'table' && (
              <>
                <p className="text-sm text-gray-500">قائمة المنتجات مرتبة من الأقرب انتهاءً — اضغط على رأس العمود للترتيب</p>
                <TableView<ExpiryRow> rows={withExpiry} cols={tableCols} emptyText="لا توجد منتجات ضمن النطاق المحدد" />
              </>
            )}
            {view === 'ranking' && (
              <>
                <p className="text-sm text-gray-500">المنتجات مرتبة من الأقرب انتهاءً — الأولوية للأيام الأقل</p>
                <RankingView
                  items={withExpiry.slice(0, 20).map(i => ({ label: i.displayName, value: Math.max(i.daysLeft, 0), sub: `تاريخ الانتهاء: ${i.expiryDate?.split('T')[0]}` }))}
                  valueLabel="أيام متبقية" showBottom={false}
                />
              </>
            )}
          </div>
        )}
      </ReportShell>
    </DomainShell>
  )
}
