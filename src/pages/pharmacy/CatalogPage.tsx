import { useState } from 'react'
import { Search, CheckCircle, XCircle } from 'lucide-react'
import { VoiceMicButton } from '../../components/ui/VoiceMicButton'
import { supplierApi } from '../../api/supplier.api'
import { Table } from '../../components/ui/Table'
import Pagination from '../../components/ui/Pagination'
import { FullPageSpinner } from '../../components/ui/Spinner'
import { usePaginatedList } from '../../hooks/usePaginatedList'
import type { SupplierCatalogItem } from '../../types'

export default function CatalogPage() {
  const [search, setSearch] = useState('')

  const list = usePaginatedList<SupplierCatalogItem>({
    queryKey: ['supplier-catalog-all'],
    fetchPage: ({ limit, offset }) =>
      supplierApi.getCatalog({ limit, offset }).then((r) => r.data),
  })

  const catalog = list.items
  // Search filters only the current page (server returns 25 at a time).
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

  if (list.isLoading) return <FullPageSpinner />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Supplier Catalog</h1>
        <p className="text-sm text-gray-500 mt-0.5">Browse products available from all suppliers</p>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by product or supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9 py-2 w-full text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {!search && <VoiceMicButton onResult={setSearch} className="absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>

      {list.isError ? (
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
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
            isLoading={list.isFetching}
          />
        </div>
      )}
    </div>
  )
}

