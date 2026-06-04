import client from './client';

export const connectionsApi = {
  list: () => client.get('/connections'),
  connect: (data: { supplierTenantId: string; priority?: number; notes?: string }) =>
    client.post('/connections', data),
  disconnect: (supplierTenantId: string) =>
    client.delete(`/connections/${supplierTenantId}`),
};
