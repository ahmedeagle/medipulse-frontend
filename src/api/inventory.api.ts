import client from './client'

export interface CreateProductPayload {
  name: string
  nameAr?: string
  genericName?: string
  activeIngredient?: string
  category: string
  unit: string
  dosageForm?: string
  strength?: string
  sku?: string
  barcode?: string
  description?: string
  atcCode?: string
  manufacturer?: string
  sfdaRegistration?: string
  edaRegistration?: string
  taxRate?: number
  isActive?: boolean
  disablePOSSale?: boolean
  disablePurchase?: boolean
  returnable?: boolean
  discountAllowed?: boolean
  forceCreate?: boolean
}

export interface CreateProductWithBatchPayload extends CreateProductPayload {
  batchNumber?: string
  batchQuantity?: number
  minThreshold?: number
  noExpiry?: boolean
  expiryDate?: string
  manufacturingDate?: string
  location?: string
  costPerUnit?: number
  sellingPrice?: number
  batchNotes?: string
}

export interface SmartProduct {
  id: string
  name: string
  nameAr?: string
  sku?: string
  barcode?: string
  category: string
  unit: string
  dosageForm?: string
  strength?: string
  activeIngredient?: string
  manufacturer?: string
  taxRate: number
  isActive: boolean
  disablePOSSale: boolean
  disablePurchase: boolean
  returnable: boolean
  discountAllowed: boolean
  requiresPrescription: boolean
  createdAt: string
  batchCount: number
  totalStock: number
  minThreshold: number
  nearestExpiry: string | null
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock'
  barcodeWarning: boolean
  imageUrl?: string | null
}

export const inventoryApi = {
  getAll: (params?: { limit?: number; offset?: number; q?: string }) =>
    client.get('/inventory', { params }),

  getLowStock: (params?: { limit?: number; offset?: number }) =>
    client.get('/inventory/low-stock', { params }),

  create: (data: {
    productId: string; quantity: number; minThreshold: number;
    expiryDate?: string; batchNumber?: string; location?: string;
    costPrice?: number; sellingPrice?: number;
  }) => client.post('/inventory', data),

  update: (id: string, data: {
    quantity?: number; minThreshold?: number; expiryDate?: string;
    batchNumber?: string; location?: string; costPrice?: number; sellingPrice?: number;
  }) => client.patch(`/inventory/${id}`, data),

  remove: (id: string) =>
    client.delete(`/inventory/${id}`),

  // ── Batches (per-lot tracking) ───────────────────────────────────────────
  listBatches: (inventoryId: string, params?: { limit?: number; offset?: number }) =>
    client.get(`/inventory/${inventoryId}/batches`, { params }),

  addBatch: (inventoryId: string, data: {
    batchNumber: string
    quantity: number
    noExpiry?: boolean
    expiryDate?: string
    manufacturingDate?: string
    location?: string
    costPerUnit?: number
    sellingPrice?: number
    notes?: string
  }) => client.post(`/inventory/${inventoryId}/batches`, data),

  adjustBatch: (batchId: string, data: { delta: number; reason?: string }) =>
    client.post(`/batches/${batchId}/adjust`, data),

  updateBatch: (batchId: string, data: {
    batchNumber?: string
    expiryDate?: string | null
    location?: string | null
    costPerUnit?: number
    sellingPrice?: number
    notes?: string | null
  }) => client.patch(`/batches/${batchId}`, data),

  removeBatch: (batchId: string) =>
    client.delete(`/batches/${batchId}`),

  // ── Catalog linking ──────────────────────────────────────────────────────
  matchCandidates: (
    inventoryItemId: string,
    profile?: { name?: string; nameAr?: string; barcode?: string; manufacturer?: string; strength?: string; dosageForm?: string; limit?: number },
  ) => client.get(`/inventory/${inventoryItemId}/match-candidates`, { params: profile || {} }),

  linkToProduct: (
    inventoryItemId: string,
    data: { productId: string; score?: number; signals?: string[]; reasons?: string[] },
  ) => client.post(`/inventory/${inventoryItemId}/link`, data),

  unlinkFromCatalog: (inventoryItemId: string, reason?: string) =>
    client.post(`/inventory/${inventoryItemId}/unlink`, { reason }),

  runMatching: () => client.post(`/inventory/run-matching`, {}),

  getProducts: (search?: string) =>
    client.get('/products', { params: search ? { search } : {} }),

  getSmartProducts: (params?: { search?: string; status?: string; take?: number; skip?: number }) =>
    client.get('/products/smart', { params }),

  createProduct: (data: CreateProductPayload) =>
    client.post('/products', data),

  createProductWithBatch: (data: CreateProductWithBatchPayload) =>
    client.post('/products/with-batch', data),

  uploadProductImage: (productId: string, file: File) => {
    const form = new FormData()
    form.append('image', file)
    return client.post(`/products/${productId}/image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  removeProductImage: (productId: string) =>
    client.delete(`/products/${productId}/image`),

  lookupBarcode: (barcode: string) =>
    client.get(`/products/barcode/${encodeURIComponent(barcode)}`),
}
