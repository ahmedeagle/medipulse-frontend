import client from './client';

export type NeedUrgency = 'normal' | 'urgent' | 'critical';
export type NeedStatus = 'open' | 'sourced' | 'fulfilled' | 'cancelled' | 'expired';

export interface NeedSplit {
  source: 'p2p' | 'supplier';
  sourceName: string;
  qty: number;
  unitPrice: number;
  reliabilityScore: number | null;
  reason: string;
}

export interface NeedSnapshot {
  splits: NeedSplit[];
  totalCost: number;
  bestUnitPrice: number | null;
  insufficientSupply: boolean;
  confidence: number;
  savedVsHistoricalAvg: number | null;
  delayReason: string | null;
}

export interface DrugNeed {
  id: string;
  productId: string | null;
  productName: string;
  requestedQty: number;
  urgency: NeedUrgency;
  status: NeedStatus;
  region: string | null;
  sourceOptionsCount: number;
  resultSnapshot: NeedSnapshot | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNeedPayload {
  productName: string;
  requestedQty: number;
  urgency?: NeedUrgency;
  productId?: string;
}

export interface CreateNeedResult {
  need: DrugNeed;
  plan: unknown | null;
}

export const needsApi = {
  create: (payload: CreateNeedPayload) =>
    client.post<CreateNeedResult>('/needs', payload).then((r) => r.data),

  list: (status?: NeedStatus) =>
    client
      .get<DrugNeed[]>('/needs', { params: status ? { status } : undefined })
      .then((r) => r.data),

  cancel: (id: string) =>
    client.patch<DrugNeed>(`/needs/${id}/cancel`).then((r) => r.data),
};
