import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown, LogOut, User, Settings,
  LayoutDashboard, Package, ShoppingCart, Sparkles,
  BookOpen, BarChart2, Building2, Users, Shield,
  Inbox, TrendingUp, AlertTriangle, Star,
  Plug, GitBranch, Upload, ListChecks, Bell,
  CheckCircle2, ShieldCheck, Store, Receipt, Clock,
  Menu, X, FileText, RefreshCw, Layers, LineChart, Globe,
} from 'lucide-react';
import clsx from 'clsx';
import { useProfileStore } from '../../store/auth.store';
import { getRoleFromToken } from '../../auth/oidc';
import { NotificationBell } from '../NotificationBell';
import { GlobalCartButton } from './GlobalCartButton';
import { NeedDrugButton } from '../needs/NeedDrugButton';

interface NavGroup {
  labelKey: string;
  icon: React.ElementType;
  items: { labelKey: string; to: string; icon: React.ElementType }[];
}

// Order: Inventory(0), Orders(1), Procurement(2), Analytics(3)
const PHARMACY_NAV: NavGroup[] = [
  {
    labelKey: 'nav.inventory',
    icon: Package,
    items: [
      { labelKey: 'nav.onboarding',        to: '/pharmacy/onboarding',       icon: Sparkles },
      { labelKey: 'nav.migration',         to: '/pharmacy/migration',        icon: Upload },
      { labelKey: 'nav.inventory',         to: '/pharmacy/inventory',        icon: Package },
      { labelKey: 'nav.supplier_catalog',  to: '/pharmacy/catalog',          icon: BookOpen },
      { labelKey: 'nav.catalog_requests',  to: '/pharmacy/catalog-requests', icon: GitBranch },
      { labelKey: 'nav.price_intelligence', to: '/pharmacy/price-intelligence', icon: LineChart },
    ],
  },
  {
    labelKey: 'nav.medicine_market',
    icon: ShoppingCart,
    items: [
      { labelKey: 'nav.orders',             to: '/pharmacy/orders',      icon: ShoppingCart },
      { labelKey: 'nav.preferred_suppliers',to: '/pharmacy/connections', icon: Star },
      { labelKey: 'nav.marketplace',        to: '/pharmacy/marketplace', icon: Building2 },
    ],
  },
  {
    labelKey: 'nav.purchases',
    icon: FileText,
    items: [
      { labelKey: 'nav.purchase_invoices', to: '/pharmacy/purchases/invoices', icon: FileText },
      { labelKey: 'nav.purchase_returns',  to: '/pharmacy/purchases/returns',  icon: RefreshCw },
      { labelKey: 'nav.purchase_wishlist', to: '/pharmacy/purchases/wishlist', icon: ListChecks },
    ],
  },
  {
    labelKey: 'nav.reports',
    icon: BarChart2,
    items: [
      { labelKey: 'nav.reports', to: '/pharmacy/reports', icon: BarChart2 },
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
          'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 whitespace-nowrap',
          hasActive
            ? 'bg-emerald-50 text-emerald-700'
            : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700',
        )}
      >
        {t(group.labelKey)}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'flex items-center gap-1.5 ps-3 pe-2.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
          hasActive
            ? 'bg-emerald-50 text-emerald-700'
            : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700',
        )}
      >
        {t(group.labelKey)}
        <ChevronDown size={13} className={clsx('transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full start-0 mt-1 w-52 max-w-[calc(100vw-16px)] bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={clsx(
                'flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors',
                location.pathname.startsWith(item.to)
                  ? 'bg-emerald-50 text-emerald-700'
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

// ── P2P Exchange link (only for pharmacy_admin) ────────────────────────────
const P2P_SUBTABS = [
  { tab: 'marketplace', labelAr: 'تصفح السوق',       labelEn: 'Marketplace',     icon: ShoppingCart },
  { tab: 'sell',        labelAr: 'أعرض للبيع',       labelEn: 'Sell',            icon: Package },
  { tab: 'orders',      labelAr: 'الطلبات',           labelEn: 'Orders',          icon: Inbox },
  { tab: 'insights',    labelAr: 'ذكاء السوق',        labelEn: 'AI Insights',     icon: TrendingUp },
] as const

function P2PExchangeLink() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isActive = location.pathname.startsWith('/pharmacy/p2p');
  const activeSub = new URLSearchParams(location.search).get('tab') ?? 'marketplace';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'flex items-center gap-1.5 ps-3 pe-2.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
          isActive ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700',
        )}
      >
        {isRTL ? 'البيع للصيدليات' : 'P2P Exchange'}
        <ChevronDown size={13} className={clsx('transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={clsx(
          'absolute top-full mt-1 w-52 max-w-[calc(100vw-16px)] bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50',
          isRTL ? 'right-0' : 'left-0',
        )}>
          {P2P_SUBTABS.map(({ tab, labelAr, labelEn, icon: Icon }) => {
            const active = isActive && activeSub === tab;
            return (
              <Link
                key={tab}
                to={`/pharmacy/p2p?tab=${tab}`}
                onClick={() => setOpen(false)}
                className={clsx(
                  'flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                <Icon size={14} className={active ? 'text-emerald-600' : 'text-gray-400'} />
                {isRTL ? labelAr : labelEn}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── POS menu (only for pharmacy_admin) ────────────────────────────────────────
const POS_SUBTABS = [
  { to: '/pharmacy/pos',         labelAr: 'نقطة البيع',            labelEn: 'POS Terminal', icon: Receipt },
  { to: '/pharmacy/pos/shifts',  labelAr: 'سجل الشفتات',           labelEn: 'Shift Log',    icon: Clock },
  { to: '/pharmacy/pos/sales',   labelAr: 'المبيعات والمرتجعات',   labelEn: 'Sales Log',    icon: TrendingUp },
] as const;

function PosMenu() {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isActive = location.pathname.startsWith('/pharmacy/pos');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'flex items-center gap-1.5 ps-3 pe-2.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
          isActive ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700',
        )}
      >
        {isRTL ? 'نقطة البيع' : 'POS'}
        <ChevronDown size={13} className={clsx('transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={clsx(
          'absolute top-full mt-1 w-52 max-w-[calc(100vw-16px)] bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50',
          isRTL ? 'right-0' : 'left-0',
        )}>
          {POS_SUBTABS.map(({ to, labelAr, labelEn, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={clsx(
                  'flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                <Icon size={14} className={active ? 'text-emerald-600' : 'text-gray-400'} />
                {isRTL ? labelAr : labelEn}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── AI Center flagship menu (only for pharmacy_admin) ──────────────────────
const AI_CENTER_SUBTABS = [
  { tab: 'dashboard', labelAr: 'لوحة العمل',        labelEn: 'Workboard',  icon: LayoutDashboard },
  { tab: 'approvals', labelAr: 'مركز الموافقات',    labelEn: 'Approvals',  icon: Inbox },
  { tab: 'tasks',     labelAr: 'مهامي',              labelEn: 'My Tasks',   icon: CheckCircle2 },
  { tab: 'agents',    labelAr: 'مساعدوك الأذكياء',  labelEn: 'Agents',     icon: Users },
  { tab: 'audit',     labelAr: 'السجل والشفافية',   labelEn: 'Audit',      icon: ShieldCheck },
] as const;

function AiCenterMenu() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isActive = location.pathname.startsWith('/pharmacy/ai-center');
  const activeSub = new URLSearchParams(location.search).get('tab') ?? 'dashboard';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'flex items-center gap-1.5 ps-3 pe-2.5 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm whitespace-nowrap',
          isActive
            ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
            : 'bg-gradient-to-r from-violet-50 to-fuchsia-50 text-violet-700 hover:from-violet-100 hover:to-fuchsia-100',
        )}
      >
        <Sparkles size={15} className={isActive ? 'text-white' : 'text-violet-600'} />
        {t('nav.ai_center')}
        <span className={clsx(
          'ms-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider',
          isActive ? 'bg-white/25 text-white' : 'bg-violet-200/60 text-violet-700',
        )}>AI</span>
        <ChevronDown size={13} className={clsx('transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={clsx(
          'absolute top-full mt-1 w-64 max-w-[calc(100vw-16px)] bg-white rounded-xl shadow-xl border border-violet-100 py-1 z-50',
          isRTL ? 'right-0' : 'left-0',
        )}>
          <div className="px-3 py-2 border-b border-gray-100 mb-1">
            <p className="text-[11px] text-gray-500 leading-tight">
              {isRTL
                ? 'مساعدوك الأذكياء يراقبون صيدليتك ويقترحون قرارات — وأنت من يقرر.'
                : 'Your AI agents watch your pharmacy and suggest decisions — you always decide.'}
            </p>
          </div>
          {AI_CENTER_SUBTABS.map(({ tab, labelAr, labelEn, icon: Icon }) => {
            const to = `/pharmacy/ai-center?tab=${tab}`;
            const active = isActive && activeSub === tab;
            return (
              <Link
                key={tab}
                to={to}
                onClick={() => setOpen(false)}
                className={clsx(
                  'flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors',
                  active ? 'bg-violet-50 text-violet-700 font-medium' : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                <Icon size={14} className={active ? 'text-violet-600' : 'text-gray-400'} />
                {isRTL ? labelAr : labelEn}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Mobile nav drawer ─────────────────────────────────────────────────────────
function MobileNavDrawer({
  open, onClose, role, navConfig,
}: {
  open: boolean
  onClose: () => void
  role: string
  navConfig: { dashboard: string; groups: NavGroup[] } | undefined
}) {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const location = useLocation()

  useEffect(() => { if (open) document.body.style.overflow = 'hidden'; else document.body.style.overflow = ''; return () => { document.body.style.overflow = '' } }, [open])
  useEffect(() => { onClose() }, [location.pathname, location.search])

  if (!open) return null

  const linkCls = (active: boolean) => clsx(
    'flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors',
    active ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-gray-50',
  )

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className={clsx(
        'fixed top-0 bottom-0 z-50 w-72 bg-white shadow-xl flex flex-col',
        isRTL ? 'right-0' : 'left-0',
      )}>
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
          <span className="font-bold text-gray-900">القائمة</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {/* Dashboard */}
          <Link to={navConfig?.dashboard ?? '/'} className={linkCls(location.pathname === navConfig?.dashboard)}>
            <LayoutDashboard size={16} />
            {t('nav.dashboard')}
          </Link>

          {role === 'pharmacy_admin' && (
            <>
              {/* AI Center */}
              <div className="pt-2">
                <p className="px-4 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">AI</p>
                {AI_CENTER_SUBTABS.map(({ tab, labelAr, labelEn, icon: Icon }) => {
                  const active = location.pathname.startsWith('/pharmacy/ai-center') && (new URLSearchParams(location.search).get('tab') ?? 'dashboard') === tab
                  return (
                    <Link key={tab} to={`/pharmacy/ai-center?tab=${tab}`} className={linkCls(active)}>
                      <Icon size={16} />{isRTL ? labelAr : labelEn}
                    </Link>
                  )
                })}
              </div>

              {/* P2P */}
              <div className="pt-2">
                <p className="px-4 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">P2P</p>
                {P2P_SUBTABS.map(({ tab, labelAr, labelEn, icon: Icon }) => {
                  const active = location.pathname.startsWith('/pharmacy/p2p') && (new URLSearchParams(location.search).get('tab') ?? 'marketplace') === tab
                  return (
                    <Link key={tab} to={`/pharmacy/p2p?tab=${tab}`} className={linkCls(active)}>
                      <Icon size={16} />{isRTL ? labelAr : labelEn}
                    </Link>
                  )
                })}
              </div>

              {/* POS */}
              <div className="pt-2">
                <p className="px-4 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">POS</p>
                {POS_SUBTABS.map(({ to, labelAr, labelEn, icon: Icon }) => (
                  <Link key={to} to={to} className={linkCls(location.pathname === to)}>
                    <Icon size={16} />{isRTL ? labelAr : labelEn}
                  </Link>
                ))}
              </div>

              {/* Inventory */}
              <div className="pt-2">
                <p className="px-4 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{isRTL ? 'المخزون والكتالوج' : 'Inventory'}</p>
                {PHARMACY_NAV[0].items.map(i => (
                  <Link key={i.to} to={i.to} className={linkCls(location.pathname.startsWith(i.to))}>
                    <i.icon size={16} />{t(i.labelKey)}
                  </Link>
                ))}
              </div>

              {/* Medicine Market */}
              <div className="pt-2">
                <p className="px-4 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{isRTL ? 'سوق الأدوية' : 'Medicine Market'}</p>
                {PHARMACY_NAV[1].items.map(i => (
                  <Link key={i.to} to={i.to} className={linkCls(location.pathname.startsWith(i.to))}>
                    <i.icon size={16} />{t(i.labelKey)}
                  </Link>
                ))}
              </div>

              {/* Purchases */}
              <div className="pt-2">
                <p className="px-4 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{isRTL ? 'المشتريات' : 'Purchases'}</p>
                {PHARMACY_NAV[2].items.map(i => (
                  <Link key={i.to} to={i.to} className={linkCls(location.pathname.startsWith(i.to))}>
                    <i.icon size={16} />{t(i.labelKey)}
                  </Link>
                ))}
              </div>

              {/* Customers + Settings */}
              <div className="pt-2">
                <p className="px-4 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{isRTL ? 'أخرى' : 'More'}</p>
                <Link to="/pharmacy/customers" className={linkCls(location.pathname.startsWith('/pharmacy/customers'))}>
                  <Users size={16} />{isRTL ? 'العملاء' : 'Customers'}
                </Link>
                {PHARMACY_NAV[3].items.map(i => (
                  <Link key={i.to} to={i.to} className={linkCls(location.pathname.startsWith(i.to))}>
                    <i.icon size={16} />{t(i.labelKey)}
                  </Link>
                ))}
                <Link to="/pharmacy/settings" className={linkCls(location.pathname.startsWith('/pharmacy/settings'))}>
                  <Settings size={16} />{isRTL ? 'الإعدادات' : 'Settings'}
                </Link>
              </div>
            </>
          )}

          {/* Other roles */}
          {role !== 'pharmacy_admin' && navConfig?.groups.map(group => (
            <div key={group.labelKey} className="pt-2">
              {group.items.map(i => (
                <Link key={i.to} to={i.to} className={linkCls(location.pathname.startsWith(i.to))}>
                  <i.icon size={16} />{t(i.labelKey)}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export function TopNav() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, clearProfile } = useProfileStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const role = profile?.role ?? getRoleFromToken(auth.user) ?? '';
  const navConfig = NAV_MAP[role];
  const isRTL = i18n.language === 'ar';
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
    <>
      <MobileNavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} role={role} navConfig={navConfig} />

      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-4">

          {/* Hamburger — visible on < xl */}
          <button
            onClick={() => setMobileOpen(true)}
            className="xl:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600 shrink-0"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          {/* Logo */}
          <Link
            to={navConfig?.dashboard ?? '/'}
            className="flex items-center gap-2 shrink-0"
          >
            <span className="text-2xl">💊</span>
            <span className="font-bold text-base sm:text-lg text-gray-900 tracking-tight">Bnoov</span>
            {tenantName && (
              <span
                title={tenantName}
                className="hidden md:flex items-center justify-center h-5 px-1.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold ml-1 shrink-0 cursor-default tracking-wide"
              >
                {tenantName.replace(/[^a-zA-Z؀-ۿ]/g, ' ').trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase() || tenantName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </Link>

          {/* Desktop navigation — hidden on < xl */}
          <nav className="hidden xl:flex items-center gap-1 flex-1 min-w-0 overflow-visible">
            {role === 'pharmacy_admin' && navConfig ? (
              <>
                <Link
                  to={navConfig.dashboard}
                  className={clsx(
                    'px-3 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 whitespace-nowrap',
                    location.pathname === navConfig.dashboard
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                  )}
                >
                  {t('nav.dashboard')}
                </Link>
                <AiCenterMenu />
                <P2PExchangeLink />
                <DropdownGroup group={PHARMACY_NAV[0]} isActive={PHARMACY_NAV[0].items.some(i => location.pathname.startsWith(i.to))} />
                <PosMenu />
                <DropdownGroup group={PHARMACY_NAV[1]} isActive={PHARMACY_NAV[1].items.some(i => location.pathname.startsWith(i.to))} />
                <DropdownGroup group={PHARMACY_NAV[2]} isActive={PHARMACY_NAV[2].items.some(i => location.pathname.startsWith(i.to))} />
                <Link
                  to="/pharmacy/customers"
                  className={clsx(
                    'px-3 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 whitespace-nowrap',
                    location.pathname.startsWith('/pharmacy/customers')
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                  )}
                >
                  {isRTL ? 'العملاء' : 'Customers'}
                </Link>
                <DropdownGroup group={PHARMACY_NAV[3]} isActive={PHARMACY_NAV[3].items.some(i => location.pathname.startsWith(i.to))} />
                <Link
                  to="/pharmacy/settings"
                  className={clsx(
                    'px-3 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 whitespace-nowrap',
                    location.pathname.startsWith('/pharmacy/settings')
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                  )}
                >
                  {isRTL ? 'الإعدادات' : 'Settings'}
                </Link>
              </>
            ) : (
              <>
                {navConfig && (
                  <Link
                    to={navConfig.dashboard}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 whitespace-nowrap',
                      location.pathname === navConfig.dashboard
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                    )}
                  >
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
              </>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
            {role === 'pharmacy_admin' && <NeedDrugButton />}
            {role === 'pharmacy_admin' && <GlobalCartButton />}
            <NotificationBell />

            {/* User menu */}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-semibold text-gray-900 max-w-[100px] truncate">{displayName}</p>
                  <p className="text-xs text-gray-400 capitalize">{role?.replace(/_/g, ' ')}</p>
                </div>
                <ChevronDown size={13} className={clsx('text-gray-400 transition-transform', userMenuOpen && 'rotate-180')} />
              </button>

              {userMenuOpen && (
                <div className="absolute ltr:right-0 rtl:left-0 top-full mt-1 w-52 max-w-[calc(100vw-16px)] bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
                  </div>
                  <button
                    onClick={() => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Globe size={14} className="text-gray-400" />
                    {i18n.language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
                  </button>
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
    </>
  );
}

