import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Eye, CheckCircle, XCircle, Truck, PackageCheck } from 'lucide-react'
import { ordersApi } from '../../api/orders.api'
import { Modal } from '../../components/ui/Modal'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { FullPageSpinner } from '../../components/ui/Spinner'
import type { Order } from '../../types'

export default function SupplierOrdersPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [viewOrder, setViewOrder] = useState<Order | null>(null)

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.getAll().then((r) => r.data),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      ordersApi.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const orders: Order[] = (ordersData as any)?.data ?? ordersData ?? []

  const columns = [
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
      render: (_: any, row: Order) => (
        <span className="font-medium text-gray-800">{row.pharmacyTenant?.name || 'â€”'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (_: any, row: Order) => <Badge status={row.status} />,
    },
    {
      key: 'totalAmount',
      header: 'Total',
      render: (_: any, row: Order) => (
        <span className="font-semibold text-gray-900">SAR {Number(row.totalAmount).toFixed(2)}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (_: any, row: Order) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, row: Order) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/supplier/orders/${row.id}`) }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Eye size={14} />
            View
          </button>

          {row.status === 'pending' && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); statusMutation.mutate({ id: row.id, status: 'accepted' }) }}
                disabled={statusMutation.isPending}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
              >
                <CheckCircle size={14} />
                Accept
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm('Cancel this order?')) statusMutation.mutate({ id: row.id, status: 'cancelled' }) }}
                disabled={statusMutation.isPending}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                <XCircle size={14} />
                Reject
              </button>
            </>
          )}

          {row.status === 'accepted' && (
            <button
              onClick={(e) => { e.stopPropagation(); statusMutation.mutate({ id: row.id, status: 'shipped' }) }}
              disabled={statusMutation.isPending}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
            >
              <Truck size={14} />
              Mark Shipped
            </button>
          )}

          {row.status === 'shipped' && (
            <button
              onClick={(e) => { e.stopPropagation(); statusMutation.mutate({ id: row.id, status: 'delivered' }) }}
              disabled={statusMutation.isPending}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
            >
              <PackageCheck size={14} />
              Mark Delivered
            </button>
          )}
        </div>
      ),
    },
  ]

  if (isLoading) return <FullPageSpinner />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incoming Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {orders.filter((o) => o.status === 'pending').length} pending Â· {orders.length} total
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table
          columns={columns}
          data={orders}
          onRowClick={(row) => setViewOrder(row)}
          emptyMessage="No orders received yet."
        />
      </div>

      <Modal isOpen={!!viewOrder} onClose={() => setViewOrder(null)} title="Order Details" size="lg">
        {viewOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Order ID</p>
                <p className="font-mono font-medium">{viewOrder.id.slice(0, 8)}â€¦</p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <Badge status={viewOrder.status} />
              </div>
              <div>
                <p className="text-gray-500">Pharmacy</p>
                <p className="font-medium">{viewOrder.pharmacyTenant?.name || 'â€”'}</p>
              </div>
              <div>
                <p className="text-gray-500">Date</p>
                <p className="font-medium">{new Date(viewOrder.createdAt).toLocaleDateString()}</p>
              </div>
              {viewOrder.notes && (
                <div className="col-span-2">
                  <p className="text-gray-500">Notes</p>
                  <p className="text-gray-800">{viewOrder.notes}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Items</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Product</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">Qty</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">Unit Price</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewOrder.items?.map((item, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="px-4 py-2.5 text-gray-800">{item.product?.name}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{item.quantity}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">SAR {Number(item.unitPrice).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">SAR {Number(item.totalPrice).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-4 py-2.5 text-right font-semibold text-gray-700">Total</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">SAR {Number(viewOrder.totalAmount).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              {viewOrder.status === 'pending' && (
                <>
                  <button
                    onClick={() => { statusMutation.mutate({ id: viewOrder.id, status: 'accepted' }); setViewOrder(null) }}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                  >
                    <CheckCircle size={15} />
                    Accept Order
                  </button>
                  <button
                    onClick={() => { statusMutation.mutate({ id: viewOrder.id, status: 'cancelled' }); setViewOrder(null) }}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                  >
                    <XCircle size={15} />
                    Reject Order
                  </button>
                </>
              )}
              {viewOrder.status === 'accepted' && (
                <button
                  onClick={() => { statusMutation.mutate({ id: viewOrder.id, status: 'shipped' }); setViewOrder(null) }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  <Truck size={15} />
                  Mark as Shipped
                </button>
              )}
              {viewOrder.status === 'shipped' && (
                <button
                  onClick={() => { statusMutation.mutate({ id: viewOrder.id, status: 'delivered' }); setViewOrder(null) }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                >
                  <PackageCheck size={15} />
                  Mark as Delivered
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

