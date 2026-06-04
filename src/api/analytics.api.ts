import client from './client';

export const analyticsApi = {
  getDashboard: (weeks = 12) =>
    client.get(`/analytics/dashboard?weeks=${weeks}`),

  getRegionalPricing: (productId: string) =>
    client.get(`/analytics/pricing/regional?productId=${productId}`),

  getPriceTrend: (productId: string, supplierTenantId: string, days = 90) =>
    client.get(`/analytics/pricing/trend?productId=${productId}&supplierTenantId=${supplierTenantId}&days=${days}`),
};
