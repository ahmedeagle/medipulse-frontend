import client from './client';

export interface SalesSummaryRow {
  period:               string
  salesBeforeDiscount:  number
  totalSales:           number
  totalReturns:         number
  netSales:             number
  invoiceCount:         number
  avgInvoice:           number
  totalDiscounts:       number
  totalTax:             number
  cogs:                 number
  grossMargin:          number
  grossMarginPct:       number
  // Monthly extras
  monthStart?:   string
  monthEnd?:     string
  year?:         number
  monthNumber?:  number
  // Weekly extras
  weekStart?:    string
  weekEnd?:      string
  weekNumber?:   number
}

export interface ProductSalesRow {
  productCode:         string
  productName:         string
  category:            string
  saleDate:            string
  qtySold:             number
  avgQtyPerInvoice:    number
  invoiceCount:        number
  totalDiscounts:      number
  totalSales:          number
  salesBeforeDiscount: number
  totalReturns:        number
  netSales:            number
  totalTax:            number
  cogs:                number
  grossMargin:         number
  grossMarginPct:      number
  qtyReturned:         number
  avgInvoiceValue:     number
}

export interface CategorySalesRow {
  category:            string
  saleDate:            string
  qtySold:             number
  qtyReturned:         number
  invoiceCount:        number
  totalDiscounts:      number
  totalSales:          number
  salesBeforeDiscount: number
  totalReturns:        number
  netSales:            number
  cogs:                number
  grossMargin:         number
  grossMarginPct:      number
}

export interface InventoryReportRow {
  productCode:      string
  productName:      string
  barcode:          string
  category:         string
  stockQty:         number
  costValue:        number
  sellValue:        number
  availableForSale: number
  nearExpiryQty:    number
  expiredQty:       number
  avgCostPrice:     number
  avgSellPrice:     number
  status:           'active' | 'near_expiry' | 'expired' | 'low_stock'
  avgDiscount:      number
  minDiscount:      number
  maxDiscount:      number
  avgFreeUnits:     number
  minFreeUnits:     number
  maxFreeUnits:     number
  avgProfitPerUnit: number
}

export interface ExpiryReportRow {
  inventoryItemId: string
  productCode:     string
  productName:     string
  barcode:         string
  batchNumber:     string
  expiryDate:      string
  daysUntilExpiry: number
  quantity:        number
  costPrice:       number
  sellingPrice:    number
  costValue:       number
  category:        string
}

export interface InsuranceClaimsRow {
  invoiceDate:            string
  insuranceCompany:       string
  insuranceCompanyId:     string
  patientCount:           number
  invoiceCount:           number
  totalSales:             number
  insuranceCoveredAmount: number
  patientDueAmount:       number
  reimbursementAmount:    number
  pendingAmount:          number
}

export interface Paginated<T> {
  data: T[]
  total: number
}

export interface SalesReportTotals {
  qtySold:             number
  qtyReturned:         number
  invoiceCount:        number
  totalSales:          number
  salesBeforeDiscount: number
  totalReturns:        number
  totalDiscounts:      number
  netSales:            number
  cogs:                number
  grossMargin:         number
  grossMarginPct:      number
}

export interface PaginatedWithTotals<T> extends Paginated<T> {
  totals: SalesReportTotals
}

export interface DashboardOverview {
  period: 'month' | 'week' | 'year'
  aiImpact: {
    savingsThisPeriodEgp:      number
    actionsExecutedThisPeriod: number
    pendingApprovals:          number
  }
  aiDrafts: {
    count:               number
    totalValueEgp:       number
    potentialSavingsEgp: number
    soonestExpiresAt:    string | null
  }
  sales: {
    totalSales:    number
    netProfit:     number
    invoiceCount:  number
    customerCount: number
    deltaPct:      number | null
  }
  counts: {
    products:      number
    lowStock:      number
    pendingOrders: number
  }
  forecastRisk: {
    atRiskCount: number
    items: Array<{
      productId:              string
      productName:            string | null
      daysUntilReorderNeeded: number | null
      predictedStockoutDate:  string | null
    }>
  }
  topProducts: Array<{
    productId:   string
    productName: string | null
    qtySold:     number
    revenue:     number
  }>
}

