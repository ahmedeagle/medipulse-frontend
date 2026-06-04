import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown, LogOut, User, Settings,
  LayoutDashboard, Package, ShoppingCart, Sparkles,
  BookOpen, BarChart2, Building2, Users, Shield,
  Inbox, TrendingUp, AlertTriangle, Calendar, Star,
  Plug, GitBranch, Upload, ListChecks, Bell,
} from 'lucide-react';
import clsx from 'clsx';
import { useProfileStore } from '../../store/auth.store';
import { getRoleFromToken } from '../../auth/oidc';
import { NotificationBell } from '../NotificationBell';
import { LanguageSwitcher } from '../LanguageSwitcher';

interface NavGroup {
  labelKey: string;
  icon: React.ElementType;
  items: { labelKey: string; to: string; icon: React.ElementType }[];
}

const PHARMACY_NAV: NavGroup[] = [
  {
    labelKey: 'nav.procurement_queue',
    icon: Inbox,
    items: [
      { labelKey: 'nav.procurement_queue',  to: '/pharmacy/queue',     icon: Inbox },
      { labelKey: 'nav.ai_recommendations', to: '/pharmacy/ai',        icon: Sparkles },
      { labelKey: 'nav.forecast',           to: '/pharmacy/forecast',  icon: BarChart2 },
      { labelKey: 'nav.order_schedule',     to: '/pharmacy/eoq',       icon: Calendar },
      { labelKey: 'nav.dead_stock',         to: '/pharmacy/dead-stock',icon: AlertTriangle },
    ],
  },
  {
    labelKey: 'nav.inventory',
    icon: Package,
    items: [
      { labelKey: 'nav.inventory',         to: '/pharmacy/inventory', icon: Package },
      { labelKey: 'nav.supplier_catalog',  to: '/pharmacy/catalog',   icon: BookOpen },
      { labelKey: 'nav.catalog_requests',  to: '/pharmacy/catalog-requests', icon: GitBranch },
    ],
  },
  {
    labelKey: 'nav.orders',
    icon: ShoppingCart,
    items: [
      { labelKey: 'nav.orders',             to: '/pharmacy/orders',      icon: ShoppingCart },
      { labelKey: 'nav.preferred_suppliers',to: '/pharmacy/connections', icon: Star },
    ],
  },
  {
    labelKey: 'nav.analytics',
    icon: TrendingUp,
    items: [
      { labelKey: 'nav.analytics', to: '/pharmacy/analytics', icon: BarChart2 },
    ],
  },
];

const SUPPLIER_NAV: NavGroup[] = [
  {
    labelKey: 'nav.my_catalog',
    icon: ListChecks,
    items: [
      { labelKey: 'nav.my_catalog',   to: '/supplier/catalog', icon: ListChecks },
      { labelKey: 'nav.bulk_import',  to: '/supplier/import',  icon: Upload },
      { labelKey: 'nav.profile',      to: '/supplier/profile', icon: User },
    ],
  },
  {
    labelKey: 'nav.orders',
    icon: ShoppingCart,
    items: [
      { labelKey: 'nav.orders', to: '/supplier/orders', icon: ShoppingCart },
    ],
  },
  {
    labelKey: 'nav.demand_signals',
    icon: TrendingUp,
    items: [
      { labelKey: 'nav.demand_signals', to: '/supplier/demand', icon: TrendingUp },
    ],
  },
];

const ADMIN_NAV: NavGroup[] = [
  {
    labelKey: 'nav.tenants',
    icon: Building2,
    items: [
      { labelKey: 'nav.tenants',       to: '/admin/tenants',       icon: Building2 },
      { labelKey: 'nav.users',         to: '/admin/users',         icon: Users },
      { labelKey: 'nav.organizations', to: '/admin/organizations', icon: GitBranch },
    ],
  },
  {
    labelKey: 'nav.audit_logs',
    icon: Shield,
    items: [
      { labelKey: 'nav.recalls',    to: '/admin/recalls', icon: AlertTriangle },
      { labelKey: 'nav.audit_logs', to: '/admin/audit',   icon: Shield },
    ],
  },
  {
    labelKey: 'nav.integrations',
    icon: Plug,
    items: [
      { labelKey: 'nav.integrations', to: '/admin/integrations', icon: Plug },
    ],
  },
];

