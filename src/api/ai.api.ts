import client from './client';

export const aiApi = {
  getRecommendations: () =>
    client.get('/ai/recommendations'),

  /** Enqueue generation — returns { jobId, status: 'queued' } immediately */
  generate: () =>
    client.post('/ai/recommendations/generate'),

  /** Poll job status — { status, progress, recommendations?, error?, attempts? } */
  getJobStatus: (jobId: string) =>
    client.get(`/ai/recommendations/job/${jobId}`),

  dismiss: (id: string) =>
    client.patch(`/ai/recommendations/${id}/dismiss`),

  submitFeedback: (id: string, score: 1 | -1, note?: string) =>
    client.patch(`/ai/recommendations/${id}/feedback`, { score, note }),

  getAuditLogs: () =>
    client.get('/ai/audit-logs'),
};
