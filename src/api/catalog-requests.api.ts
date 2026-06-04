import client from './client';
import type { CatalogRequest } from '../types';

export interface CreateCatalogRequestPayload {
  inventoryItemId?: string;
  type?: 'add' | 'fix' | 'merge';
  name?: string;
  nameAr?: string;
  barcode?: string;
  manufacturer?: string;
  dosageForm?: string;
  strength?: string;
  imageUrl?: string;
  notes?: string;
}

export const catalogRequestsApi = {
  /** Pharmacy: submit a new catalog request. */
  create: (data: CreateCatalogRequestPayload) =>
    client.post<CatalogRequest>('/catalog/requests', data),

  /** Pharmacy: list all my catalog requests. */
  listMine: () =>
    client.get<CatalogRequest[]>('/catalog/requests'),

  /** Pharmacy: fetch one request by tracking number (REQ-XXXXXX). */
  getByTracking: (tracking: string) =>
    client.get<CatalogRequest>(`/catalog/requests/${encodeURIComponent(tracking)}`),

  // ── Admin ────────────────────────────────────────────────────────────────
  adminList: (status?: string) =>
    client.get<CatalogRequest[]>('/admin/catalog/requests', {
      params: status ? { status } : {},
    }),

  adminUpdate: (id: string, data: {
    status?: 'under_review' | 'need_info' | 'approved' | 'rejected' | 'closed';
    adminNotes?: string;
    rejectionReason?: string;
    resolvedCatalogProductId?: string;
  }) => client.patch<CatalogRequest>(`/admin/catalog/requests/${id}`, data),
};
