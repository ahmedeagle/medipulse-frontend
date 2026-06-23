import client from './client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PosShift {
  id:               string
  pharmacyTenantId: string
  cashierId:        string
  cashierName:      string | null
  status:           'open' | 'closed'
  openingBalance:   number
  closingBalance:   number | null
  totalSales:       number
  totalReturns:     number
  totalCashSales:   number
  totalCardSales:   number
  totalCashIn:      number
  totalCashOut:     number
  transactionCount: number
  returnCount:      number
  openNote:         string | null
  closeNote:        string | null
  openedAt:         string
  closedAt:         string | null
}

export interface PosTransactionItem {
  id:              string
  transactionId:   string
  inventoryItemId: string | null
  productId:       string
  productName:     string
  quantity:        number
  unitPrice:       number
  discountAmount:  number
  subtotal:        number
}

export interface PosTransaction {
  id:               string
  pharmacyTenantId: string
  shiftId:          string
  cashierId:        string
  cashierName:      string | null
  customerId:       string | null
  customerName:     string | null
  type:             'sale' | 'return'
  subtotal:         number
  discountAmount:   number
  taxAmount:        number
  totalAmount:      number
  paymentMethod:    'cash' | 'card' | 'split'
  cashAmount:       number | null
  cardAmount:       number | null
  changeAmount:     number | null
  status:           'completed' | 'voided'
  voidedByUserId:   string | null
  voidedAt:         string | null
  note:             string | null
  createdAt:        string
  items:            PosTransactionItem[]
}

export interface PosCashMovement {
  id:                 string
  pharmacyTenantId:   string
  shiftId:            string
  type:               'in' | 'out'
  amount:             number
  reason:             string
  note:               string | null
  performedByUserId:  string
  createdAt:          string
}

export interface PosCustomer {
  id:                    string
  pharmacyTenantId:      string
  name:                  string
  phone:                 string | null
  email:                 string | null
  gender:                'male' | 'female' | null
  address:               string | null
  tags:                  string[]
  totalPurchases:        number
  visitCount:            number
  lastVisitAt:           string | null
  insuranceCompanyId:    string | null
  insuranceCardNumber:   string | null
  insurancePolicyNumber: string | null
  copayPercent:          number | null
  createdAt:             string
  updatedAt:             string
}

export interface PosInsuranceCompany {
  id:               string
  pharmacyTenantId: string
  name:             string
  patientPercent:   number
  notes:            string | null
  createdAt:        string
  updatedAt:        string
}

export interface PosProduct {
  inventoryItemId: string
  productId:       string
  name:            string
  nameEn:          string
  nameAr:          string | null
  barcode:         string | null
  quantity:        number
  minThreshold:    number
  costPrice:       number | null
  sellPrice:       number | null
  expiryDate:      string | null
  linkStatus:      string
}

export interface PosSubstitute {
  inventoryItemId: string
  productId:       string
  name:            string
  nameEn:          string
  manufacturer:    string | null
  sellingPrice:    number | null
  costPrice:       number | null
  quantity:        number
  expiryDate:      string | null
  marginDelta:     number | null  // positive = this earns more per unit than what's in cart
  customerSaving:  number | null  // positive = cheaper for the customer
  reason:          'higher_margin' | 'customer_saving' | 'available'
}

export interface CreateTransactionDto {
  type:            'sale' | 'return'
  customerId?:     string
  items:           Array<{
    inventoryItemId: string
    productId:       string
    productName:     string
    quantity:        number
    unitPrice:       number
    discountAmount?: number
  }>
  discountAmount?:  number
  paymentMethod:    'cash' | 'card' | 'split'
  cashAmount?:      number
  cardAmount?:      number
  note?:            string
}

// ── API ───────────────────────────────────────────────────────────────────────

