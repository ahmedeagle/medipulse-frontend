import client from './client'

export interface SupplierMarketplaceCard {
  id: string;
  supplierTenantId: string;
  companyName: string;
  address?: string;
  phone?: string;
  website?: string;
  deliveryZones: string[];
  minOrderAmount?: number;
  maxDeliveryDays?: number;
  paymentTerms?: string;
  certifications: string[];
  status: string;
  verifiedAt?: string;
  reliabilityScore: number | null;
  reliabilityLabel: 'high' | 'medium' | 'low' | null;
}

export interface MarketAvailabilityResult {
  productId: string;
  productName?: string;
  availabilityRate: number;
  activeSuppliers: number;
  totalSuppliers: number;
  lowestActivePrice: number | null;
  status: 'green' | 'yellow' | 'red';
  recordedAt: string;
}

export interface FinancialHealthSnapshot {
  totalInventoryValue:  number;
  deadStockValue:       number;
  deadStockSkus:        number;
  deadStockPct:         number;
  nearExpiryValue:      number;
  nearExpirySkus:       number;
  pendingPayables:      number;
  creditLimit:          number;
  utilizedCredit:       number;
  utilizationRate:      number;
  cashRisk:             boolean;
  alerts:               string[];
}

export const supplierApi = {
  getMarketplace: (params?: { limit?: number; offset?: number }) =>
    client.get<{ data: SupplierMarketplaceCard[]; total: number; limit: number; offset: number }>(
      '/supplier/profile/marketplace', { params }
    ),

  getCatalog: (params?: { limit?: number; offset?: number; search?: string; supplierId?: string }) =>
    client.get('/supplier/catalog', { params }),

  createCatalogItem: (data: { productId: string; price: number; stock: number; currency?: string }) =>
    client.post('/supplier/catalog', data),

  updateCatalogItem: (id: string, data: { price?: number; stock?: number; isAvailable?: boolean }) =>
    client.patch(`/supplier/catalog/${id}`, data),

  deleteCatalogItem: (id: string) =>
    client.delete(`/supplier/catalog/${id}`),

  getMarketAvailability: (productId: string) =>
    client.get<{ latest: MarketAvailabilityResult; trend: Array<{ date: string; rate: number }> }>(
      '/supplier/market-availability', { params: { productId } }
    ),

  getAtRiskProducts: () =>
    client.get<MarketAvailabilityResult[]>('/supplier/market-availability/at-risk'),

  getFinancialHealthSnapshot: () =>
    client.get<FinancialHealthSnapshot>('/v1/finance/health-snapshot'),
}
