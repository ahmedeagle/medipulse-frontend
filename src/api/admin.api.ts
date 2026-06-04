import client from './client'

export const adminApi = {
  getTenants: () =>
    client.get('/admin/tenants'),

  createTenant: (data: { name: string; slug: string; type: 'pharmacy' | 'supplier' }) =>
    client.post('/admin/tenants', data),

  getUsers: () =>
    client.get('/admin/users'),

  deactivateUser: (id: string) =>
    client.patch(`/admin/users/${id}/deactivate`),

  getStats: () =>
    client.get('/admin/stats'),
}
