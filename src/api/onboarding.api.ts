import client from './client';

export interface OnboardingChecklist {
  inventoryItemsCount: number;
  inventoryUnlinkedCount: number;
  consumptionSnapshotsCount: number;
  consumptionWeeksCovered: number;
  catalogRequestsOpenCount: number;
  suppliersAvailableCount: number;
  daysActive: number;
  aiReady: boolean;
  nextSteps: Array<{
    key: string;
    titleAr: string;
    titleEn: string;
    severity: 'todo' | 'recommended' | 'done';
  }>;
}

export interface SeedConsumptionItem {
  productId: string;
  /** Index 0 = most recent completed week; arrays up to 52 entries. */
  weeklyQty: number[];
}

export interface SeedConsumptionResponse {
  inserted: number;
  skipped: number;
  productsSeeded: number;
}

export interface BulkInviteSupplierItem {
  name: string;
  slug: string;
  contactEmail?: string;
  city?: string;
  region?: string;
}

export interface BulkInviteSuppliersResponse {
  created: Array<{ slug: string; tenantId: string }>;
  failed:  Array<{ slug: string; reason: string }>;
}

export const onboardingApi = {
  getChecklist: () =>
    client.get<OnboardingChecklist>('/pharmacy/onboarding/checklist').then((r) => r.data),

  seedConsumption: (items: SeedConsumptionItem[], preserveExisting = true) =>
    client
      .post<SeedConsumptionResponse>('/pharmacy/onboarding/seed-consumption', {
        items,
        preserveExisting,
      })
      .then((r) => r.data),

  /** Admin-only. Throws if the user is not SYSTEM_ADMIN. */
  bulkInviteSuppliers: (suppliers: BulkInviteSupplierItem[]) =>
    client
      .post<BulkInviteSuppliersResponse>('/admin/onboarding/suppliers/bulk-invite', {
        suppliers,
      })
      .then((r) => r.data),
};
