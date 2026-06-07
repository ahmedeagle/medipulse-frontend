import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Package, AlertTriangle, ShoppingCart, Sparkles, Loader2 } from 'lucide-react'
import { inventoryApi } from '../../api/inventory.api'
import { ordersApi } from '../../api/orders.api'
import { aiCenterApi } from '../../api/ai-center.api'
import { StatCard } from '../../components/ui/StatCard'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { FullPageSpinner } from '../../components/ui/Spinner'
import type { InventoryItem, Order } from '../../types'

export default function PharmacyDashboardPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: inventoryData, isLoading: invLoading } = useQuery({
    queryKey: ['inventory', 'dashboard'],
    queryFn: () => inventoryApi.getAll({ limit: 200 }).then((r) => r.data?.data ?? r.data),
  })
  const { data: lowStockData } = useQuery({
    queryKey: ['inventory', 'low-stock', 'dashboard'],
    queryFn: () => inventoryApi.getLowStock({ limit: 200 }).then((r) => r.data?.data ?? r.data),
  })
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', 'dashboard'],
    queryFn: () => ordersApi.getAll({ take: 200 }).then((r) => r.data),
  })
  const { data: aiData } = useQuery({
    queryKey: ['ai-center', 'workforce-summary'],
    queryFn:  aiCenterApi.workforceSummary,
  })

  const generateMutation = useMutation({
    mutationFn: () => aiCenterApi.generate(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-center'] }),
  })

  const inventory: InventoryItem[] = inventoryData || []
  const lowStock: InventoryItem[] = lowStockData || []
  const orders: Order[] = (ordersData as any)?.data ?? ordersData ?? []
  const pendingApprovals = aiData?.pendingApprovals.total ?? 0

  const pendingOrders = orders.filter((o) =>
    ['submitted', 'accepted', 'shipped', 'received_pending_qc'].includes(o.status)
  )
  const activeRecs = { length: pendingApprovals }

  if (invLoading || ordersLoading) return <FullPageSpinner />

  const lowStockCols = [
    { key: 'product',       header: t('inventory.product_name'), render: (_: any, row: InventoryItem) => row.product?.name },
    { key: 'category',      header: t('inventory.category'),    render: (_: any, row: InventoryItem) => row.product?.category || '—' },
    { key: 'quantity',      header: t('inventory.quantity'),    render: (_: any, row: InventoryItem) => <span className="font-medium text-red-600">{row.quantity}</span> },
    { key: 'minThreshold',  header: t('inventory.threshold') },
  ]

  const orderCols = [
    {
      key: 'id',
      header: t('order.order_id'),
      render: (_: any, row: Order) => <span className="font-mono text-xs text-gray-500">{row.id.slice(0, 8)}…</span>,
    },
    {
      key: 'supplierTenant',
      header: t('order.supplier'),
      render: (_: any, row: Order) => row.supplierTenant?.name || '—',
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (_: any, row: Order) => <Badge status={row.status} />,
    },
    {
      key: 'totalAmount',
      header: t('order.total'),
      render: (_: any, row: Order) => `${t('common.currency')} ${Number(row.totalAmount).toFixed(2)}`,
    },
    {
      key: 'createdAt',
      header: t('common.date'),
      render: (_: any, row: Order) => new Date(row.createdAt).toLocaleDateString('ar-SA'),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{t('dashboard.subtitle')}</p>
        </div>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {generateMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {generateMutation.isPending ? t('dashboard.generating') : t('dashboard.generate_ai')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title={t('dashboard.total_products')}   value={inventory.length} icon={Package}      iconColor="text-teal-600"   iconBg="bg-teal-50"   />
        <StatCard title={t('dashboard.low_stock_alerts')} value={lowStock.length}  icon={AlertTriangle} iconColor="text-amber-600"  iconBg="bg-amber-50"  />
        <StatCard title={t('dashboard.pending_orders')}   value={pendingOrders.length} icon={ShoppingCart} iconColor="text-purple-600" iconBg="bg-purple-50" />
        <StatCard title={t('dashboard.ai_count')}         value={activeRecs.length} icon={Sparkles}    iconColor="text-indigo-600" iconBg="bg-indigo-50" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            {t('dashboard.low_stock_section')}
          </h2>
          <Table columns={lowStockCols} data={lowStock.slice(0, 5)} emptyMessage={t('dashboard.no_low_stock')} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ShoppingCart size={16} className="text-teal-500" />
            {t('dashboard.recent_orders_section')}
          </h2>
          <Table columns={orderCols} data={orders.slice(0, 5)} emptyMessage={t('dashboard.no_orders')} />
        </div>
      </div>
    </div>
  )
}
