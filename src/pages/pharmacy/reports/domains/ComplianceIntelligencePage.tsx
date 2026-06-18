import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, Clock, CheckCircle, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { DomainShell } from '../components/DomainShell'
import { ReportShell } from '../components/ReportShell'
import { ReportBuilder, useDateRange } from '../components/ReportBuilder'
import { SummaryView } from '../components/views/SummaryView'
import { TrendView } from '../components/views/TrendView'
import { TableView } from '../components/views/TableView'
import { RankingView } from '../components/views/RankingView'
import { ordersApi } from '../../../../api/orders.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import type { Insight } from '../components/views/InsightPanel'

type Order = { id: string; status?: string; supplierName?: string; totalAmount?: number; createdAt?: string; receivedAt?: string }
type OrderRow = Order & { daysSince: number; statusLabel: string }

const STATUS_MAP: Record<string, string> = {
  pending: 'معلق', approved: 'موافق', received: 'مستلم', cancelled: 'ملغي', disputed: 'متنازع', on_hold: 'موقوف',
}
const STATUS_CLS: Record<string, string> = {
  received: 'bg-emerald-100 text-emerald-700', pending: 'bg-amber-100 text-amber-700', cancelled: 'bg-red-100 text-red-700',
}

function daysSince(dateStr?: string): number {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
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

export default function ComplianceIntelligencePage() {
  const { fmt } = useCurrency()
  const { dateFrom, dateTo } = useDateRange()

  const { data: ordersData, isLoading, isError } = useQuery({
    queryKey: ['orders-compliance', dateFrom, dateTo],
    queryFn: () => ordersApi.getAll({ take: 200, skip: 0, from: dateFrom, to: dateTo }).then((r: any) => r.data?.data ?? r.data ?? []),
  })

  const orders: OrderRow[] = useMemo(() => {
    const list: Order[] = Array.isArray(ordersData) ? ordersData as Order[] : []
    return list.map(o => ({
      ...o,
      daysSince:   daysSince(o.createdAt),
      statusLabel: STATUS_MAP[o.status ?? ''] ?? (o.status ?? '—'),
    }))
  }, [ordersData])

  const kpis = useMemo(() => ({
    total:    orders.length,
    pending:  orders.filter(o => o.status === 'pending').length,
    received: orders.filter(o => o.status === 'received').length,
    overdue:  orders.filter(o => !['received', 'cancelled'].includes(o.status ?? '') && o.daysSince > 7).length,
  }), [orders])

  const trendData = useMemo(() => {
    const map = new Map<string, number>()
    orders.forEach(o => { const label = (o.createdAt ?? '').split('T')[0]; map.set(label, (map.get(label) ?? 0) + 1) })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count }))
  }, [orders])

  const supplierRank = useMemo(() => {
    const map = new Map<string, { name: string; count: number; overdue: number }>()
    orders.forEach(o => {
      const name = o.supplierName ?? 'غير معروف'
      const prev = map.get(name) ?? { name, count: 0, overdue: 0 }
      map.set(name, { name, count: prev.count + 1, overdue: prev.overdue + (!['received', 'cancelled'].includes(o.status ?? '') && o.daysSince > 7 ? 1 : 0) })
    })
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [orders])

  const exportRows = orders.map(o => ({
    'رقم الطلب': o.id?.slice(0, 8), 'المورد': o.supplierName,
    'الحالة': o.statusLabel, 'القيمة': o.totalAmount,
    'التاريخ': (o.createdAt ?? '').split('T')[0], 'الأيام': o.daysSince,
  }))

  const tableCols = [
    { key: 'id'          as keyof OrderRow, label: 'رقم الطلب', render: (row: OrderRow) => `#${row.id?.slice(0, 8)}` },
    { key: 'supplierName' as keyof OrderRow, label: 'المورد' },
    {
      key: 'statusLabel' as keyof OrderRow, label: 'الحالة',
      render: (row: OrderRow) => {
        const cls = STATUS_CLS[row.status ?? ''] ?? 'bg-gray-100 text-gray-600'
        return <span className={clsx('px-2 py-0.5 text-xs rounded-full font-medium', cls)}>{row.statusLabel}</span>
      },
    },
    { key: 'totalAmount' as keyof OrderRow, label: 'القيمة', sortable: true, render: (row: OrderRow) => fmt(row.totalAmount ?? 0) },
    { key: 'daysSince'   as keyof OrderRow, label: 'عمر الطلب (يوم)', sortable: true },
  ]

  const insights = useMemo((): Insight[] => {
    if (!kpis.total) return []
    const list: Insight[] = []
    const receiveRate = Math.round(kpis.received / kpis.total * 100)
    if (kpis.overdue > 0)
      list.push({ severity: 'critical', text: `${kpis.overdue} طلب تجاوز 7 أيام بدون استلام — تواصل مع الموردين المعنيين فوراً` })
    if (kpis.pending > 0)
      list.push({ severity: 'warning', text: `${kpis.pending} طلب معلق لم يُستلم بعد — تابع مع الموردين لتأكيد مواعيد التسليم` })
    list.push({ severity: receiveRate >= 80 ? 'ok' : 'info', text: `معدل الاستلام ${receiveRate}% — ${kpis.received} طلب مكتمل من أصل ${kpis.total}` })
    if (kpis.overdue === 0 && kpis.pending === 0)
      list.push({ severity: 'ok', text: 'جميع الطلبات مستلمة أو ضمن مهل التسليم الطبيعية' })
    return list
  }, [kpis])

  return (
    <DomainShell
      icon={ShieldCheck} iconColor="text-slate-600" iconBg="bg-slate-100"
      title="ذكاء الامتثال والمشتريات"
      subtitle="متابعة حالة طلبات الشراء من الموردين — المعلقة والمستلمة والمتأخرة. يساعدك في ضمان سلاسة سلسلة التوريد وعدم تأخر أي طلب."
      hint="الطلبات الأكثر من 7 أيام دون استلام تظهر باللون الأحمر في الجدول. تواصل مع المورد المعني مباشرة."
    >
      <ReportBuilder />

      <ReportShell
        domain="compliance" domainLabel="ذكاء الامتثال"
        exportRows={exportRows} exportFilename="compliance-report"
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
                <p className="text-sm text-gray-500">ملخص حالة طلبات الشراء الإجمالية</p>
                <SummaryView cards={[
                  { title: 'إجمالي الطلبات', value: kpis.total.toString(),    icon: ShieldCheck, iconColor: 'text-slate-600',   iconBg: 'bg-slate-100', sub: 'جميع طلبات الشراء' },
                  { title: 'طلبات معلقة',    value: kpis.pending.toString(),  icon: Clock,       iconColor: 'text-amber-600',  iconBg: 'bg-amber-50',  sub: 'تنتظر الاستلام' },
                  { title: 'طلبات مستلمة',   value: kpis.received.toString(), icon: CheckCircle, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50', sub: 'تم استلامها بنجاح' },
                  { title: 'طلبات متأخرة',   value: kpis.overdue.toString(),  icon: XCircle,     iconColor: 'text-red-600',    iconBg: 'bg-red-50',    trendUp: false, sub: 'أكثر من 7 أيام بدون استلام' },
                ]} />
              </>
            )}
            {view === 'trend' && (
              <>
                <p className="text-sm text-gray-500">عدد الطلبات المُنشأة يومياً</p>
                <TrendView data={trendData} series={[{ key: 'count', label: 'عدد الطلبات', type: 'bar', color: '#64748b' }]} yLabel="طلب" />
              </>
            )}
            {view === 'table' && (
              <>
                <p className="text-sm text-gray-500">تفاصيل جميع الطلبات — اضغط على رأس العمود للترتيب</p>
                <TableView<OrderRow> rows={orders} cols={tableCols} emptyText="لا توجد طلبات شراء" />
              </>
            )}
            {view === 'ranking' && (
              <>
                <p className="text-sm text-gray-500">الموردون مرتبون حسب عدد الطلبات</p>
                <RankingView items={supplierRank.map(s => ({ label: s.name, value: s.count, sub: s.overdue > 0 ? `${s.overdue} طلب متأخر` : 'لا تأخيرات' }))} valueLabel="الطلبات" />
              </>
            )}
          </div>
        )}
      </ReportShell>
    </DomainShell>
  )
}