export const analyticsApi = {
  getDashboard: (weeks = 12) =>
    client.get(`/analytics/dashboard?weeks=${weeks}`),

  getDashboardOverview: (period: 'month' | 'week' | 'year' = 'month'): Promise<DashboardOverview> =>
    client.get('/analytics/dashboard-overview', { params: { period } }).then(r => r.data),

  getRegionalPricing: (productId: string) =>
    client.get(`/analytics/pricing/regional?productId=${productId}`),

  getPriceTrend: (productId: string, supplierTenantId: string, days = 90) =>
    client.get(`/analytics/pricing/trend?productId=${productId}&supplierTenantId=${supplierTenantId}&days=${days}`),

  getSalesSummary: (params: {
    granularity: 'daily' | 'weekly' | 'monthly'
    dateFrom: string
    dateTo: string
    cashierName?: string
    hideZeroRows?: boolean
    page?: number
    pageSize?: number
  }): Promise<Paginated<SalesSummaryRow>> =>
    client.get('/analytics/sales/summary', { params }).then(r => r.data),

  getSalesByProduct: (params: {
    dateFrom: string
    dateTo: string
    search?: string
    category?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedWithTotals<ProductSalesRow>> =>
    client.get('/analytics/sales/by-product', { params }).then(r => r.data),

  getInventoryReport: (params?: {
    search?: string
    category?: string
    status?: string
    page?: number
    pageSize?: number
  }): Promise<Paginated<InventoryReportRow>> =>
    client.get('/analytics/inventory/current', { params }).then(r => r.data),

  getExpiryReport: (params?: {
    search?: string
    category?: string
    status?: string
    daysAhead?: number
    dateFrom?: string
    dateTo?: string
    page?: number
    pageSize?: number
  }): Promise<Paginated<ExpiryReportRow>> =>
    client.get('/analytics/expiry/report', { params }).then(r => r.data),

  getInsuranceClaimsReport: (params?: {
    dateFrom?: string
    dateTo?: string
    insuranceCompanyId?: string
    page?: number
    pageSize?: number
  }): Promise<Paginated<InsuranceClaimsRow>> =>
    client.get('/analytics/insurance/claims', { params }).then(r => r.data),

  getSalesByCategory: (params: {
    dateFrom: string
    dateTo: string
    category?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedWithTotals<CategorySalesRow>> =>
    client.get('/analytics/sales/by-category', { params }).then(r => r.data),

  getPriceHistory: (productId: string, days = 90, range?: { from?: string; to?: string }) =>
    client.get<PriceIntelligenceResult>('/analytics/price-history', {
      params: { productId, days, from: range?.from, to: range?.to },
    }),

  // ── Procurement / Supplier / P2P reports ─────────────────────────────────
  getProcurementSummary: (params: {
    dateFrom: string; dateTo: string;
    channel?: 'all'|'invoices'|'orders'|'p2p';
    supplierId?: string;
  }): Promise<ProcurementSummary> =>
    client.get('/analytics/procurement/summary', { params }).then(r => r.data),

  getSupplierPerformance: (params: {
    dateFrom: string; dateTo: string;
    search?: string; page?: number; pageSize?: number;
  }): Promise<Paginated<SupplierPerformanceRow> & { page: number; pageSize: number }> =>
    client.get('/analytics/suppliers/performance', { params }).then(r => r.data),

  getP2pActivity: (params: { dateFrom: string; dateTo: string }): Promise<P2pActivityReport> =>
    client.get('/analytics/p2p/activity', { params }).then(r => r.data),
};

export interface ProcurementSummary {
  totals: {
    totalSpend: number;
    totalCount: number;
    avgOrderValue: number;
    byChannel: {
      invoices: { total: number; count: number };
      orders:   { total: number; count: number };
      p2p:      { total: number; count: number };
    };
    p2pSavings: number;
  };
  trend: Array<{ month: string; channel: 'invoices'|'orders'|'p2p'; total: number }>;
  topSuppliers: Array<{ supplierId: string; supplierName: string; totalSpend: number; orderCount: number }>;
}

export interface SupplierPerformanceRow {
  supplierId: string;
  supplierName: string;
  poCount: number;
  poSpend: number;
  invoiceCount: number;
  invoiceSpend: number;
  totalSpend: number;
  deliveredCount: number;
  rejectedCount: number;
  disputedCount: number;
  fillRatePct: number | null;
  rejectionRatePct: number | null;
  avgLeadDays: number | null;
  paidRatePct: number | null;
  lastOrderAt: string | null;
}

export interface P2pActivityReport {
  buyer: {
    totalOrders: number; completedOrders: number; cancelledOrders: number;
    rejectedOrders: number; uniquePeers: number;
    totalSpend: number; settledSpend: number;
  };
  seller: {
    totalOrders: number; completedOrders: number; uniquePeers: number;
    totalRevenue: number; settledRevenue: number;
  };
  netPosition: number;
  trend: Array<{ day: string; buyOrders: number; sellOrders: number; buyValue: number; sellValue: number }>;
  topPeers: Array<{ peerId: string; peerName: string; tradeCount: number; tradeValue: number; asBuyer: number; asSeller: number }>;
  listings: { total: number; active: number; sold: number };
}

export interface PriceIntelligenceSeries {
  supplierId: string;
  supplierName: string;
  isMarketplace?: boolean;
  points: Array<{ date: string; price: number }>;
}

export interface PriceIntelligenceResult {
  productId: string;
  days: number;
  series: PriceIntelligenceSeries[];
  supplierBreakdown: Array<{
    supplierId: string;
    supplierName: string;
    isMarketplace?: boolean;
    latestPrice: number;
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
  }>;
  /** Historical minimum across the window (may include expired promos). */
  bestPrice: number | null;
  /** Lowest price *currently* available (suppliers + marketplace). */
  bestPriceNow: number | null;
  /** Lowest active P2P marketplace listing for this product, if any. */
  marketplaceBestPrice: number | null;
  avgPrice: number | null;
  lastPricePaid: number | null;
  overpaymentWarning: boolean;
  overpaymentPct: number;
  /** Resolved tenant threshold (default 15). */
  overpaymentThresholdPct: number;
}
