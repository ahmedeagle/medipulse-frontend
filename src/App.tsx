import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { AppLayout } from './components/layout/AppLayout';
import { getRoleFromToken, getDashboardPath } from './auth/oidc';

import OidcCallbackPage     from './pages/auth/OidcCallbackPage';
import LoginPage            from './pages/auth/LoginPage';

// ── Pharmacy ──────────────────────────────────────────────────────────────────
import PharmacyDashboardPage   from './pages/pharmacy/DashboardPage';
import InventoryPage           from './pages/pharmacy/InventoryPage';
import CatalogPage             from './pages/pharmacy/CatalogPage';
import CatalogRequestsPage     from './pages/pharmacy/CatalogRequestsPage';
import PharmacyOrdersPage      from './pages/pharmacy/OrdersPage';
import AIRecommendationsPage   from './pages/pharmacy/AIRecommendationsPage';
import ProcurementQueuePage    from './pages/pharmacy/ProcurementQueuePage';
import AnalyticsDashboardPage  from './pages/pharmacy/AnalyticsDashboardPage';
import ConnectionsPage         from './pages/pharmacy/ConnectionsPage';
import ForecastPage            from './pages/pharmacy/ForecastPage';
import EoqPage                 from './pages/pharmacy/EoqPage';
import DeadStockPage           from './pages/pharmacy/DeadStockPage';

// ── Supplier ──────────────────────────────────────────────────────────────────
import SupplierDashboardPage   from './pages/supplier/DashboardPage';
import SupplierCatalogPage     from './pages/supplier/CatalogPage';
import SupplierOrdersPage      from './pages/supplier/OrdersPage';
import SupplierProfilePage     from './pages/supplier/SupplierProfilePage';
import BulkImportPage          from './pages/supplier/BulkImportPage';
import DemandSignalsPage       from './pages/supplier/DemandSignalsPage';

// ── Admin ─────────────────────────────────────────────────────────────────────
import AdminDashboardPage      from './pages/admin/DashboardPage';
import TenantsPage             from './pages/admin/TenantsPage';
import UsersPage               from './pages/admin/UsersPage';
import OrganizationsPage       from './pages/admin/OrganizationsPage';
import IntegrationsPage        from './pages/admin/IntegrationsPage';
import AuditLogPage            from './pages/admin/AuditLogPage';
import RecallsPage             from './pages/admin/RecallsPage';
import OrderDetailPage         from './pages/shared/OrderDetailPage';

// ── Chain Admin ───────────────────────────────────────────────────────────────
import ChainDashboardPage      from './pages/chain/ChainDashboardPage';

import OfflineBanner from './components/OfflineBanner';
import { RouteTitle } from './components/RouteTitle';

// ─── Route guards ──────────────────────────────────────────────────────────────

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

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <RouteTitle />
      <OfflineBanner />
      <Routes>
        {/* Public */}
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/auth/callback"  element={<OidcCallbackPage />} />

        {/* ── Pharmacy ─────────────────────────────────────────────────────── */}
        <Route
          path="/pharmacy/*"
          element={<ProtectedRoute requiredRole="pharmacy_admin"><AppLayout /></ProtectedRoute>}
        >
          <Route index                    element={<PharmacyDashboardPage />} />
          <Route path="queue"             element={<ProcurementQueuePage />} />
          <Route path="ai"               element={<AIRecommendationsPage />} />
          <Route path="forecast"         element={<ForecastPage />} />
          <Route path="eoq"              element={<EoqPage />} />
          <Route path="dead-stock"       element={<DeadStockPage />} />
          <Route path="analytics"        element={<AnalyticsDashboardPage />} />
          <Route path="inventory"        element={<InventoryPage />} />
          <Route path="catalog"          element={<CatalogPage />} />
          <Route path="catalog-requests" element={<CatalogRequestsPage />} />
          <Route path="orders"           element={<PharmacyOrdersPage />} />
          <Route path="orders/:id"       element={<OrderDetailPage />} />
          <Route path="connections"      element={<ConnectionsPage />} />
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

        {/* ── Admin (system_admin) ─────────────────────────────────────────── */}
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
          <Route index                    element={<ChainDashboardPage />} />
          {/* Dedicated chain views rendered inside ChainDashboardPage via tabs */}
        </Route>

        <Route path="/"  element={<RoleRedirect />} />
        <Route path="*"  element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