export const posApi = {
  // Shifts
  openShift: (openingBalance: number, openNote?: string): Promise<PosShift> =>
    client.post('/pos/shifts/open', { openingBalance, openNote }).then(r => r.data),

  getCurrentShift: (): Promise<PosShift | null> =>
    client.get('/pos/shifts/current').then(r => r.data),

  closeShift: (id: string, closingBalance: number, closeNote?: string): Promise<PosShift> =>
    client.post(`/pos/shifts/${id}/close`, { closingBalance, closeNote }).then(r => r.data),

  listShifts: (params: {
    status?: 'open' | 'closed';
    cashierId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ data: PosShift[]; total: number }> =>
    client.get('/pos/shifts', { params: { limit: 20, offset: 0, ...params } }).then(r => r.data),

  getShift: (id: string): Promise<PosShift> =>
    client.get(`/pos/shifts/${id}`).then(r => r.data),

  // Transactions
  createTransaction: (dto: CreateTransactionDto): Promise<PosTransaction> =>
    client.post('/pos/transactions', dto).then(r => r.data),

  listTransactions: (params: {
    shiftId?:    string
    customerId?: string
    type?:       string
    dateFrom?:   string
    dateTo?:     string
    limit?:      number
    offset?:     number
  } = {}): Promise<{ data: PosTransaction[]; total: number }> =>
    client.get('/pos/transactions', { params }).then(r => r.data),

  voidTransaction: (id: string): Promise<PosTransaction> =>
    client.post(`/pos/transactions/${id}/void`).then(r => r.data),

  // Cash
  recordCashMovement: (type: 'in' | 'out', amount: number, reason: string, note?: string): Promise<PosCashMovement> =>
    client.post('/pos/cash-movements', { type, amount, reason, note }).then(r => r.data),

  listCashMovements: (shiftId: string): Promise<PosCashMovement[]> =>
    client.get('/pos/cash-movements', { params: { shiftId } }).then(r => r.data),

  // Customers
  createCustomer: (dto: {
    name: string; phone?: string; email?: string; gender?: string; address?: string; tags?: string[]
    insuranceCompanyId?: string; insuranceCardNumber?: string; insurancePolicyNumber?: string; copayPercent?: number
  }): Promise<PosCustomer> =>
    client.post('/pos/customers', dto).then(r => r.data),

  listCustomers: (q?: string, limit = 30, offset = 0): Promise<{ data: PosCustomer[]; total: number }> =>
    client.get('/pos/customers', { params: { q, limit, offset } }).then(r => r.data),

  getCustomer: (id: string): Promise<PosCustomer> =>
    client.get(`/pos/customers/${id}`).then(r => r.data),

  updateCustomer: (id: string, dto: Partial<PosCustomer>): Promise<PosCustomer> =>
    client.patch(`/pos/customers/${id}`, dto).then(r => r.data),

  deleteCustomer: (id: string): Promise<void> =>
    client.delete(`/pos/customers/${id}`).then(r => r.data),

  getCustomerTransactions: (id: string, limit = 20, offset = 0): Promise<{ data: PosTransaction[]; total: number }> =>
    client.get(`/pos/customers/${id}/transactions`, { params: { limit, offset } }).then(r => r.data),

  // Insurance Companies
  createInsuranceCompany: (dto: { name: string; patientPercent: number; notes?: string }): Promise<PosInsuranceCompany> =>
    client.post('/pos/insurance-companies', dto).then(r => r.data),

  listInsuranceCompanies: (q?: string, limit = 50, offset = 0): Promise<{ data: PosInsuranceCompany[]; total: number }> =>
    client.get('/pos/insurance-companies', { params: { q, limit, offset } }).then(r => r.data),

  updateInsuranceCompany: (id: string, dto: Partial<{ name: string; patientPercent: number; notes: string }>): Promise<PosInsuranceCompany> =>
    client.patch(`/pos/insurance-companies/${id}`, dto).then(r => r.data),

  deleteInsuranceCompany: (id: string): Promise<void> =>
    client.delete(`/pos/insurance-companies/${id}`).then(r => r.data),

  // Product search
  searchProducts: (q: string): Promise<PosProduct[]> =>
    client.get('/pos/products/search', { params: { q } }).then(r => r.data),

  // Missed demand
  logMissedSale: (dto: {
    productId?:    string
    productName:   string
    quantity?:     number
    sellingPrice?: number
  }): Promise<void> =>
    client.post('/pos/missed-sale', dto).then(r => r.data),

  getSubstitutes: (inventoryItemId: string): Promise<PosSubstitute[]> =>
    client.get(`/pos/products/${inventoryItemId}/substitutes`).then(r => r.data),

  getMissedDemandReport: (days = 30): Promise<{
    days:               number
    totalMissedEntries: number
    totalEstimatedLoss: number
    topMissedProducts:  Array<{
      productId:     string | null
      productName:   string
      missCount:     number
      totalQty:      number
      estimatedLoss: number
    }>
    dailyTrend: Array<{ date: string; missCount: number; estimatedLoss: number }>
  }> =>
    client.get('/pos/missed-demand/report', { params: { days } }).then(r => r.data),
}
