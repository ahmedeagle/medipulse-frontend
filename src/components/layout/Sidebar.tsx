import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Package, ShoppingCart, Sparkles, BookOpen,
  Building2, Users, ListChecks, Inbox, BarChart2, Star,
  User, Upload, TrendingUp, Shield, Plug, GitBranch,
  Calendar, AlertTriangle,
} from 'lucide-react';
import { useAuth } from 'react-oidc-context';
import { useProfileStore } from '../../store/auth.store';
import { getRoleFromToken } from '../../auth/oidc';

interface NavItem { labelKey: string; to: string; icon: React.ElementType }

const pharmacyNav: NavItem[] = [
  { labelKey: 'nav.dashboard',           to: '/pharmacy',             icon: LayoutDashboard },
  { labelKey: 'nav.procurement_queue',   to: '/pharmacy/queue',       icon: Inbox },
  { labelKey: 'nav.ai_recommendations',  to: '/pharmacy/ai',          icon: Sparkles },
  { labelKey: 'nav.forecast',            to: '/pharmacy/forecast',    icon: BarChart2 },
  { labelKey: 'nav.order_schedule',      to: '/pharmacy/eoq',         icon: Calendar },
  { labelKey: 'nav.dead_stock',          to: '/pharmacy/dead-stock',  icon: AlertTriangle },
  { labelKey: 'nav.analytics',           to: '/pharmacy/analytics',   icon: TrendingUp },
  { labelKey: 'nav.inventory',           to: '/pharmacy/inventory',   icon: Package },
  { labelKey: 'nav.supplier_catalog',    to: '/pharmacy/catalog',     icon: BookOpen },
  { labelKey: 'nav.catalog_requests',    to: '/pharmacy/catalog-requests', icon: GitBranch },
  { labelKey: 'nav.orders',              to: '/pharmacy/orders',      icon: ShoppingCart },
  { labelKey: 'nav.preferred_suppliers', to: '/pharmacy/connections', icon: Star },
];

const supplierNav: NavItem[] = [
  { labelKey: 'nav.dashboard',      to: '/supplier',             icon: LayoutDashboard },
  { labelKey: 'nav.my_catalog',     to: '/supplier/catalog',     icon: ListChecks },
  { labelKey: 'nav.orders',         to: '/supplier/orders',      icon: ShoppingCart },
  { labelKey: 'nav.profile',        to: '/supplier/profile',     icon: User },
  { labelKey: 'nav.bulk_import',    to: '/supplier/import',      icon: Upload },
  { labelKey: 'nav.demand_signals', to: '/supplier/demand',      icon: TrendingUp },
];

const adminNav: NavItem[] = [
  { labelKey: 'nav.dashboard',     to: '/admin',               icon: LayoutDashboard },
  { labelKey: 'nav.tenants',       to: '/admin/tenants',       icon: Building2 },
  { labelKey: 'nav.users',         to: '/admin/users',         icon: Users },
  { labelKey: 'nav.organizations', to: '/admin/organizations', icon: GitBranch },
  { labelKey: 'nav.integrations',  to: '/admin/integrations',  icon: Plug },
  { labelKey: 'nav.audit_logs',    to: '/admin/audit',         icon: Shield },
  { labelKey: 'nav.recalls',       to: '/admin/recalls',       icon: AlertTriangle },
];

const chainNav: NavItem[] = [
  { labelKey: 'nav.dashboard',  to: '/chain',           icon: LayoutDashboard },
  { labelKey: 'nav.inventory',  to: '/chain/inventory', icon: Package },
  { labelKey: 'nav.orders',     to: '/chain/orders',    icon: ShoppingCart },
  { labelKey: 'nav.analytics',  to: '/chain/spend',     icon: BarChart2 },
];

const NAV_MAP: Record<string, NavItem[]> = {
  pharmacy_admin: pharmacyNav,
  supplier_admin: supplierNav,
  system_admin:   adminNav,
  chain_admin:    chainNav,
};

export function Sidebar() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const auth = useAuth();
  const { profile } = useProfileStore();
  const role       = profile?.role ?? getRoleFromToken(auth.user);
  const navItems   = NAV_MAP[role ?? ''] ?? adminNav;
  const tenantName = profile?.tenant?.name ?? '';

  return (
    <aside className={clsx('w-64 min-h-screen bg-slate-800 flex flex-col', isRTL && 'font-arabic')}>
      <div className="px-6 py-5 border-b border-slate-700">
        <div className={clsx('flex items-center gap-2', isRTL && 'flex-row-reverse')}>
          <span className="text-2xl">💊</span>
          <span className="text-white font-bold text-xl tracking-tight">MediPulse</span>
        </div>
        {tenantName && <p className={clsx('text-slate-400 text-xs mt-1 truncate', isRTL && 'text-right')}>{tenantName}</p>}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ labelKey, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to.split('/').length === 2}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isRTL && 'flex-row-reverse text-right',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white',
              )
            }
          >
            <Icon size={18} />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-slate-700 text-xs text-slate-500 text-center">
        MediPulse v1.5
      </div>
    </aside>
  );
}
