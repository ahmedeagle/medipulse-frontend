import client from './client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type InvoiceStatus  = 'draft' | 'received' | 'paid' | 'cancelled';
export type ReturnStatus   = 'draft' | 'confirmed' | 'cancelled';
export type PaymentMethod  = 'cash' | 'credit_card' | 'bank_transfer' | 'credit_term';
export type WishListSource = 'auto' | 'manual';

export interface InvoiceLine {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  purchaseQty: number;
  freeGoodsQty: number;
  purchasePrice: number;
  salePrice: number;
  discountPct: number;
  taxPct: number;
  taxAmount: number;
  lineTotal: number;
  sortOrder: number;
}

export interface PurchaseInvoice {
  id: string;
  poNumber: string;
  supplierTenantId: string | null;
  supplierName: string;
  supplierInvoiceNumber: string | null;
  invoiceDate: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: 'pending' | 'paid';
  status: InvoiceStatus;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  notes: string | null;
  lines: InvoiceLine[];
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  source: 'manual' | 'ai';
  linesCount?: number;
}

export interface InvoiceChangelogEntry {
  id: string;
  invoiceId: string;
  userId: string | null;
  action: 'created' | 'updated' | 'confirmed' | 'cancelled' | 'paid';
  changes: { field: string; fieldLabel: string; productName?: string; oldValue: string | null; newValue: string | null }[];
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

export interface ReturnLine {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  availableQty: number;
  returnQty: number;
  freeGoodsQty: number;
  returnPrice: number;
  discountPct: number;
  taxPct: number;
  taxAmount: number;
  lineTotal: number;
}

export interface PurchaseReturn {
  id: string;
  rpoNumber: string;
  supplierTenantId: string | null;
  supplierName: string;
  supplierInvoiceDate: string | null;
  supplierInvoiceNumber: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: 'pending' | 'paid';
  status: ReturnStatus;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  notes: string | null;
  lines: ReturnLine[];
  createdAt: string;
  confirmedAt: string | null;
}

export interface WishListItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  currentStock: number;
  requestedQty: number;
  recommendedQty: number | null;
  lastSupplierId: string | null;
  lastSupplierName: string | null;
  source: WishListSource;
  draftPoId: string | null;
  draftPoNumber: string | null;
  createdAt: string;
}

export interface PurchaseStats {
  thisMonthCount: string;
  thisMonthValue: string;
  totalInvoices: string;
  totalSpent: string;
  totalPending: string;
  draftCount: string;
  pendingPaymentCount: number;
  wishListCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ProductSearchResult {
  id: string;
  inventoryItemId?: string;
  name: string;
  nameEn?: string;
  nameAr?: string;
  sku?: string | null;
  barcode?: string | null;
  currentStock: number;
  expiryDate?: string | null;
  lastCostPrice: number;
  lastSupplierName: string | null;
  /** True = product exists in this pharmacy's inventory. False = catalog-only, never purchased here. */
  inInventory?: boolean;
}

export interface SupplierResult {
  id: string;
  supplierTenantId: string | null;
  name: string;
  lastOrderDate: string;
}

export type PriceAnomalyResult = {
  hasAnomaly: boolean;
  deviationPct: number;
  historicalAvg: number;
  direction: 'higher' | 'lower';
} | null;

export interface OcrMatchedProduct {
  id: string;
  name: string;
  nameAr?: string;
  sku?: string;
  matchScore: number; // 0–100
}

export interface OcrLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  confidence: number; // 0–1 from Azure
  matchedProduct: OcrMatchedProduct | null;
}

export interface OcrResult {
  vendorName: string | null;
  vendorNameConfidence: number;
  invoiceId: string | null;
  invoiceIdConfidence: number;
  invoiceDate: string | null;
  invoiceDateConfidence: number;
  totalAmount: number | null;
  totalAmountConfidence: number;
  lineItems: OcrLineItem[];
  error?: string;
}

// ─── API ───────────────────────────────────────────────────────────────────────

