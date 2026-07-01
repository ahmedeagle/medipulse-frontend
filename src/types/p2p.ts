export type SellerVerificationStatus = 'pending' | 'verified' | 'rejected'
export type TrustLevel = 'bronze' | 'silver' | 'gold' | 'platinum'
export type ListingStatus = 'active' | 'paused' | 'sold_out' | 'expired'
export type ListingType = 'normal' | 'clearance' | 'emergency'
export type P2pOrderStatus = 'pending' | 'accepted' | 'shipped' | 'rejected' | 'completed' | 'cancelled'
export type P2pUrgencyLevel = 'normal' | 'urgent' | 'critical'
export type IssueCode =
  | 'UNLINKED_PRODUCT'
  | 'EXPIRED'
  | 'ZERO_STOCK'
  | 'BELOW_MIN_QTY'
  | 'NEAR_EXPIRY_30'
  | 'NEAR_EXPIRY_60'
  | 'NEAR_EXPIRY_90'
  | 'PRICE_ANOMALY'
  | 'DUPLICATE_LISTING'

export interface ListingIssue {
  code: IssueCode
  severity: 'blocking' | 'warning'
  message: string
  field?: string
}

export interface RulesResult {
  blocking: ListingIssue[]
  warnings: ListingIssue[]
  canPublish: boolean
}

export interface DeliveryZone {
  radiusKm: 3 | 5 | 10
  price: number
  isFree: boolean
}

export interface SellerAutomations {
  autoListNearExpiry?: boolean
  autoUpdateDiscounts?: boolean
  autoDownloadInvoice?: boolean
  autoProcurement?: boolean
}

export interface SellerNotificationPrefs {
  newOrders?: boolean
  orderActivity?: boolean
  autoListings?: boolean
  priceAlerts?: boolean
  expiryWarnings?: boolean
  aiRecommendations?: boolean
}

export interface SellerProfile {
  id: string
  pharmacyTenantId: string
  legalName: string
  country?: string
  gpsLocation?: string
  /** Structured coordinates — power nearest-first demand broadcast targeting */
  latitude?: number | null
  longitude?: number | null
  city?: string
  region?: string
  address?: string
  /** Phone (E.164) — shown to counterparty for delivery coordination */
  phone?: string
  /** Business email — used for P2P invoice + dispute trail */
  email?: string
  /** WhatsApp number (E.164) — fast-channel for buyers/sellers post-acceptance */
  whatsapp?: string
  pharmacyLicenseUrl?: string
  commercialRegUrl?: string
  taxDocUrl?: string
  pharmacistLicenseUrl?: string
  licenseHolderIdUrl?: string
  municipalPermitUrl?: string
  vatCertUrl?: string
  deliveryZones: DeliveryZone[]
  automations?: SellerAutomations
  notificationPrefs?: SellerNotificationPrefs
  isVisible: boolean
  verificationStatus: SellerVerificationStatus
  rejectionReason?: string
  lastLegalAckAt?: string
  updatedAt: string
  createdAt: string
}

export interface SellerReliabilityScore {
  pharmacyTenantId: string
  acceptanceRate: number
  avgResponseMinutes: number
  fulfillmentRate: number
  sampleSize: number
  overallScore: number
  label: string
  trustLevel: TrustLevel
  lastCalculatedAt: string
}

export interface P2pListing {
  id: string
  sellerTenantId: string
  inventoryItemId: string
  productId: string
  price: number
  quantity: number
  minOrderQty: number
  expiryDate?: string
  status: ListingStatus
  listingType: ListingType
  offerType: 'none' | 'discount' | 'bonus'
  discountPct?: number
  bonusQty?: number
  autoUpdateDiscount: boolean
  updatedAt: string
  createdAt: string
  // Enriched by backend (findOwn + marketplace search)
  productName?: string | null
  productNameAr?: string | null
  productCode?: string | null
  productBarcode?: string | null
  productStrength?: string | null
  productDosageForm?: string | null
  productManufacturer?: string | null
  costPrice?: number | null
}

