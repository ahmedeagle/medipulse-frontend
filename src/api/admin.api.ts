import client from './client'

export const adminApi = {
  getTenants: (params?: { limit?: number; offset?: number }) =>
    client.get('/admin/tenants', { params }),

  createTenant: (data: { name: string; slug: string; type: 'pharmacy' | 'supplier' }) =>
    client.post('/admin/tenants', data),

  getUsers: (params?: { limit?: number; offset?: number }) =>
    client.get('/admin/users', { params }),

  deactivateUser: (id: string) =>
    client.patch(`/admin/users/${id}/deactivate`),

  getStats: () =>
    client.get('/admin/stats'),
}
