import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Eye, AlertCircle, Trash2 } from 'lucide-react'
import { ordersApi } from '../../api/orders.api'
import { supplierApi } from '../../api/supplier.api'
import { Modal } from '../../components/ui/Modal'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { FullPageSpinner } from '../../components/ui/Spinner'
import Pagination from '../../components/ui/Pagination'
import { usePaginatedList } from '../../hooks/usePaginatedList'
import type { Order, SupplierCatalogItem } from '../../types'

interface CartItem {
  productId: string
  productName: string
  quantity: number
}

export default function PharmacyOrdersPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [showCreate, setShowCreate] = useState(false)
  const [viewOrder, setViewOrder] = useState<Order | null>(null)
  const [supplierTenantId, setSupplierTenantId] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const ordersList = usePaginatedList<Order>({
    queryKey: ['orders'],
    fetchPage: ({ limit, offset }) =>
      // orders API uses legacy take/skip names
      ordersApi.getAll({ take: limit, skip: offset } as any).then((r) => r.data),
  })
  const { data: catalogData } = useQuery({
    queryKey: ['supplier-catalog-all'],
    queryFn: () => supplierApi.getCatalog({ limit: 200 }).then((r) => r.data?.data ?? r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => ordersApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setShowCreate(false); resetCreateForm() },
    onError: (err: any) => setFormError(err?.response?.data?.message || t('errors.server_error')),
  })

  const orders: Order[] = ordersList.items
  const catalog: SupplierCatalogItem[] = catalogData || []

  const supplierIds = [...new Set(catalog.map((c) => c.supplierTenantId))]
  const supplierMap = catalog.reduce<Record<string, string>>((acc, c) => {
    if (c.supplierTenant) acc[c.supplierTenantId] = c.supplierTenant.name
    return acc
  }, {})

  const filteredCatalog = supplierTenantId
    ? catalog.filter((c) => c.supplierTenantId === supplierTenantId && c.isAvailable)
    : []

  function resetCreateForm() {
    setSupplierTenantId(''); setCart([]); setNotes(''); setFormError(null)
  }

  function addToCart(item: SupplierCatalogItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === item.product.id)
      if (existing) return prev.map((c) => c.productId === item.product.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { productId: item.product.id, productName: item.product.name, quantity: 1 }]
    })
  }

  function updateCartQty(productId: string, qty: number) {
    if (qty <= 0) setCart((prev) => prev.filter((c) => c.productId !== productId))
    else setCart((prev) => prev.map((c) => c.productId === productId ? { ...c, quantity: qty } : c))
  }

  const columns = [
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
    {
      key: 'actions',
      header: '',
      render: (_: any, row: Order) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/pharmacy/orders/${row.id}`) }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
        >
          <Eye size={14} />
          {t('common.view')}
        </button>
      ),
    },
  ]

  if (ordersList.isLoading) return <FullPageSpinner />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('order.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('order.total_count', { count: ordersList.total })}</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); resetCreateForm() }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Plus size={16} />
          {t('order.create')}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table columns={columns} data={orders} onRowClick={(row) => setViewOrder(row)} emptyMessage={t('order.no_orders')} />
        <Pagination
          page={ordersList.page}
          pageSize={ordersList.pageSize}
          total={ordersList.total}
          totalPages={ordersList.totalPages}
          onPageChange={ordersList.setPage}
          onPageSizeChange={ordersList.setPageSize}
          isLoading={ordersList.isFetching}
        />
      </div>

      {/* Create Order modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title={t('order.create')} size="lg">
        <div className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('order.select_supplier')}</label>
            <select
              value={supplierTenantId}
              onChange={(e) => { setSupplierTenantId(e.target.value); setCart([]) }}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">{t('order.choose_supplier')}</option>
              {supplierIds.map((id) => (
                <option key={id} value={id}>{supplierMap[id] || id}</option>
              ))}
            </select>
          </div>

          {supplierTenantId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('order.available_products')}</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-xl p-2">
                {filteredCatalog.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">{t('order.no_products_supplier')}</p>
                ) : (
                  filteredCatalog.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item.product?.name}</p>
                        <p className="text-xs text-gray-400">
                          {t('common.currency')} {Number(item.price).toFixed(2)} · {t('order.items')}: {item.stock}
                        </p>
                      </div>
                      <button
                        onClick={() => addToCart(item)}
                        className="text-xs px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg transition-colors"
                      >
                        {t('order.add_btn')}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {cart.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('order.cart_label')}</label>
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-800">{item.productName}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1} value={item.quantity}
                        onChange={(e) => updateCartQty(item.productId, Number(e.target.value))}
                        className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded-lg"
                      />
                      <button onClick={() => updateCartQty(item.productId, 0)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('order.notes_label')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t('order.notes_ph')}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">
              {t('common.cancel')}
            </button>
            <button
              onClick={() => {
                if (!supplierTenantId || cart.length === 0) { setFormError(t('order.empty_cart_error')); return }
                createMutation.mutate({
                  supplierTenantId,
                  items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
                  notes: notes || undefined,
                })
              }}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white rounded-xl"
            >
              {createMutation.isPending ? t('order.placing') : t('order.place')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Order details modal */}
      <Modal isOpen={!!viewOrder} onClose={() => setViewOrder(null)} title={t('order.details_title')} size="lg">
        {viewOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">{t('order.order_id')}</p>
                <p className="font-mono font-medium">{viewOrder.id.slice(0, 8)}…</p>
              </div>
              <div>
                <p className="text-gray-500">{t('common.status')}</p>
                <Badge status={viewOrder.status} />
              </div>
              <div>
                <p className="text-gray-500">{t('order.supplier')}</p>
                <p className="font-medium">{viewOrder.supplierTenant?.name || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">{t('common.date')}</p>
                <p className="font-medium">{new Date(viewOrder.createdAt).toLocaleDateString('ar-SA')}</p>
              </div>
              {viewOrder.notes && (
                <div className="col-span-2">
                  <p className="text-gray-500">{t('order.notes_label')}</p>
                  <p className="font-medium">{viewOrder.notes}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">{t('order.items')}</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-start px-4 py-2.5 font-medium text-gray-600">{t('order.product_col')}</th>
                      <th className="text-end px-4 py-2.5 font-medium text-gray-600">{t('order.qty_col')}</th>
                      <th className="text-end px-4 py-2.5 font-medium text-gray-600">{t('order.unit_price_col')}</th>
                      <th className="text-end px-4 py-2.5 font-medium text-gray-600">{t('order.total_col')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewOrder.items?.map((item, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="px-4 py-2.5 text-gray-800">{item.product?.name}</td>
                        <td className="px-4 py-2.5 text-end text-gray-700">{item.quantity}</td>
                        <td className="px-4 py-2.5 text-end text-gray-700">{t('common.currency')} {Number(item.unitPrice).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-end font-medium text-gray-900">{t('common.currency')} {Number(item.totalPrice).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-4 py-2.5 text-end font-semibold text-gray-700">{t('common.total')}</td>
                      <td className="px-4 py-2.5 text-end font-bold text-gray-900">{t('common.currency')} {Number(viewOrder.totalAmount).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
