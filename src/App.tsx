import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from 'react-oidc-context';
import { AppLayout } from './components/layout/AppLayout';
import { getRoleFromToken, getDashboardPath } from './auth/oidc';
import OfflineBanner from './components/OfflineBanner';
import { RouteTitle } from './components/RouteTitle';

// Auth pages — NOT lazy (needed before auth state resolves)
import OidcCallbackPage from './pages/auth/OidcCallbackPage';
import LoginPage        from './pages/auth/LoginPage';

// ── Pharmacy (lazy — only loaded when pharmacy_admin navigates there) ─────────
const PharmacyDashboardPage  = lazy(() => import('./pages/pharmacy/DashboardPage'));
const AiCenterPage           = lazy(() => import('./pages/pharmacy/AiCenterPage'));
const InventoryPage          = lazy(() => import('./pages/pharmacy/InventoryPage'));
const CatalogPage            = lazy(() => import('./pages/pharmacy/CatalogPage'));
const CatalogRequestsPage    = lazy(() => import('./pages/pharmacy/CatalogRequestsPage'));
const PharmacyOrdersPage     = lazy(() => import('./pages/pharmacy/OrdersPage'));
const ConnectionsPage        = lazy(() => import('./pages/pharmacy/ConnectionsPage'));
const P2PPage                = lazy(() => import('./pages/pharmacy/P2PPage'));
const SettingsPage           = lazy(() => import('./pages/pharmacy/SettingsPage'));
const PosPage                = lazy(() => import('./pages/pharmacy/pos/PosPage'));
const ShiftLogPage           = lazy(() => import('./pages/pharmacy/pos/ShiftLogPage'));
const SalesLogPage           = lazy(() => import('./pages/pharmacy/pos/SalesLogPage'));
const CustomersPage               = lazy(() => import('./pages/pharmacy/CustomersPage'));
const ProductsPage                = lazy(() => import('./pages/pharmacy/ProductsPage'));
const PurchaseInvoiceListPage     = lazy(() => import('./pages/pharmacy/purchases/PurchaseInvoiceListPage'));
const PurchaseInvoiceCreatePage   = lazy(() => import('./pages/pharmacy/purchases/PurchaseInvoiceCreatePage'));
const PurchaseInvoiceDetailPage   = lazy(() => import('./pages/pharmacy/purchases/PurchaseInvoiceDetailPage'));
const PurchaseReturnListPage      = lazy(() => import('./pages/pharmacy/purchases/PurchaseReturnListPage'));
const PurchaseReturnCreatePage    = lazy(() => import('./pages/pharmacy/purchases/PurchaseReturnCreatePage'));
const PurchaseWishListPage        = lazy(() => import('./pages/pharmacy/purchases/PurchaseWishListPage'));
const ReportsHubPage              = lazy(() => import('./pages/pharmacy/reports/ReportsHubPage'));
const SalesSummaryPage            = lazy(() => import('./pages/pharmacy/reports/domains/SalesSummaryPage'));
const SalesByProductPage          = lazy(() => import('./pages/pharmacy/reports/domains/SalesByProductPage'));
const CurrentInventoryPage        = lazy(() => import('./pages/pharmacy/reports/domains/CurrentInventoryPage'));
const ExpiryReportPage            = lazy(() => import('./pages/pharmacy/reports/domains/ExpiryReportPage'));
const InsuranceClaimsPage         = lazy(() => import('./pages/pharmacy/reports/domains/InsuranceClaimsPage'));
const ProfitLossPage                   = lazy(() => import('./pages/pharmacy/reports/domains/ProfitLossPage'));
const ProfitabilityByProductPage       = lazy(() => import('./pages/pharmacy/reports/domains/ProfitabilityByProductPage'));
const ProfitabilityByCategoryPage      = lazy(() => import('./pages/pharmacy/reports/domains/ProfitabilityByCategoryPage'));

// ── Supplier ──────────────────────────────────────────────────────────────────
const SupplierDashboardPage  = lazy(() => import('./pages/supplier/DashboardPage'));
const SupplierCatalogPage    = lazy(() => import('./pages/supplier/CatalogPage'));
const SupplierOrdersPage     = lazy(() => import('./pages/supplier/OrdersPage'));
const SupplierProfilePage    = lazy(() => import('./pages/supplier/SupplierProfilePage'));
const BulkImportPage         = lazy(() => import('./pages/supplier/BulkImportPage'));
const DemandSignalsPage      = lazy(() => import('./pages/supplier/DemandSignalsPage'));

// ── Admin ─────────────────────────────────────────────────────────────────────
const AdminDashboardPage  = lazy(() => import('./pages/admin/DashboardPage'));
const TenantsPage         = lazy(() => import('./pages/admin/TenantsPage'));
const UsersPage           = lazy(() => import('./pages/admin/UsersPage'));
const OrganizationsPage   = lazy(() => import('./pages/admin/OrganizationsPage'));
const IntegrationsPage    = lazy(() => import('./pages/admin/IntegrationsPage'));
const AuditLogPage        = lazy(() => import('./pages/admin/AuditLogPage'));
const RecallsPage         = lazy(() => import('./pages/admin/RecallsPage'));
const OrderDetailPage     = lazy(() => import('./pages/shared/OrderDetailPage'));

// ── Chain Admin ───────────────────────────────────────────────────────────────
const ChainDashboardPage = lazy(() => import('./pages/chain/ChainDashboardPage'));

