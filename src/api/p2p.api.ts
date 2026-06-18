import client from './client'
import type {
  SellerProfile, SellerStats, P2pListing, MarketplaceResult,
  P2pOrder, EnrichedP2pOrder, P2pTransferInvoice, P2pDispute, RulesResult, ExpiryAlert,
  ProcurementOpportunity, MarketIntelligence,
} from '../types/p2p'

// ── Seller profile ────────────────────────────────────────────────────────────

export const p2pSellerApi = {
  getProfile: () =>
    client.get<SellerProfile>('/p2p/seller/profile').then(r => r.data),

  upsertProfile: (data: Partial<SellerProfile>) =>
    client.put<SellerProfile>('/p2p/seller/profile', data).then(r => r.data),

  legalAck: () =>
    client.post('/p2p/seller/profile/legal-ack').then(() => undefined),

  resetLegalAck: () =>
    client.delete('/p2p/seller/profile/legal-ack').then(() => undefined),

  uploadDoc: (docType: string, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post<SellerProfile>(`/p2p/seller/docs/${docType}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    }).then(r => r.data)
  },

  getSellerStats: () =>
    client.get<SellerStats>('/p2p/seller/stats').then(r => r.data),

  getExpiryAlerts: () =>
    client.get<ExpiryAlert[]>('/p2p/seller/expiry-alerts').then(r => r.data),
}

// ── Listings ──────────────────────────────────────────────────────────────────

export interface CreateListingDto {
  inventoryItemId: string
  price: number
  quantity: number
  minOrderQty?: number
  expiryDate?: string
  listingType?: 'normal' | 'clearance' | 'emergency'
  offerType?: 'none' | 'discount' | 'bonus'
  discountPct?: number
  bonusQty?: number
  autoUpdateDiscount?: boolean
}

export const p2pListingApi = {
  validate: (data: CreateListingDto) =>
    client.post<RulesResult>('/p2p/listings/validate', data).then(r => r.data),

  create: (data: CreateListingDto) =>
    client.post<{ listing: P2pListing; issues: RulesResult }>('/p2p/listings', data).then(r => r.data),

  list: (params?: { limit?: number; offset?: number }) =>
    client.get<{ data: P2pListing[]; total: number; limit: number; offset: number }>(
      '/p2p/listings', { params },
    ).then(r => r.data),

  getOne: (id: string) =>
    client.get<{ listing: P2pListing; issues: RulesResult }>(`/p2p/listings/${id}`).then(r => r.data),

  update: (id: string, data: Partial<CreateListingDto>) =>
    client.patch<{ listing: P2pListing; issues: RulesResult }>(`/p2p/listings/${id}`, data).then(r => r.data),

  pause: (id: string) =>
    client.patch<P2pListing>(`/p2p/listings/${id}/pause`).then(r => r.data),

  resume: (id: string) =>
    client.patch<P2pListing>(`/p2p/listings/${id}/resume`).then(r => r.data),

  remove: (id: string) =>
    client.delete(`/p2p/listings/${id}`).then(() => undefined),
}

// ── Marketplace ───────────────────────────────────────────────────────────────

export const p2pMarketplaceApi = {
  search: (params: {
    q?: string; city?: string; radiusKm?: number; buyerGps?: string
    minPrice?: number; maxPrice?: number; listingType?: string
    minSellerScore?: number; limit?: number; offset?: number
  }) =>
    client.get<{ data: MarketplaceResult[]; total: number; limit: number; offset: number }>(
      '/p2p/marketplace/search', { params },
    ).then(r => r.data),

  searchUrgent: (params?: { buyerGps?: string; limit?: number; offset?: number }) =>
    client.get<{ data: MarketplaceResult[]; total: number; limit: number; offset: number }>(
      '/p2p/marketplace/urgent', { params },
    ).then(r => r.data),

  getIntelligence: (params?: { city?: string }) =>
    client.get<MarketIntelligence>('/p2p/marketplace/intelligence', { params }).then(r => r.data),

  getProcurementOpportunities: (params?: { buyerGps?: string; limit?: number }) =>
    client.get<ProcurementOpportunity[]>('/p2p/marketplace/procurement-opportunities', { params }).then(r => r.data),

  getListing: (id: string) =>
    client.get<MarketplaceResult>(`/p2p/marketplace/listings/${id}`).then(r => r.data),
}

// ── Orders ────────────────────────────────────────────────────────────────────

export const p2pOrdersApi = {
  create: (data: { listingId: string; requestedQty: number; notes?: string; urgencyLevel?: 'normal' | 'urgent' | 'critical' }) =>
    client.post<P2pOrder>('/p2p/orders', data).then(r => r.data),

  list: (params?: { role?: 'buyer' | 'seller' | 'both'; status?: string; q?: string; limit?: number; offset?: number }) =>
    client.get<{ data: EnrichedP2pOrder[]; total: number; limit: number; offset: number }>(
      '/p2p/orders', { params },
    ).then(r => r.data),

  getOne: (id: string) =>
    client.get<P2pOrder>(`/p2p/orders/${id}`).then(r => r.data),

  accept: (id: string, dto?: { expectedDeliveryAt?: string }) =>
    client.patch<P2pOrder>(`/p2p/orders/${id}/accept`, dto ?? {}).then(r => r.data),

  ship: (id: string, note?: string) =>
    client.patch<P2pOrder>(`/p2p/orders/${id}/ship`, { note }).then(r => r.data),

  reject: (id: string, reason: string) =>
    client.patch<P2pOrder>(`/p2p/orders/${id}/reject`, { reason }).then(r => r.data),

  complete: (id: string) =>
    client.patch<P2pOrder>(`/p2p/orders/${id}/complete`).then(r => r.data),

  cancel: (id: string) =>
    client.patch<P2pOrder>(`/p2p/orders/${id}/cancel`).then(r => r.data),

  getInvoice: (id: string) =>
    client.get<P2pTransferInvoice>(`/p2p/orders/${id}/invoice`).then(r => r.data),

  getTransferRecord: (id: string) =>
    client.get(`/p2p/orders/${id}/transfer-record`, { responseType: 'blob' }).then(r => r.data as Blob),

  openDispute: (id: string, data: { type: string; description: string; evidenceUrls?: string[] }) =>
    client.post<P2pDispute>(`/p2p/orders/${id}/dispute`, data).then(r => r.data),
}
