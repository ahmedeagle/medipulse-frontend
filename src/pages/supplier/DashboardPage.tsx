import { useQuery } from '@tanstack/react-query'
import { ListChecks, ShoppingCart, Package } from 'lucide-react'
import { supplierApi } from '../../api/supplier.api'
import { ordersApi } from '../../api/orders.api'
import { StatCard } from '../../components/ui/StatCard'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { FullPageSpinner } from '../../components/ui/Spinner'
import type { Order, SupplierCatalogItem } from '../../types'

export default function SupplierDashboardPage() {
  const { data: catalogData, isLoading: catLoading } = useQuery({
    queryKey: ['supplier-catalog'],
    queryFn: () => supplierApi.getCatalog().then((r) => r.data),
  })

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.getAll().then((r) => r.data),
  })

  const catalog: SupplierCatalogItem[] = catalogData || []
  const orders: Order[] = (ordersData as any)?.data ?? ordersData ?? []
  const pendingOrders = orders.filter((o) => ['submitted','pending'].includes(o.status as string))

  if (catLoading || ordersLoading) return <FullPageSpinner />

  const orderColumns = [
    {
      key: 'id',
      header: 'Order ID',
      render: (_: any, row: Order) => (
        <span className="font-mono text-xs text-gray-500">{row.id.slice(0, 8)}â€¦</span>
      ),
    },
    {
      key: 'pharmacyTenant',
      header: 'Pharmacy',
      render: (_: any, row: Order) => row.pharmacyTenant?.name || 'â€”',
    },
    {
      key: 'status',
      header: 'Status',
      render: (_: any, row: Order) => <Badge status={row.status} />,
    },
    {
      key: 'totalAmount',
      header: 'Total',
      render: (_: any, row: Order) => `SAR ${Number(row.totalAmount).toFixed(2)}`,
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (_: any, row: Order) => new Date(row.createdAt).toLocaleDateString(),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Supplier Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of your catalog and incoming orders</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Products in Catalog"
          value={catalog.length}
          icon={ListChecks}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <StatCard
          title="Pending Orders"
          value={pendingOrders.length}
          icon={Package}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <StatCard
          title="Total Orders"
          value={orders.length}
          icon={ShoppingCart}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Recent Incoming Orders</h2>
        <Table
          columns={orderColumns}
          data={orders.slice(0, 10)}
          emptyMessage="No orders received yet."
        />
      </div>
    </div>
  )
}

