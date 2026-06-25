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

export const analyticsApi = {
  getDashboard: (weeks = 12) =>
    client.get(`/analytics/dashboard?weeks=${weeks}`),

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
  }): Promise<Paginated<ProductSalesRow>> =>
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
  }): Promise<Paginated<CategorySalesRow>> =>
    client.get('/analytics/sales/by-category', { params }).then(r => r.data),
};
