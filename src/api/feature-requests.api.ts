import api from './client'

export interface FeatureRequestResponse {
  id: string
  trackingNumber: string
  question: string
  hint: string | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
}

export const featureRequestsApi = {
  submit: (question: string, hint?: string): Promise<FeatureRequestResponse> =>
    api.post<FeatureRequestResponse>('/pharmacy/feature-requests', { question, hint }).then(r => r.data),

  list: (): Promise<FeatureRequestResponse[]> =>
    api.get<FeatureRequestResponse[]>('/pharmacy/feature-requests').then(r => r.data),
}
