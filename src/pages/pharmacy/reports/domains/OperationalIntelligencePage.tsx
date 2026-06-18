import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart2, AlertTriangle, Package, Truck } from 'lucide-react'
import { DomainShell } from '../components/DomainShell'
import { ReportShell } from '../components/ReportShell'
import { ReportBuilder, useDateRange } from '../components/ReportBuilder'
import { SummaryView } from '../components/views/SummaryView'
import { TrendView } from '../components/views/TrendView'
import { TableView } from '../components/views/TableView'
import { RankingView } from '../components/views/RankingView'
import { forecastingApi } from '../../../../api/forecasting.api'
import { ordersApi } from '../../../../api/orders.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import type { Insight } from '../components/views/InsightPanel'

type DeadStockItem = { id?: string; productName?: string; name?: string; quantity?: number; costPrice?: number; category?: string; lastSoldAt?: string; deadStockScore?: number }
type Order = { id: string; supplierName?: string; status?: string; createdAt?: string; receivedAt?: string }

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />
      ))}
    </div>
  )
}

export default function OperationalIntelligencePage() {
  const { fmt } = useCurrency()
  const { dateFrom, dateTo } = useDateRange()

  const { data: deadStockData, isLoading: dsLoading, isError: dsError } = useQuery({
    queryKey: ['dead-stock-operational'],
    queryFn: () => forecastingApi.getDeadStock().then((r: any) => r.data?.data ?? r.data?.items ?? r.data ?? []),
  })

  const { data: ordersData, isLoading: ordLoading, isError: ordError } = useQuery({
    queryKey: ['orders-operational', dateFrom, dateTo],
    queryFn: () => ordersApi.getAll({ take: 200, skip: 0, from: dateFrom, to: dateTo }).then((r: any) => r.data?.data ?? r.data ?? []),
  })

  const deadStock: DeadStockItem[] = useMemo(() => Array.isArray(deadStockData) ? deadStockData as DeadStockItem[] : [], [deadStockData])
  const orders: Order[]            = useMemo(() => Array.isArray(ordersData)    ? ordersData as Order[]    : [], [ordersData])

  const kpis = useMemo(() => {
    const deadCount = deadStock.length
    const deadValue = deadStock.reduce((s, d) => s + Number(d.quantity ?? 0) * Number(d.costPrice ?? 0), 0)
    const completed = orders.filter(o => o.status === 'received' && o.createdAt && o.receivedAt)
    const avgDelivery = completed.length
      ? Math.round(completed.reduce((s, o) => s + (new Date(o.receivedAt!).getTime() - new Date(o.createdAt!).getTime()) / 86400000, 0) / completed.length)
      : 0
    const supplierCount = new Set(orders.map(o => o.supplierName).filter(Boolean)).size
    return { deadCount, deadValue, avgDelivery, supplierCount }
  }, [deadStock, orders])

  const supplierPerf = useMemo(() => {
    const map = new Map<string, { name: string; orders: number; totalDays: number }>()
    orders.filter(o => o.status === 'received' && o.supplierName).forEach(o => {
      const name = o.supplierName!
      const days = o.receivedAt && o.createdAt ? (new Date(o.receivedAt).getTime() - new Date(o.createdAt).getTime()) / 86400000 : 0
      const prev = map.get(name) ?? { name, orders: 0, totalDays: 0 }
      map.set(name, { name, orders: prev.orders + 1, totalDays: prev.totalDays + days })
    })
    return Array.from(map.values()).map(s => ({ ...s, avgDays: Math.round(s.totalDays / s.orders) })).sort((a, b) => a.avgDays - b.avgDays)
  }, [orders])

  const trendData = useMemo(() => {
    const map = new Map<string, number>()
    deadStock.forEach(d => { const label = d.category ?? 'أخرى'; map.set(label, (map.get(label) ?? 0) + 1) })
    return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [deadStock])

  const exportRows = deadStock.map(d => ({
    'المنتج': d.productName ?? d.name,
    'الكمية': d.quantity, 'الفئة': d.category,
    'آخر بيع': d.lastSoldAt?.split('T')[0],
    'قيمة الهدر': (Number(d.quantity ?? 0) * Number(d.costPrice ?? 0)).toFixed(2),
    'درجة الركود': d.deadStockScore,
  }))

  const tableCols = [
    { key: 'productName' as keyof DeadStockItem, label: 'اسم المنتج', render: (row: DeadStockItem) => row.productName ?? row.name ?? '—' },
    { key: 'category'    as keyof DeadStockItem, label: 'الفئة' },
    { key: 'quantity'    as keyof DeadStockItem, label: 'الكمية المتبقية', sortable: true },
    { key: 'lastSoldAt'  as keyof DeadStockItem, label: 'آخر عملية بيع', sortable: true, render: (row: DeadStockItem) => (row.lastSoldAt ?? '—').split('T')[0] },
    { key: 'deadStockScore' as keyof DeadStockItem, label: 'درجة الخطورة', sortable: true },
  ]

  const isLoading = dsLoading || ordLoading
  const isError   = dsError   || ordError

  const insights = useMemo((): Insight[] => {
    const list: Insight[] = []
    if (kpis.deadCount > 0) {
      list.push({ severity: kpis.deadValue > 5000 ? 'critical' : 'warning', text: `${kpis.deadCount} منتج راكد بقيمة ${fmt(kpis.deadValue)} رأس مال مجمد — تحتاج قرار تخفيض أو إرجاع للمورد` })
    } else {
      list.push({ severity: 'ok', text: 'لا توجد منتجات راكدة حالياً — مخزونك يتحرك بشكل جيد' })
    }
    if (kpis.avgDelivery > 0)
      list.push({ severity: kpis.avgDelivery > 5 ? 'warning' : 'ok', text: `متوسط وقت التسليم ${kpis.avgDelivery} يوم عبر ${kpis.supplierCount} مورد — ${kpis.avgDelivery > 5 ? 'أعلى من المعيار المقبول (5 أيام)' : 'ضمن النطاق الطبيعي'}` })
    return list
  }, [kpis, fmt])

  return (
    <DomainShell
      icon={BarChart2} iconColor="text-orange-600" iconBg="bg-orange-50"
      title="ذكاء التشغيل والكفاءة"
      subtitle="تحليل المنتجات الراكدة وكفاءة الموردين. المنتج الراكد هو ما لم يُباع منذ أكثر من 8 أسابيع — هذا رأس مال مجمّد يمكن تحريكه بقرار تسعير أو ترويج."
      hint="ركّز على المنتجات ذات درجة الخطورة العالية — هي الأولوية لقرارات التصفية أو إرجاع المورد."
    >
      <ReportBuilder />

      <ReportShell
        domain="operational" domainLabel="ذكاء التشغيل"
        exportRows={exportRows} exportFilename="operational-report"
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
                <p className="text-sm text-gray-500">مؤشرات الكفاءة التشغيلية الرئيسية</p>
                <SummaryView cards={[
                  { title: 'منتجات راكدة',          value: kpis.deadCount.toString(),   icon: Package,       iconColor: 'text-orange-600', iconBg: 'bg-orange-50', trendUp: false, sub: 'لم تُباع منذ 8+ أسابيع' },
                  { title: 'قيمة رأس المال المجمد', value: fmt(kpis.deadValue),         icon: AlertTriangle, iconColor: 'text-red-600',    iconBg: 'bg-red-50',    trendUp: false, sub: 'تكلفة الشراء الأصلية' },
                  { title: 'متوسط وقت التسليم',     value: `${kpis.avgDelivery} يوم`,  icon: Truck,         iconColor: 'text-blue-600',   iconBg: 'bg-blue-50',   sub: 'من تاريخ الطلب للاستلام' },
                  { title: 'عدد الموردين',           value: kpis.supplierCount.toString(), icon: BarChart2,  iconColor: 'text-slate-600',  iconBg: 'bg-slate-100', sub: 'موردون نشطون' },
                ]} />
              </>
            )}
            {view === 'trend' && (
              <>
                <p className="text-sm text-gray-500">توزيع المنتجات الراكدة حسب الفئة</p>
                <TrendView data={trendData} series={[{ key: 'count', label: 'منتجات راكدة', type: 'bar', color: '#f97316' }]} yLabel="صنف" />
              </>
            )}
            {view === 'table' && (
              <>
                <p className="text-sm text-gray-500">قائمة المنتجات الراكدة — درجة الخطورة تجمع بين الكمية والتكلفة ومدة الركود</p>
                <TableView<DeadStockItem> rows={deadStock} cols={tableCols} emptyText="ممتاز — لا توجد منتجات راكدة حالياً!" />
              </>
            )}
            {view === 'ranking' && (
              <>
                <p className="text-sm text-gray-500">الموردون مرتبون من الأسرع تسليماً إلى الأبطأ</p>
                <RankingView items={supplierPerf.map(s => ({ label: s.name, value: s.orders, sub: `متوسط التسليم: ${s.avgDays} يوم` }))} valueLabel="الطلبات المكتملة" showBottom={false} />
              </>
            )}
          </div>
        )}
      </ReportShell>
    </DomainShell>
  )
}
