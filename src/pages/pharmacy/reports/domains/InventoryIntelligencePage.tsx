import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, AlertTriangle, TrendingDown, CheckCircle } from 'lucide-react'
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
  id: string
  quantity: number
  minThreshold?: number
  costPrice?: number
  sellingPrice?: number
  expiryDate?: string
  product?: { id?: string; name?: string; nameAr?: string; category?: string }
}
type TableRow = InvItem & { stockStatus: string; displayName: string; displayCategory: string }

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />
      ))}
    </div>
  )
}

export default function InventoryIntelligencePage() {
  const { fmt } = useCurrency()
  const [params] = useSearchParams()
  const category  = params.get('category') ?? ''
  const statFilter = params.get('statFilter') ?? ''

  const { data: invData, isLoading, isError } = useQuery({
    queryKey: ['inventory-report'],
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

  const rawItems: InvItem[] = useMemo(() => Array.isArray(invData) ? invData as InvItem[] : [], [invData])

  const categories = useMemo(() => [...new Set(rawItems.map(i => i.product?.category).filter(Boolean))] as string[], [rawItems])

  const items: TableRow[] = useMemo(() => {
    let filtered = rawItems
    const getCat = (i: InvItem) => i.product?.category ?? ''
    if (category)                filtered = filtered.filter(i => getCat(i) === category)
    if (statFilter === 'lowStock') filtered = filtered.filter(i => i.quantity <= (i.minThreshold ?? 5))
    return filtered.map(i => ({
      ...i,
      displayName: i.product?.nameAr ?? i.product?.name ?? '—',
      displayCategory: getCat(i) || 'أخرى',
      stockStatus: i.quantity === 0 ? 'نافد' : i.quantity <= (i.minThreshold ?? 5) ? 'منخفض' : 'جيد',
    }))
  }, [rawItems, category, statFilter])

  const kpis = useMemo(() => ({
    totalItems:  items.length,
    lowStock:    items.filter(i => i.quantity <= (i.minThreshold ?? 5)).length,
    totalValue:  items.reduce((s, i) => s + i.quantity * Number(i.costPrice ?? 0), 0),
    outOfStock:  items.filter(i => i.quantity === 0).length,
  }), [items])

  const categoryDistribution = useMemo(() => {
    const map = new Map<string, number>()
    items.forEach(i => { const cat = i.displayCategory; map.set(cat, (map.get(cat) ?? 0) + 1) })
    return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [items])

  const exportRows = items.map(i => ({
    'المنتج': i.displayName, 'الفئة': i.displayCategory,
    'الكمية': i.quantity, 'الحد الأدنى': i.minThreshold,
    'سعر التكلفة': i.costPrice, 'الحالة': i.stockStatus,
  }))

  const tableCols = [
    { key: 'displayName'     as keyof TableRow, label: 'اسم المنتج', render: (row: TableRow) => row.displayName },
    { key: 'displayCategory' as keyof TableRow, label: 'الفئة',      render: (row: TableRow) => row.displayCategory },
    { key: 'quantity'        as keyof TableRow, label: 'الكمية', sortable: true },
    { key: 'minThreshold'    as keyof TableRow, label: 'الحد الأدنى' },
    {
      key: 'stockStatus' as keyof TableRow, label: 'الحالة',
      render: (row: TableRow) => {
        const cls = row.stockStatus === 'نافد' ? 'bg-red-100 text-red-700' : row.stockStatus === 'منخفض' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
        return <span className={clsx('px-2 py-0.5 text-xs rounded-full font-medium', cls)}>{row.stockStatus}</span>
      },
    },
  ]

  const insights = useMemo((): Insight[] => {
    if (!kpis.totalItems) return []
    const list: Insight[] = []
    if (kpis.outOfStock > 0)
      list.push({ severity: 'critical', text: `${kpis.outOfStock} منتج نافد تماماً — يجب إعادة طلبها فوراً قبل خسارة المبيعات` })
    if (kpis.lowStock > 0) {
      const pct = Math.round(kpis.lowStock / kpis.totalItems * 100)
      list.push({ severity: 'warning', text: `${kpis.lowStock} منتج تحت الحد الأدنى (${pct}% من إجمالي المخزون) — جدول إعادة الطلب قريباً` })
    }
    if (kpis.totalValue > 0)
      list.push({ severity: 'info', text: `إجمالي قيمة المخزون بالتكلفة: ${fmt(kpis.totalValue)} موزعة على ${kpis.totalItems} صنف` })
    if (kpis.lowStock === 0 && kpis.outOfStock === 0)
      list.push({ severity: 'ok', text: 'جميع مستويات المخزون ضمن النطاق الطبيعي — لا توجد منتجات تحتاج إعادة طلب عاجلة' })
    return list
  }, [kpis, fmt])

  return (
    <DomainShell
      icon={Package} iconColor="text-blue-600" iconBg="bg-blue-50"
      title="ذكاء المخزون"
      subtitle="مراقبة مستمرة لكميات المنتجات — اعرف ما يقترب من النفاد، وقيمة مخزونك الإجمالية، وتوزيع المنتجات حسب الفئة. يساعدك في التخطيط المسبق لطلبات الشراء."
      hint="المنتجات باللون الأحمر تحتاج إعادة طلب فوراً. استخدم فلتر الفئة أعلاه للتركيز على فئة معينة."
    >
      <ReportBuilder categories={categories} />

      <ReportShell
        domain="inventory" domainLabel="ذكاء المخزون"
        exportRows={exportRows} exportFilename="inventory-report"
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
                <p className="text-sm text-gray-500">أرقام المخزون الإجمالية</p>
                <SummaryView cards={[
                  { title: 'إجمالي الأصناف',    value: kpis.totalItems.toString(),  icon: Package,       iconColor: 'text-blue-600',    iconBg: 'bg-blue-50',   sub: 'عدد المنتجات في المخزون' },
                  { title: 'مخزون منخفض',        value: kpis.lowStock.toString(),    icon: AlertTriangle, iconColor: 'text-amber-600',   iconBg: 'bg-amber-50',  trendUp: false, sub: 'تحت الحد الأدنى المحدد' },
                  { title: 'قيمة المخزون',       value: fmt(kpis.totalValue),        icon: TrendingDown,  iconColor: 'text-violet-600',  iconBg: 'bg-violet-50', sub: 'سعر التكلفة × الكمية' },
                  { title: 'نافد من المخزون',    value: kpis.outOfStock.toString(),  icon: CheckCircle,   iconColor: 'text-red-600',     iconBg: 'bg-red-50',    trendUp: false, sub: 'الكمية = صفر' },
                ]} />
              </>
            )}
            {view === 'trend' && (
              <>
                <p className="text-sm text-gray-500">توزيع المنتجات حسب الفئة</p>
                <TrendView data={categoryDistribution} series={[{ key: 'count', label: 'عدد الأصناف', type: 'bar', color: '#3b82f6' }]} yLabel="صنف" />
              </>
            )}
            {view === 'table' && (
              <>
                <p className="text-sm text-gray-500">قائمة كاملة بجميع المنتجات — اضغط على رأس العمود للترتيب</p>
                <TableView<TableRow> rows={items} cols={tableCols} emptyText="لا توجد أصناف في المخزون" />
              </>
            )}
            {view === 'ranking' && (
              <>
                <p className="text-sm text-gray-500">المنتجات مرتبة من الأعلى كمية إلى الأدنى</p>
                <RankingView items={items.map(i => ({ label: i.displayName, value: i.quantity, sub: i.displayCategory }))} valueLabel="الكمية المتاحة" />
              </>
            )}
          </div>
        )}
      </ReportShell>
    </DomainShell>
  )
}
