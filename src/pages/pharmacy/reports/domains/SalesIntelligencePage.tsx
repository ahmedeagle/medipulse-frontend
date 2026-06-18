import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, DollarSign, ShoppingCart, ArrowDownRight } from 'lucide-react'
import { DomainShell } from '../components/DomainShell'
import { ReportShell } from '../components/ReportShell'
import { ReportBuilder, useDateRange } from '../components/ReportBuilder'
import { SummaryView } from '../components/views/SummaryView'
import { TrendView } from '../components/views/TrendView'
import { TableView } from '../components/views/TableView'
import { RankingView } from '../components/views/RankingView'
import { posApi, type PosTransaction } from '../../../../api/pos.api'
import { useCurrency } from '../../../../hooks/useCurrency'
import type { Insight } from '../components/views/InsightPanel'

type DayRow = { label: string; revenue: number; txCount: number }

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />
      ))}
    </div>
  )
}

export default function SalesIntelligencePage() {
  const { fmt } = useCurrency()
  const { dateFrom, dateTo } = useDateRange()

  const { data: txData, isLoading, isError } = useQuery({
    queryKey: ['pos-transactions-report', dateFrom, dateTo],
    queryFn: () => posApi.listTransactions({ limit: 500, offset: 0, dateFrom, dateTo }),
    staleTime: 2 * 60_000,
  })

  const transactions: PosTransaction[] = useMemo(() => {
    const raw = (txData as { data?: PosTransaction[] } | undefined)?.data ?? []
    return raw.filter(t => t.status !== 'voided')
  }, [txData])

  const kpis = useMemo(() => {
    const totalRevenue  = transactions.reduce((s, t) => s + Number(t.totalAmount ?? 0), 0)
    // Discounts can be at transaction level OR per item — sum both
    const totalDiscount = transactions.reduce((s, t) => {
      const txDiscount   = Number(t.discountAmount ?? 0)
      const itemDiscount = (t.items ?? []).reduce((si, i) => si + Number(i.discountAmount ?? 0), 0)
      return s + txDiscount + itemDiscount
    }, 0)
    const txCount   = transactions.length
    const avgBasket = txCount > 0 ? totalRevenue / txCount : 0
    return { totalRevenue, totalDiscount, txCount, avgBasket }
  }, [transactions])

  const trendData: DayRow[] = useMemo(() => {
    const map = new Map<string, { revenue: number; count: number }>()
    transactions.forEach(t => {
      const label = (t.createdAt ?? '').split('T')[0]
      const prev  = map.get(label) ?? { revenue: 0, count: 0 }
      map.set(label, { revenue: prev.revenue + Number(t.totalAmount ?? 0), count: prev.count + 1 })
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([label, v]) => ({
      label, revenue: v.revenue, txCount: v.count,
    }))
  }, [transactions])

  const itemRankMap = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>()
    transactions.forEach(t => {
      t.items?.forEach(item => {
        const name  = item.productName ?? 'غير معروف'
        const value = Number(item.subtotal ?? item.quantity * (item.unitPrice ?? 0))
        const prev  = map.get(name) ?? { name, qty: 0, revenue: 0 }
        map.set(name, { name, qty: prev.qty + item.quantity, revenue: prev.revenue + value })
      })
    })
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [transactions])

  const exportRows = transactions.map(t => ({
    'التاريخ': (t.createdAt ?? '').split('T')[0],
    'الكاشير': t.cashierName ?? '—',
    'العميل': t.customerName ?? '—',
    'المبلغ': t.totalAmount,
    'الخصم': t.discountAmount,
    'الضريبة': t.taxAmount,
    'طريقة الدفع': t.paymentMethod,
    'النوع': t.type,
    'عدد الأصناف': t.items?.length ?? 0,
  }))

  const PAY_LABEL: Record<string, string> = { cash: 'نقدي', card: 'بطاقة', split: 'مختلط' }
  const TYPE_LABEL: Record<string, string> = { sale: 'بيع', return: 'مرتجع' }

  const txTableCols = [
    { key: 'createdAt' as keyof PosTransaction, label: 'التاريخ والوقت', sortable: true,
      render: (row: PosTransaction) => (row.createdAt ?? '').replace('T', ' ').slice(0, 16) },
    { key: 'cashierName' as keyof PosTransaction, label: 'الكاشير',
      render: (row: PosTransaction) => row.cashierName ?? '—' },
    { key: 'customerName' as keyof PosTransaction, label: 'العميل',
      render: (row: PosTransaction) => row.customerName ?? 'عميل عام' },
    { key: 'type' as keyof PosTransaction, label: 'النوع',
      render: (row: PosTransaction) => (
        <span className={row.type === 'return' ? 'text-red-600 font-medium' : 'text-emerald-700 font-medium'}>
          {TYPE_LABEL[row.type] ?? row.type}
        </span>
      )},
    { key: 'totalAmount' as keyof PosTransaction, label: 'المبلغ', sortable: true,
      render: (row: PosTransaction) => fmt(row.totalAmount) },
    { key: 'discountAmount' as keyof PosTransaction, label: 'الخصم',
      render: (row: PosTransaction) => {
        const total = Number(row.discountAmount ?? 0) + (row.items ?? []).reduce((s, i) => s + Number(i.discountAmount ?? 0), 0)
        return total > 0 ? fmt(total) : '—'
      }},
    { key: 'paymentMethod' as keyof PosTransaction, label: 'طريقة الدفع',
      render: (row: PosTransaction) => PAY_LABEL[row.paymentMethod] ?? row.paymentMethod },
    { key: 'items' as keyof PosTransaction, label: 'المنتجات',
      render: (row: PosTransaction) => {
        const names = (row.items ?? []).map(i => i.productName).filter(Boolean)
        if (!names.length) return <span className="text-gray-400 text-xs">—</span>
        return (
          <span className="text-xs" title={names.join(' · ')}>
            {names.slice(0, 2).join(' · ')}{names.length > 2 ? <span className="text-gray-400"> +{names.length - 2}</span> : null}
          </span>
        )
      }},
  ]

  const insights = useMemo((): Insight[] => {
    if (!kpis.txCount) return []
    const list: Insight[] = []
    const returnCount = transactions.filter(t => t.type === 'return').length
    const returnRate  = Math.round(returnCount / kpis.txCount * 100)
    const discountRate = kpis.totalRevenue > 0 ? Math.round(kpis.totalDiscount / kpis.totalRevenue * 100) : 0
    list.push({ severity: 'info', text: `${kpis.txCount} فاتورة بإجمالي ${fmt(kpis.totalRevenue)} — متوسط قيمة الفاتورة الواحدة ${fmt(kpis.avgBasket)}` })
    if (discountRate > 15)
      list.push({ severity: 'warning', text: `نسبة الخصم ${discountRate}% من الإيراد — ارتفاع ملحوظ قد يضغط على الهامش` })
    else if (discountRate > 0)
      list.push({ severity: 'info', text: `إجمالي الخصومات الممنوحة ${fmt(kpis.totalDiscount)} (${discountRate}% من الإيراد)` })
    if (returnRate > 5)
      list.push({ severity: 'warning', text: `${returnCount} مرتجع (${returnRate}% من المعاملات) — راجع أسباب الإرجاع مع الكاشير` })
    if (itemRankMap.length === 0)
      list.push({ severity: 'info', text: 'تفاصيل المنتجات غير متاحة في هذه الفترة — الإيراد محسوب على مستوى الفاتورة فقط' })
    else
      list.push({ severity: 'ok', text: `أعلى منتج مبيعاً: ${itemRankMap[0]?.name ?? '—'} بإيراد ${fmt(itemRankMap[0]?.revenue ?? 0)}` })
    return list
  }, [kpis, transactions, itemRankMap, fmt])

  return (
    <DomainShell
      icon={TrendingUp} iconColor="text-emerald-600" iconBg="bg-emerald-50"
      title="ذكاء المبيعات"
      subtitle="تحليل شامل لمبيعات الصيدلية — اعرف كم بعت اليوم، وأي منتج الأكثر طلباً، وكيف تتغير مبيعاتك يوماً بيوم. يساعدك في اتخاذ قرارات الشراء والتسعير."
      hint="اختر الفترة الزمنية من أعلى ثم انتقل بين طرق العرض — ملخص للأرقام الكبيرة، اتجاه للرسم البياني، جدول للتفاصيل، ترتيب لأفضل المنتجات."
    >
      <ReportBuilder />

      <ReportShell
        domain="sales" domainLabel="ذكاء المبيعات"
        exportRows={exportRows} exportFilename="sales-report"
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
                <p className="text-sm text-gray-500">نظرة سريعة على أهم أرقام الفترة المختارة</p>
                <SummaryView cards={[
                  { title: 'إجمالي الإيرادات',    value: fmt(kpis.totalRevenue),  icon: DollarSign,     iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50', sub: 'مجموع كل المبيعات' },
                  { title: 'عدد المعاملات',        value: kpis.txCount.toString(), icon: ShoppingCart,   iconColor: 'text-blue-600',    iconBg: 'bg-blue-50',   sub: 'عدد الفواتير الكلي' },
                  { title: 'متوسط قيمة الفاتورة', value: fmt(kpis.avgBasket),     icon: TrendingUp,     iconColor: 'text-violet-600',  iconBg: 'bg-violet-50', sub: 'الإيراد ÷ عدد المعاملات' },
                  { title: 'إجمالي الخصومات',     value: fmt(kpis.totalDiscount), icon: ArrowDownRight, iconColor: 'text-amber-600',   iconBg: 'bg-amber-50',  trendUp: false, sub: 'مقدار الخصم الممنوح' },
                ]} />
              </>
            )}
            {view === 'trend' && (
              <>
                <p className="text-sm text-gray-500">الإيراد اليومي (أعمدة) وعدد المعاملات (خط) — الخط يكشف أيام الازدحام حتى لو الإيراد منخفض</p>
                <TrendView
                  data={trendData}
                  series={[
                    { key: 'revenue', label: 'الإيراد', type: 'bar', color: '#0d9488' },
                    { key: 'txCount', label: 'المعاملات', type: 'line', color: '#f59e0b', rightAxis: true },
                  ]}
                  yLabel="SAR"
                />
              </>
            )}
            {view === 'table' && (
              <>
                <p className="text-sm text-gray-500">كل فاتورة على حدة — الكاشير والعميل وطريقة الدفع والأصناف</p>
                <TableView<PosTransaction> rows={transactions} cols={txTableCols} emptyText="لا توجد مبيعات في هذه الفترة" />
              </>
            )}
            {view === 'ranking' && (
              <>
                <p className="text-sm text-gray-500">المبيعات حسب الصنف — المنتجات مرتبة من الأعلى إيراداً</p>
                {itemRankMap.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm">
                    لا توجد بيانات أصناف — قد تكون الفواتير لا تحتوي على تفاصيل المنتجات
                  </div>
                ) : (
                  <RankingView
                    items={itemRankMap.map(i => ({
                      label: i.name,
                      value: Math.round(i.revenue),
                      sub: `${i.qty.toLocaleString('en-US')} وحدة مباعة`,
                    }))}
                    valueLabel="الإيراد"
                  />
                )}
              </>
            )}
          </div>
        )}
      </ReportShell>
    </DomainShell>
  )
}