export interface SellerStats {
  completedOrdersCount: number
  pendingOrdersCount: number
  totalQtySold: number
  totalRevenue: number
}

export interface MarketplaceResult {
  listing: P2pListing
  seller: Partial<SellerProfile>
  reliability: Partial<SellerReliabilityScore>
  rankScore: number
  distanceKm?: number
}

export interface P2pOrder {
  id: string
  buyerTenantId: string
  sellerTenantId: string
  listingId: string
  requestedQty: number
  agreedPrice: number
  status: P2pOrderStatus
  urgencyLevel: P2pUrgencyLevel
  reservationExpiresAt?: string | null
  expectedDeliveryAt?: string | null
  shippedAt?: string | null
  deliveryNote?: string | null
  notes?: string | null
  rejectionReason?: string | null
  respondedAt?: string | null
  completedAt?: string | null
  updatedAt: string
  createdAt: string
}

export interface EnrichedP2pOrder extends P2pOrder {
  productName?: string | null
  productNameAr?: string | null
  productBarcode?: string | null
  productSku?: string | null
  productStrength?: string | null
  productDosageForm?: string | null
  listingType?: 'normal' | 'clearance' | 'emergency' | null
  offerType?: 'none' | 'discount' | 'bonus' | null
  listingExpiryDate?: string | null
  discountPct?: number | null
  bonusQty?: number | null
  sellerName?: string | null
  sellerCity?: string | null
  sellerPhone?: string | null
  sellerEmail?: string | null
  sellerWhatsapp?: string | null
  buyerName?: string | null
  buyerCity?: string | null
  buyerPhone?: string | null
  buyerEmail?: string | null
  buyerWhatsapp?: string | null
  hasInvoice: boolean
  hasDispute: boolean
}

export interface P2pTransferInvoice {
  id: string
  p2pOrderId: string
  invoiceNumber: string
  buyerTenantId: string
  sellerTenantId: string
  items: Array<{
    productId: string
    productName: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
  subtotal: number
  totalAmount: number
  issuedAt: string
}

export interface ExpiryAlert {
  inventoryItemId: string
  productId: string
  productName?: string
  productNameAr?: string
  productCode?: string
  quantity: number
  expiryDate: string
  daysLeft: number
  urgency: 'critical' | 'high' | 'medium' | 'low'
  suggestedAction: 'list_clearance' | 'increase_discount' | 'list_normal'
  suggestedDiscountPct: number
  alreadyListed: boolean
  existingListingId?: string
}

export interface ProcurementOpportunity {
  inventoryItemId: string
  productId: string
  productName: string | null
  productNameAr: string | null
  barcode: string | null
  sku: string | null
  currentQty: number
  minThreshold: number
  p2pListingId: string | null
  p2pPrice: number | null
  bestSupplierPrice: number | null
  savingsPct: number | null
  sellerTenantId: string | null
  sellerName: string | null
  sellerCity: string | null
  distanceKm: number | null
  listingType: string | null
  availableQty: number | null
  sourceType: 'p2p' | 'supplier'
}

export interface MarketIntelligence {
  activeSellersCount: number
  activeListingsCount: number
  avgPricesByProduct: Array<{
    productId: string
    avgPrice: number
    minPrice: number
    maxPrice: number
    listingsCount: number
  }>
  topTradedProducts: Array<{
    productId: string
    productName: string | null
    productNameAr: string | null
    orderCount: number
    totalVolume: number
  }>
  cityDensity: Array<{ city: string; sellerCount: number }>
  resolvedCity: string | null
  topProductsInCity: Array<{
    productId: string
    productName: string | null
    productNameAr: string | null
    unitsSold: number
    pharmacyCount: number
  }>
  generatedAt: string
}

export interface P2pDispute {
  id: string
  p2pOrderId: string
  type: 'wrong_qty' | 'wrong_product' | 'damaged' | 'expired'
  description: string
  status: 'open' | 'resolved' | 'rejected'
  createdAt: string
}