export const purchasesApi = {
  // Stats
  getStats: () =>
    client.get<PurchaseStats>('/pharmacy/purchases/stats').then(r => r.data),

  // Product search
  searchProducts: (q: string, supplierId?: string) =>
    client.get<ProductSearchResult[]>('/pharmacy/purchases/products/search', { params: { q, supplierId } }).then(r => r.data),

  searchProductsForReturn: (q: string, supplierId?: string) =>
    client.get<ProductSearchResult[]>('/pharmacy/purchases/products/for-return', { params: { q, supplierId } }).then(r => r.data),

  getSuppliers: () =>
    client.get<SupplierResult[]>('/pharmacy/purchases/suppliers').then(r => r.data),

  checkPriceAnomaly: (productId: string, price: number, supplierId?: string) =>
    client.get('/pharmacy/purchases/price-check', { params: { productId, price, supplierId } }).then(r => r.data as PriceAnomalyResult),

  // OCR (PUR-011)
  analyzeInvoiceOcr: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return client.post<OcrResult>('/pharmacy/purchases/invoices/ocr', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  // Invoices
  createInvoice: (dto: any) =>
    client.post<PurchaseInvoice>('/pharmacy/purchases/invoices', dto).then(r => r.data),

  getInvoices: (params?: Record<string, any>) =>
    client.get<PaginatedResult<PurchaseInvoice>>('/pharmacy/purchases/invoices', { params }).then(r => r.data),

  getInvoice: (id: string) =>
    client.get<PurchaseInvoice>(`/pharmacy/purchases/invoices/${id}`).then(r => r.data),

  updateInvoice: (id: string, dto: any) =>
    client.patch<PurchaseInvoice>(`/pharmacy/purchases/invoices/${id}`, dto).then(r => r.data),

  confirmInvoice: (id: string) =>
    client.post<PurchaseInvoice>(`/pharmacy/purchases/invoices/${id}/confirm`).then(r => r.data),

  markPaid: (id: string) =>
    client.post<PurchaseInvoice>(`/pharmacy/purchases/invoices/${id}/pay`).then(r => r.data),

  cancelInvoice: (id: string) =>
    client.post<PurchaseInvoice>(`/pharmacy/purchases/invoices/${id}/cancel`).then(r => r.data),

  deleteInvoice: (id: string) =>
    client.delete(`/pharmacy/purchases/invoices/${id}`).then(r => r.data),

  // Export
  exportInvoices: (params?: Record<string, any>) =>
    client.get('/pharmacy/purchases/invoices/export', {
      params,
      responseType: 'blob',
    }).then(r => r.data as Blob),

  exportSingleInvoice: (id: string) =>
    client.get(`/pharmacy/purchases/invoices/${id}/export`, {
      responseType: 'blob',
    }).then(r => r.data as Blob),

  getInvoiceChangelog: (id: string) =>
    client.get<InvoiceChangelogEntry[]>(`/pharmacy/purchases/invoices/${id}/changelog`).then(r => r.data),

  // Returns
  createReturn: (dto: any) =>
    client.post<PurchaseReturn>('/pharmacy/purchases/returns', dto).then(r => r.data),

  getReturns: (params?: Record<string, any>) =>
    client.get<PaginatedResult<PurchaseReturn>>('/pharmacy/purchases/returns', { params }).then(r => r.data),

  getReturn: (id: string) =>
    client.get<PurchaseReturn>(`/pharmacy/purchases/returns/${id}`).then(r => r.data),

  confirmReturn: (id: string) =>
    client.post<PurchaseReturn>(`/pharmacy/purchases/returns/${id}/confirm`).then(r => r.data),

  cancelReturn: (id: string) =>
    client.post<PurchaseReturn>(`/pharmacy/purchases/returns/${id}/cancel`).then(r => r.data),

  // Wish list
  getWishList: () =>
    client.get<WishListItem[]>('/pharmacy/purchases/wishlist').then(r => r.data),

  addWishListItem: (dto: any) =>
    client.post<WishListItem>('/pharmacy/purchases/wishlist', dto).then(r => r.data),

  updateWishListItem: (id: string, dto: any) =>
    client.patch<WishListItem>(`/pharmacy/purchases/wishlist/${id}`, dto).then(r => r.data),

  removeWishListItem: (id: string) =>
    client.delete(`/pharmacy/purchases/wishlist/${id}`).then(r => r.data),

  createOrdersFromWishList: (itemIds: string[]) =>
    client.post<PurchaseInvoice[]>('/pharmacy/purchases/wishlist/create-orders', { itemIds }).then(r => r.data),
};
