import client from './client'

export interface CreateProductPayload {
  name: string
  nameAr?: string
  genericName?: string
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
}

export const inventoryApi = {
  getAll: (params?: { limit?: number; offset?: number }) =>
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

  createProduct: (data: CreateProductPayload) =>
    client.post('/products', data),

  lookupBarcode: (barcode: string) =>
    client.get(`/products/barcode/${encodeURIComponent(barcode)}`),
}
