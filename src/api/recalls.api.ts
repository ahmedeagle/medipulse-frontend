import client from './client';

export const recallsApi = {
  list:    (params?: { limit?: number; offset?: number }) =>
    client.get('/admin/recalls', { params }),
  create:  (data: {
    productId:             string;
    batchNumber?:          string;
    recallType:            'urgent' | 'voluntary' | 'market_withdrawal';
    recallReferenceNumber: string;
    description?:          string;
    effectiveAt?:          string;
    resolutionDeadline?:   string;
  }) => client.post('/admin/recalls', data),
  resolve: (id: string) => client.patch(`/admin/recalls/${id}/resolve`),
};
