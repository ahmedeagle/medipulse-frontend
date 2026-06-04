import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, AlertCircle, CheckCircle, XCircle, PlusCircle } from 'lucide-react'
import { supplierApi } from '../../api/supplier.api'
import { inventoryApi } from '../../api/inventory.api'
import { BarcodeInput } from '../../components/BarcodeInput'
import { Modal } from '../../components/ui/Modal'
import { Table } from '../../components/ui/Table'
import { FullPageSpinner } from '../../components/ui/Spinner'
import type { SupplierCatalogItem, Product } from '../../types'

interface AddForm {
  productId: string
  price: string
  stock: string
  currency: string
}

interface EditForm {
  price: string
  stock: string
  isAvailable: boolean
}

export default function SupplierCatalogPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<SupplierCatalogItem | null>(null)
  const [addForm, setAddForm] = useState<AddForm>({ productId: '', price: '', stock: '', currency: 'SAR' })
  const [editForm, setEditForm] = useState<EditForm>({ price: '', stock: '', isAvailable: true })
  const [formError, setFormError] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', genericName: '', category: '', unit: 'tablet' })

  const { data: catalogData, isLoading } = useQuery({
    queryKey: ['supplier-catalog'],
    queryFn: () => supplierApi.getCatalog().then((r) => r.data),
  })

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => inventoryApi.getProducts().then((r) => r.data),
  })

  const createProductMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.createProduct(data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['products'] })
      setAddForm((f) => ({ ...f, productId: res.data.id }))
      setShowNewProduct(false)
      setNewProduct({ name: '', genericName: '', category: '', unit: 'tablet' })
    },
    onError: (err: any) => setFormError(err?.response?.data?.message || 'Failed to create product.'),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => supplierApi.createCatalogItem(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-catalog'] })
      setShowAdd(false)
      setAddForm({ productId: '', price: '', stock: '', currency: 'SAR' })
      setProductSearch('')
      setFormError(null)
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message || 'Failed to add product.')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => supplierApi.updateCatalogItem(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-catalog'] })
      setEditItem(null)
      setFormError(null)
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message || 'Failed to update.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => supplierApi.deleteCatalogItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-catalog'] }),
  })

  const catalog: SupplierCatalogItem[] = catalogData || []
  const products: Product[] = (productsData as any)?.data ?? productsData ?? []

  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: (_: any, row: SupplierCatalogItem) => (
        <div>
          <p className="font-medium text-gray-900">{row.product?.name}</p>
          {row.product?.category && (
            <p className="text-xs text-gray-400">{row.product.category}</p>
          )}
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      render: (_: any, row: SupplierCatalogItem) => (
        <span className="font-semibold text-gray-900">{row.currency} {Number(row.price).toFixed(2)}</span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (_: any, row: SupplierCatalogItem) => (
        <span className={row.stock <= 0 ? 'text-red-600 font-semibold' : 'text-gray-700 font-medium'}>
          {row.stock}
        </span>
      ),
    },
    {
      key: 'isAvailable',
      header: 'Available',
      render: (_: any, row: SupplierCatalogItem) =>
        row.isAvailable ? (
          <span className="flex items-center gap-1 text-green-600 text-sm"><CheckCircle size={15} /> Yes</span>
        ) : (
          <span className="flex items-center gap-1 text-red-500 text-sm"><XCircle size={15} /> No</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, row: SupplierCatalogItem) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setEditItem(row)
              setEditForm({ price: String(row.price), stock: String(row.stock), isAvailable: row.isAvailable })
              setFormError(null)
            }}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (confirm('Remove this product from your catalog?')) deleteMutation.mutate(row.id)
            }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ]

  if (isLoading) return <FullPageSpinner />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Catalog</h1>
          <p className="text-sm text-gray-500 mt-0.5">{catalog.length} products listed</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setFormError(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Product
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table columns={columns} data={catalog} emptyMessage="Your catalog is empty. Add your first product." />
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Product to Catalog">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate({
              productId: addForm.productId,
              price: Number(addForm.price),
              stock: Number(addForm.stock),
              currency: addForm.currency,
            })
          }}
          className="space-y-4"
        >
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              {formError}
            </div>
          )}

          {/* Barcode lookup — fastest way to find a product */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Scan / Enter Barcode (optional)</label>
            <BarcodeInput
              onFound={(result) => {
                if (result.productId) {
                  setAddForm((f) => ({ ...f, productId: result.productId! }));
                }
                if (result.name) setProductSearch(result.name);
              }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Product</label>
              <button type="button" onClick={() => setShowNewProduct(!showNewProduct)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                <PlusCircle size={13} /> Add new product
              </button>
            </div>

            {showNewProduct && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <p className="text-xs text-blue-700 font-medium">Create new product (will be reviewed by admin)</p>
                <input placeholder="Product name *" required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} />
                <input placeholder="Generic name (e.g. Amoxicillin)"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newProduct.genericName} onChange={(e) => setNewProduct((p) => ({ ...p, genericName: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Category (e.g. antibiotic)"
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newProduct.category} onChange={(e) => setNewProduct((p) => ({ ...p, category: e.target.value }))} />
                  <select className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newProduct.unit} onChange={(e) => setNewProduct((p) => ({ ...p, unit: e.target.value }))}>
                    {['tablet','capsule','syrup','injection','cream','drops','inhaler'].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <button type="button" disabled={!newProduct.name || createProductMutation.isPending}
                  onClick={() => createProductMutation.mutate(newProduct)}
                  className="w-full py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {createProductMutation.isPending ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            )}

            <input placeholder="Search products..."
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-1"
              value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
            <select required value={addForm.productId}
              onChange={(e) => setAddForm({ ...addForm, productId: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              size={Math.min(6, (products.filter((p: any) => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()))).length + 1)}>
              <option value="">Select a product</option>
              {products.filter((p: any) => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()))
                .map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}{p.genericName ? ` (${p.genericName})` : ''}</option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={addForm.price}
                onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
              <select
                value={addForm.currency}
                onChange={(e) => setAddForm({ ...addForm, currency: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Stock Quantity</label>
            <input
              type="number"
              min={0}
              required
              value={addForm.stock}
              onChange={(e) => setAddForm({ ...addForm, stock: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors">
              {createMutation.isPending ? 'Adding…' : 'Add to Catalog'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="Edit Catalog Item">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!editItem) return
            updateMutation.mutate({
              id: editItem.id,
              data: {
                price: Number(editForm.price),
                stock: Number(editForm.stock),
                isAvailable: editForm.isAvailable,
              },
            })
          }}
          className="space-y-4"
        >
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              {formError}
            </div>
          )}

          <p className="text-sm font-medium text-gray-700">{editItem?.product?.name}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={editForm.price}
                onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Stock</label>
              <input
                type="number"
                min={0}
                required
                value={editForm.stock}
                onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isAvailable"
              checked={editForm.isAvailable}
              onChange={(e) => setEditForm({ ...editForm, isAvailable: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="isAvailable" className="text-sm font-medium text-gray-700">
              Available for purchase
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditItem(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={updateMutation.isPending} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors">
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
