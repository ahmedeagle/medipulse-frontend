import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, CheckCircle, XCircle } from 'lucide-react'
import { supplierApi } from '../../api/supplier.api'
import { Table } from '../../components/ui/Table'
import { FullPageSpinner } from '../../components/ui/Spinner'
import type { SupplierCatalogItem } from '../../types'

export default function CatalogPage() {
  const [search, setSearch] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supplier-catalog-all'],
    queryFn: () => supplierApi.getCatalog().then((r) => r.data),
  })

  const catalog: SupplierCatalogItem[] = data || []

  const filtered = catalog.filter((item) =>
    item.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
    item.supplierTenant?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: (_: any, row: SupplierCatalogItem) => (
        <div>
          <p className="font-medium text-gray-900">{row.product?.name}</p>
          {row.product?.genericName && (
            <p className="text-xs text-gray-400">{row.product.genericName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (_: any, row: SupplierCatalogItem) => row.product?.category || 'â€”',
    },
    {
      key: 'supplierTenant',
      header: 'Supplier',
      render: (_: any, row: SupplierCatalogItem) => (
        <span className="text-sm font-medium text-indigo-700">{row.supplierTenant?.name || 'â€”'}</span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      render: (_: any, row: SupplierCatalogItem) => (
        <span className="font-semibold text-gray-900">
          {row.currency || 'SAR'} {Number(row.price).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (_: any, row: SupplierCatalogItem) => (
        <span className={row.stock <= 0 ? 'text-red-600 font-medium' : 'text-gray-700'}>
          {row.stock}
        </span>
      ),
    },
    {
      key: 'isAvailable',
      header: 'Available',
      render: (_: any, row: SupplierCatalogItem) =>
        row.isAvailable ? (
          <CheckCircle size={18} className="text-green-500" />
        ) : (
          <XCircle size={18} className="text-red-400" />
        ),
    },
  ]

  if (isLoading) return <FullPageSpinner />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Supplier Catalog</h1>
        <p className="text-sm text-gray-500 mt-0.5">Browse products available from all suppliers</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by product or supplierâ€¦"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-4 py-2 w-full max-w-sm text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {isError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Failed to load supplier catalog. Please try again.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <Table
            columns={columns}
            data={filtered}
            emptyMessage="No products found in the catalog."
          />
        </div>
      )}

      <p className="text-xs text-gray-400">
        Showing {filtered.length} of {catalog.length} catalog items. Go to Orders to place a new order.
      </p>
    </div>
  )
}

