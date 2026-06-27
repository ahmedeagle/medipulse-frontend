export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'pharmacy_admin' | 'supplier_admin' | 'system_admin';
  tenantId: string;
  tenant?: Tenant;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: 'pharmacy' | 'supplier';
  isActive?: boolean;
  createdAt?: string;
}

export interface Product {
  id: string;
  name: string;
  nameAr?: string;
  genericName?: string;
  category: string;
  unit: string;
  sku?: string;
  barcode?: string;
  dosageForm?: string;
  strength?: string;
  manufacturer?: string;
  atcCode?: string;
  sfdaRegistration?: string;
  description?: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  minThreshold: number;
  expiryDate?: string;
  batchNumber?: string;
  location?: string;
  costPrice?: number;
  sellingPrice?: number;
  /** Catalog linking metadata (Phase 1). */
  linkStatus?: 'linked' | 'unlinked' | 'suggested' | 'pending';
  matchScore?: number | null;
  matchExplanation?: { signals?: string[]; [k: string]: any } | null;
  lastLinkedAt?: string | null;
  updatedAt: string;
  createdAt: string;
}

export type CatalogRequestStatus =
  | 'submitted'
  | 'under_review'
  | 'need_info'
  | 'approved'
  | 'rejected'
  | 'closed';

export interface CatalogRequestTimelineEntry {
  at: string;
  actor: 'pharmacy' | 'admin' | 'system';
  actorId?: string;
  event: string;
  note?: string;
}

export interface CatalogRequest {
  id: string;
  trackingNumber: string;
  pharmacyTenantId: string;
  inventoryItemId: string | null;
  type: 'add' | 'fix' | 'merge';
  status: CatalogRequestStatus;
  payload: {
    name?: string;
    nameAr?: string;
    barcode?: string;
    manufacturer?: string;
    dosageForm?: string;
    strength?: string;
    imageUrl?: string;
    notes?: string;
  };
  adminDecision?: 'approved' | 'rejected' | 'merged' | 'closed' | null;
  adminNotes?: string | null;
  rejectionReason?: string | null;
  resolvedCatalogProductId?: string | null;
  timeline: CatalogRequestTimelineEntry[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export interface SupplierCatalogItem {
  id: string;
  supplierTenantId: string;
  supplierTenant?: Tenant;
  product: Product;
  price: number;
  currency: string;
  isAvailable: boolean;
  stock: number;
}

export interface OrderItem {
  id: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  pharmacyTenant?: Tenant;
  supplierTenant?: Tenant;
  /** Direct-contact channels resolved from supplier_profiles for the Orders screen CTAs. */
  supplierContact?: {
    phone: string | null;
    email: string | null;
    whatsapp: string | null;
  };
  status: 'pending' | 'accepted' | 'shipped' | 'delivered' | 'cancelled';
  notes?: string;
  totalAmount: number;
  items: OrderItem[];
  createdAt: string;
}

export interface AiRecommendation {
  id: string;
  type: 'reorder' | 'price_comparison' | 'alternative';
  product?: Product;
  payload: Record<string, any>;
  explanation: string;
  isDismissed: boolean;
  createdAt: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'pharmacy_admin' | 'supplier_admin';
  tenantName: string;
  tenantSlug: string;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  tenant?: Tenant;
  createdAt?: string;
}

export * from './pagination';