const CHAIN_NAV: NavGroup[] = [
  {
    labelKey: 'nav.inventory',
    icon: Package,
    items: [
      { labelKey: 'nav.inventory', to: '/chain/inventory', icon: Package },
      { labelKey: 'nav.orders',    to: '/chain/orders',    icon: ShoppingCart },
      { labelKey: 'nav.analytics', to: '/chain/spend',     icon: BarChart2 },
    ],
  },
];

const NAV_MAP: Record<string, { dashboard: string; groups: NavGroup[] }> = {
  pharmacy_admin: { dashboard: '/pharmacy', groups: PHARMACY_NAV },
  supplier_admin: { dashboard: '/supplier', groups: SUPPLIER_NAV },
  system_admin:   { dashboard: '/admin',    groups: ADMIN_NAV },
  chain_admin:    { dashboard: '/chain',    groups: CHAIN_NAV },
};

function DropdownGroup({ group, isActive }: { group: NavGroup; isActive: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasActive = group.items.some(i => location.pathname.startsWith(i.to));

  if (group.items.length === 1) {
    return (
      <Link
        to={group.items[0].to}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
          hasActive
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
        )}
      >
        <group.icon size={15} />
        {t(group.labelKey)}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      {/* Label navigates to first item; chevron toggles dropdown */}
      <div className={clsx(
        'flex items-center rounded-lg transition-colors overflow-hidden',
        hasActive ? 'bg-blue-50' : 'hover:bg-gray-50',
      )}>
        <button
          onClick={() => navigate(group.items[0].to)}
          className={clsx(
            'flex items-center gap-1.5 pl-3 pr-2 py-2 text-sm font-medium',
            hasActive ? 'text-blue-700' : 'text-gray-600 hover:text-gray-900',
          )}
        >
          <group.icon size={15} />
          {t(group.labelKey)}
        </button>
        <button
          onClick={() => setOpen(!open)}
          className={clsx(
            'pr-2 py-2 transition-colors',
            hasActive ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600',
          )}
        >
          <ChevronDown size={13} className={clsx('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={clsx(
                'flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors',
                location.pathname.startsWith(item.to)
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50',
              )}
            >
              <item.icon size={14} />
              {t(item.labelKey)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopNav() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, clearProfile } = useProfileStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const role = profile?.role ?? getRoleFromToken(auth.user) ?? '';
  const navConfig = NAV_MAP[role];
  const tenantName = profile?.tenant?.name ?? '';
  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : (auth.user?.profile?.given_name ?? 'User');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    clearProfile();
    auth.signoutRedirect();
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="px-4 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link
          to={navConfig?.dashboard ?? '/'}
          className="flex items-center gap-2 shrink-0 mr-2"
        >
          <span className="text-2xl">💊</span>
          <span className="font-bold text-lg text-gray-900 tracking-tight">MediPulse</span>
          {tenantName && (
            <span className="hidden md:block text-xs text-gray-400 font-normal ml-1 max-w-[120px] truncate">
              {tenantName}
            </span>
          )}
        </Link>

        {/* Navigation groups */}
        <nav className="flex items-center gap-1 flex-1 min-w-0">
          {/* Dashboard link */}
          {navConfig && (
            <Link
              to={navConfig.dashboard}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors shrink-0',
                location.pathname === navConfig.dashboard
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
              )}
            >
              <LayoutDashboard size={15} />
              {t('nav.dashboard')}
            </Link>
          )}

          {navConfig?.groups.map((group) => (
            <DropdownGroup
              key={group.labelKey}
              group={group}
              isActive={group.items.some(i => location.pathname.startsWith(i.to))}
            />
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <NotificationBell />
          <LanguageSwitcher />

          {/* User menu */}
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-semibold text-gray-900 max-w-[100px] truncate">{displayName}</p>
                <p className="text-xs text-gray-400 capitalize">{role?.replace(/_/g, ' ')}</p>
              </div>
              <ChevronDown size={13} className={clsx('text-gray-400 transition-transform', userMenuOpen && 'rotate-180')} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
                  <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  {t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
