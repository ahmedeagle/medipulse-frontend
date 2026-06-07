import client from './client'

export const supplierApi = {
  getCatalog: (params?: { limit?: number; offset?: number }) =>
    client.get('/supplier/catalog', { params }),

  createCatalogItem: (data: { productId: string; price: number; stock: number; currency?: string }) =>
    client.post('/supplier/catalog', data),

  updateCatalogItem: (id: string, data: { price?: number; stock?: number; isAvailable?: boolean }) =>
    client.patch(`/supplier/catalog/${id}`, data),

  deleteCatalogItem: (id: string) =>
    client.delete(`/supplier/catalog/${id}`),
}
