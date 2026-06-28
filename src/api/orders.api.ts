import client from './client';

export const ordersApi = {
  // ── List & detail ─────────────────────────────────────────────────────────
  getAll: (params?: {
    status?: string; supplierTenantId?: string;
    from?: string; to?: string; take?: number; skip?: number;
  }) => client.get('/orders', { params }),

  getOne: (id: string) => client.get(`/orders/${id}`),

  // ── AI plan-context (real explainability, not generic copy) ───────────────
  getAiContext: (id: string) => client.get<{
    originDraftId:     string | null;
    planSnapshot:      any | null;
    supplierCity:      string | null;
    buyerCity:         string | null;
    sameCity:          boolean | null;
    splitSource:       'p2p' | 'supplier' | null;
    suggestedQuantity: number | null;
    unitPriceAtDraft:  number | null;
  }>(`/orders/${id}/ai-context`),

  // ── Create ────────────────────────────────────────────────────────────────
  create: (data: {
    supplierTenantId: string;
    items: { productId: string; quantity: number; unitPrice: number }[];
    notes?: string;
    allowDuplicate?: boolean;
  }) => client.post('/orders', data),

  // ── Status transitions (supplier) ─────────────────────────────────────────
  updateStatus: (id: string, status: string, reason?: string) =>
    client.patch(`/orders/${id}/status`, { status, reason }),

  // ── Edit line quantities (pharmacy, before supplier acts) ─────────────────
  updateItems: (id: string, items: { orderItemId: string; quantity: number }[]) =>
    client.patch(`/orders/${id}/items`, { items }),

  // ── Approval (pharmacy director) ──────────────────────────────────────────
  approve: (id: string) => client.post(`/orders/${id}/approve`),

  // ── Receipt confirmation (pharmacy) ───────────────────────────────────────
  confirmReceipt: (id: string, data: {
    items: Array<{
      orderItemId:      string;
      quantityAccepted: number;
      quantityRejected?: number;
      rejectionReason?:  string;
      batchNumber?:      string;
      expiryDateOnBatch?: string;
    }>;
    deliveryProofUrl?: string;
    recipientName?:    string;
  }) => client.post(`/orders/${id}/receive`, data),

  // ── Dispute & hold ────────────────────────────────────────────────────────
  dispute: (id: string, reason: string) =>
    client.post(`/orders/${id}/dispute`, { reason }),

  hold: (id: string, reason: string) =>
    client.post(`/orders/${id}/hold`, { reason }),

  // ── Returns ───────────────────────────────────────────────────────────────
  initiateReturn: (id: string, items: Array<{
    orderItemId: string; productId: string; quantity: number; returnReason: string;
  }>) => client.post(`/orders/${id}/return`, { items }),

  getReturns: (id: string) => client.get(`/orders/${id}/returns`),

  // ── Comments ──────────────────────────────────────────────────────────────
  getComments: (id: string) => client.get(`/orders/${id}/comments`),
  addComment:  (id: string, body: string) => client.post(`/orders/${id}/comments`, { body }),

  // ── Invoice (ZATCA) ───────────────────────────────────────────────────────
  getInvoice: (id: string) => client.get(`/orders/${id}/invoice`),
};
