import client from './client';

export const organizationsApi = {
  // System admin
  list: () => client.get('/organizations'),
  create: (data: { name: string; slug: string; type: string }) =>
    client.post('/organizations', data),
  addBranch: (orgId: string, data: { tenantId: string; branchRole?: string }) =>
    client.post(`/organizations/${orgId}/branches`, data),
  removeBranch: (orgId: string, tenantId: string) =>
    client.delete(`/organizations/${orgId}/branches/${tenantId}`),

  // Chain admin
  getBranches: () => client.get('/org/branches'),
  getAggregatedInventory: () => client.get('/org/inventory/aggregated'),
  getOrders: () => client.get('/org/orders'),
  getSpendAnalytics: () => client.get('/org/analytics/spend'),
};