// ─── Route guards ─────────────────────────────────────────────────────────────

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
    </div>
  );
}

function RoleRedirect() {
  const auth = useAuth();
  if (auth.isLoading) return <FullScreenSpinner />;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={getDashboardPath(getRoleFromToken(auth.user))} replace />;
}

interface ProtectedRouteProps { requiredRole: string; children: React.ReactNode }

function ProtectedRoute({ requiredRole, children }: ProtectedRouteProps) {
  const auth = useAuth();
  if (auth.isLoading) return <FullScreenSpinner />;
  if (!auth.isAuthenticated) { auth.signinRedirect(); return <FullScreenSpinner />; }
  const role = getRoleFromToken(auth.user);
  if (role !== requiredRole) return <Navigate to={getDashboardPath(role)} replace />;
  return <>{children}</>;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <RouteTitle />
      <OfflineBanner />
      <Suspense fallback={<FullScreenSpinner />}>
        <Routes>
          {/* Public */}
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/auth/callback" element={<OidcCallbackPage />} />

          {/* ── Pharmacy ─────────────────────────────────────────────────────── */}
          <Route
            path="/pharmacy/*"
            element={<ProtectedRoute requiredRole="pharmacy_admin"><AppLayout /></ProtectedRoute>}
          >
            <Route index                    element={<PharmacyDashboardPage />} />
            <Route path="ai-center"         element={<AiCenterPage />} />
            <Route path="ai"               element={<Navigate to="/pharmacy/ai-center" replace />} />
            <Route path="inventory"        element={<InventoryPage />} />
            <Route path="products"         element={<ProductsPage />} />
            <Route path="catalog"          element={<CatalogPage />} />
            <Route path="catalog-requests" element={<CatalogRequestsPage />} />
            <Route path="orders"           element={<PharmacyOrdersPage />} />
            <Route path="orders/:id"       element={<OrderDetailPage />} />
            <Route path="connections"      element={<ConnectionsPage />} />
            <Route path="p2p"              element={<P2PPage />} />
            <Route path="pos"              element={<PosPage />} />
            <Route path="pos/shifts"       element={<ShiftLogPage />} />
            <Route path="pos/sales"        element={<SalesLogPage />} />
            <Route path="purchases/invoices"           element={<PurchaseInvoiceListPage />} />
            <Route path="purchases/invoices/create"    element={<PurchaseInvoiceCreatePage />} />
            <Route path="purchases/invoices/:id"       element={<PurchaseInvoiceDetailPage />} />
            <Route path="purchases/returns"         element={<PurchaseReturnListPage />} />
            <Route path="purchases/returns/create"  element={<PurchaseReturnCreatePage />} />
            <Route path="purchases/wishlist"        element={<PurchaseWishListPage />} />
            <Route path="customers"        element={<CustomersPage />} />
            <Route path="settings"         element={<SettingsPage />} />
            <Route path="reports"          element={<ReportsHubPage />} />
            <Route path="reports/sales-summary"  element={<SalesSummaryPage />} />
            <Route path="reports/sales-by-product" element={<SalesByProductPage />} />
            <Route path="reports/inventory-current" element={<CurrentInventoryPage />} />
            <Route path="reports/expiry-report" element={<ExpiryReportPage />} />
            <Route path="reports/insurance-claims" element={<InsuranceClaimsPage />} />
            <Route path="reports/profit-loss"                  element={<ProfitLossPage />} />
            <Route path="reports/profitability-by-product"     element={<ProfitabilityByProductPage />} />
            <Route path="reports/profitability-by-category"    element={<ProfitabilityByCategoryPage />} />
          </Route>

          {/* ── Supplier ─────────────────────────────────────────────────────── */}
          <Route
            path="/supplier/*"
            element={<ProtectedRoute requiredRole="supplier_admin"><AppLayout /></ProtectedRoute>}
          >
            <Route index                    element={<SupplierDashboardPage />} />
            <Route path="catalog"           element={<SupplierCatalogPage />} />
            <Route path="orders"            element={<SupplierOrdersPage />} />
            <Route path="orders/:id"        element={<OrderDetailPage />} />
            <Route path="profile"           element={<SupplierProfilePage />} />
            <Route path="import"            element={<BulkImportPage />} />
            <Route path="demand"            element={<DemandSignalsPage />} />
          </Route>

          {/* ── Admin ────────────────────────────────────────────────────────── */}
          <Route
            path="/admin/*"
            element={<ProtectedRoute requiredRole="system_admin"><AppLayout /></ProtectedRoute>}
          >
            <Route index                    element={<AdminDashboardPage />} />
            <Route path="tenants"           element={<TenantsPage />} />
            <Route path="users"             element={<UsersPage />} />
            <Route path="organizations"     element={<OrganizationsPage />} />
            <Route path="integrations"      element={<IntegrationsPage />} />
            <Route path="audit"             element={<AuditLogPage />} />
            <Route path="recalls"           element={<RecallsPage />} />
          </Route>

          {/* ── Chain Admin ──────────────────────────────────────────────────── */}
          <Route
            path="/chain/*"
            element={<ProtectedRoute requiredRole="chain_admin"><AppLayout /></ProtectedRoute>}
          >
            <Route index element={<ChainDashboardPage />} />
          </Route>

          <Route path="/"  element={<RoleRedirect />} />
          <Route path="*"  element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
