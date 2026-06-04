import client from './client';

export const procurementApi = {
  getQueue: () =>
    client.get('/procurement/queue'),

  getDrafts: () =>
    client.get('/procurement/drafts'),

  approveDraft: (id: string) =>
    client.post(`/procurement/drafts/${id}/approve`),

  rejectDraft: (id: string, reason?: string) =>
    client.delete(`/procurement/drafts/${id}`, { data: { reason } }),
};
