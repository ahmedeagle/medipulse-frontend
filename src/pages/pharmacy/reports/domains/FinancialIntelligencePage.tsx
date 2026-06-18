import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, TrendingUp, CreditCard, Banknote } from 'lucide-react'
import { DomainShell } from '../components/DomainShell'
import { ReportShell } from '../components/ReportShell'
import { ReportBuilder, useDateRange } from '../components/ReportBuilder'
import { SummaryView } from '../components/views/SummaryView'
import { TrendView } from '../components/views/TrendView'
import { TableView } from '../components/views/TableView'
import { RankingView } from '../components/views/RankingView'
import { posApi, type PosShift } from '../../../../api/pos.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import type { Insight } from '../components/views/InsightPanel'

type DayRow = { label: string; revenue: number }

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />
      ))}
    </div>
  )
}

export default function FinancialIntelligencePage() {
  const { fmt } = useCurrency()
  const { dateFrom, dateTo } = useDateRange()

  const { data: shiftsData, isLoading, isError } = useQuery({
    queryKey: ['shifts-financial', dateFrom, dateTo],
    queryFn: () => posApi.listShifts({ limit: 300, offset: 0, dateFrom, dateTo }),
  })

  const shifts: PosShift[] = useMemo(() => {
    const raw = (shiftsData as { data?: PosShift[] } | undefined)?.data ?? []
    return raw.filter(s => s.status === 'closed')
  }, [shiftsData])

  const kpis = useMemo(() => {
    const totalRevenue = shifts.reduce((s, sh) => s + Number(sh.totalSales  ?? 0), 0)
    const totalReturns = shifts.reduce((s, sh) => s + Number(sh.totalReturns ?? 0), 0)
    const netRevenue   = totalRevenue - totalReturns
    const cashRev      = shifts.reduce((s, sh) => s + Number(sh.totalCashSales ?? 0), 0)
    const cardRev      = shifts.reduce((s, sh) => s + Number(sh.totalCardSales ?? 0), 0)
    return { totalRevenue, netRevenue, cashRev, cardRev }
  }, [shifts])

  const trendData: DayRow[] = useMemo(() => {
    const map = new Map<string, number>()
    shifts.forEach(s => {
      const label = (s.openedAt ?? '').split('T')[0]
      map.set(label, (map.get(label) ?? 0) + Number(s.totalSales ?? 0))
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([label, revenue]) => ({ label, revenue }))
  }, [shifts])

  const exportRows = shifts.map(s => ({
    'التاريخ': (s.openedAt ?? '').split('T')[0],
    'إجمالي المبيعات': s.totalSales,
    'المرتجعات': s.totalReturns,
    'نقدي': s.totalCashSales,
    'بطاقة': s.totalCardSales,
    'الرصيد الافتتاحي': s.openingBalance,
    'الرصيد الختامي': s.closingBalance,
  }))

  const shiftTableCols = [
    { key: 'openedAt' as keyof PosShift, label: 'تاريخ الفتح', sortable: true,
      render: (row: PosShift) => (row.openedAt ?? '').replace('T', ' ').slice(0, 16) },
    { key: 'cashierName' as keyof PosShift, label: 'الكاشير',
      render: (row: PosShift) => row.cashierName ?? '—' },
    { key: 'totalSales' as keyof PosShift, label: 'إجمالي المبيعات', sortable: true,
      render: (row: PosShift) => fmt(row.totalSales) },
    { key: 'totalCashSales' as keyof PosShift, label: 'نقدي',
      render: (row: PosShift) => fmt(row.totalCashSales) },
    { key: 'totalCardSales' as keyof PosShift, label: 'بطاقة',
      render: (row: PosShift) => fmt(row.totalCardSales) },
    { key: 'totalReturns' as keyof PosShift, label: 'المرتجعات',
      render: (row: PosShift) => row.totalReturns > 0 ? fmt(row.totalReturns) : '—' },
    { key: 'transactionCount' as keyof PosShift, label: 'عدد المعاملات', sortable: true },
    { key: 'openingBalance' as keyof PosShift, label: 'الرصيد الافتتاحي',
      render: (row: PosShift) => fmt(row.openingBalance) },
    { key: 'closingBalance' as keyof PosShift, label: 'الرصيد الختامي',
      render: (row: PosShift) => row.closingBalance != null ? fmt(row.closingBalance) : '—' },
  ]

  const paymentSplit = [
    { label: 'نقدي',      value: Math.round(kpis.cashRev) },
    { label: 'بطاقة بنكية', value: Math.round(kpis.cardRev) },
  ]

  const insights = useMemo((): Insight[] => {
    if (!shifts.length) return []
    const list: Insight[] = []
    const totalReturns = kpis.totalRevenue - kpis.netRevenue
    const returnRate   = kpis.totalRevenue > 0 ? Math.round(totalReturns / kpis.totalRevenue * 100) : 0
    const cashPct      = kpis.totalRevenue > 0 ? Math.round(kpis.cashRev / kpis.totalRevenue * 100) : 0
    list.push({ severity: 'info', text: `إجمالي الإيراد ${fmt(kpis.totalRevenue)} — صافي بعد المرتجعات ${fmt(kpis.netRevenue)} عبر ${shifts.length} شفت` })
    if (returnRate > 10)
      list.push({ severity: 'warning', text: `نسبة المرتجعات ${returnRate}% من الإيراد — ارتفاع ملحوظ يستحق المراجعة` })
    list.push({ severity: 'info', text: `${cashPct}% من المدفوعات نقدي (${fmt(kpis.cashRev)}) و${100 - cashPct}% بطاقة (${fmt(kpis.cardRev)})` })
    if (cashPct > 80)
      list.push({ severity: 'info', text: 'الاعتماد على النقدي مرتفع — فكر في تشجيع الدفع الإلكتروني لتقليل مخاطر الكاش' })
    return list
  }, [kpis, shifts, fmt])

  return (
    <DomainShell
      icon={DollarSign} iconColor="text-violet-600" iconBg="bg-violet-50"
      title="ذكاء الأرباح والإيرادات"
      subtitle="تحليل الوضع المالي للصيدلية — إجمالي الإيرادات، المرتجعات، ونسبة الدفع نقداً مقابل البطاقة. أداة مهمة لمراجعة الأداء المالي اليومي والأسبوعي."
      hint="ابدأ بعرض 'ملخص' لرؤية الأرقام الكبيرة، ثم انتقل إلى 'اتجاه' لرؤية الرسم البياني اليومي."
    >
      <ReportBuilder />

      <ReportShell
        domain="financial" domainLabel="ذكاء الأرباح"
        exportRows={exportRows} exportFilename="financial-report"
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
                <p className="text-sm text-gray-500">الأرقام المالية الرئيسية للفترة المختارة</p>
                <SummaryView cards={[
                  { title: 'إجمالي الإيرادات', value: fmt(kpis.totalRevenue), icon: DollarSign, iconColor: 'text-violet-600', iconBg: 'bg-violet-50', sub: 'قبل خصم المرتجعات' },
                  { title: 'صافي الإيراد',    value: fmt(kpis.netRevenue),   icon: TrendingUp,  iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50', sub: 'بعد خصم المرتجعات' },
                  { title: 'إيرادات نقدية',   value: fmt(kpis.cashRev),      icon: Banknote,    iconColor: 'text-blue-600',    iconBg: 'bg-blue-50',   sub: 'مدفوعات بالكاش' },
                  { title: 'إيرادات بطاقة',   value: fmt(kpis.cardRev),      icon: CreditCard,  iconColor: 'text-slate-600',   iconBg: 'bg-slate-100', sub: 'مدفوعات بالبطاقة' },
                ]} />
              </>
            )}
            {view === 'trend' && (
              <>
                <p className="text-sm text-gray-500">مسار الإيرادات يوم بيوم — ابحث عن أيام الذروة والأيام الهادئة</p>
                <TrendView data={trendData} series={[{ key: 'revenue', label: 'الإيراد', type: 'bar', color: '#7c3aed' }]} yLabel="SAR" />
              </>
            )}
            {view === 'table' && (
              <>
                <p className="text-sm text-gray-500">كل شفت على حدة — الكاشير والمبالغ والرصيد الافتتاحي والختامي</p>
                <TableView<PosShift> rows={shifts} cols={shiftTableCols} emptyText="لا توجد شفتات مُغلقة في هذه الفترة" />
              </>
            )}
            {view === 'ranking' && (
              <>
                <p className="text-sm text-gray-500">مقارنة طرق الدفع — نسبة النقدي مقابل البطاقة</p>
                <RankingView items={paymentSplit} valueLabel="الإيراد (SAR)" showBottom={false} />
              </>
            )}
          </div>
        )}
      </ReportShell>
    </DomainShell>
  )
}
