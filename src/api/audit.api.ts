import client from './client';

export const auditApi = {
  query: (params: {
    resource?: string;
    userId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) => client.get('/audit', { params }),

  pollKcEvents: () => client.post('/admin/kc-events/poll'),
};
