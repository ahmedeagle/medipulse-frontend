import client from './client';

export interface ReceiptSettings {
  headerText?: string;
  footerText?: string;
  showLogo?: boolean;
  showAddress?: boolean;
  showTaxNumber?: boolean;
  showPhone?: boolean;
  language?: 'ar' | 'en';
  paperSize?: '80mm' | '58mm' | 'A4';
}

export interface LabelSettings {
  defaultSize?: 'small' | 'medium' | 'large' | 'custom';
  barcodeType?: 'CODE128' | 'CODE39' | 'EAN13';
  barcodeHeight?: number;
  showPharmacyName?: boolean;
  showProductName?: boolean;
  showPrice?: boolean;
  showBarcode?: boolean;
  showUom?: boolean;
  showExpiry?: boolean;
  showTax?: boolean;
}

export interface InventorySettings {
  disableExpiryForNewBatches?: boolean;
  reorderDays?: number;
  safetyStockPct?: number;
  expiryAlertDays?: number;
  reorderRecommendationType?: 'to_safety_stock' | 'to_max' | 'fixed_qty';
}

export interface NotificationSettings {
  enableLowStockAlerts:          boolean
  enableExpiryAlerts:            boolean
  enableDeadStockAlerts:         boolean
  enableP2POrderAlerts:          boolean
  enableSmartProcurementAlerts:  boolean
  enableClearanceAlerts:         boolean
  enablePosIntegrityAlerts:      boolean
  enableMorningBriefing:         boolean
}

export interface PharmacySettingsData {
  id: string;
  pharmacyTenantId: string;
  language: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  taxEnabled: boolean;
  pharmacyNameAr?: string;
  pharmacyNameEn?: string;
  licenseNumber?: string;
  pharmacyType: string;
  phone?: string;
  contactEmail?: string;
  country?: string;
  city?: string;
  region?: string;
  address?: string;
  gpsLocation?: string;
  logoUrl?: string;
  receiptSettings: ReceiptSettings;
  labelSettings: LabelSettings;
  inventorySettings: InventorySettings;
  notificationSettings?: NotificationSettings;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  type: 'storage' | 'expiry';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const pharmacySettingsApi = {
  getSettings: () =>
    client.get<PharmacySettingsData>('/pharmacy/settings').then(r => r.data),

  updateSettings: (data: Partial<PharmacySettingsData>) =>
    client.patch<PharmacySettingsData>('/pharmacy/settings', data).then(r => r.data),

  // Warehouses
  getWarehouses: () =>
    client.get<Warehouse[]>('/pharmacy/warehouses').then(r => r.data),

  createWarehouse: (data: { name: string; type?: string; isActive?: boolean }) =>
    client.post<Warehouse>('/pharmacy/warehouses', data).then(r => r.data),

  updateWarehouse: (id: string, data: Partial<Warehouse>) =>
    client.patch<Warehouse>(`/pharmacy/warehouses/${id}`, data).then(r => r.data),

  deleteWarehouse: (id: string) =>
    client.delete(`/pharmacy/warehouses/${id}`).then(r => r.data),
};
