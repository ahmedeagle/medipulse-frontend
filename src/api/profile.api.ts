import client from './client';

export const profileApi = {
  // Supplier
  getOwn: () => client.get('/supplier/profile'),
  upsert: (data: Record<string, any>) => client.post('/supplier/profile', data),
  getDemandSignals: () => client.get('/supplier/demand-signals'),
  importCatalogCsv: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return client.post('/supplier/catalog/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Admin: browse / verify supplier profiles
  listAll: (status?: string) =>
    client.get(`/supplier/profile/all${status ? `?status=${status}` : ''}`),
  verify: (supplierTenantId: string) =>
    client.patch(`/admin/supplier-profiles/${supplierTenantId}/verify`),
  reject: (supplierTenantId: string, reason: string) =>
    client.patch(`/admin/supplier-profiles/${supplierTenantId}/reject`, { reason }),
  suspend: (supplierTenantId: string) =>
    client.patch(`/admin/supplier-profiles/${supplierTenantId}/suspend`),
};
