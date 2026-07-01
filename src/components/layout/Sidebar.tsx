import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Package, ShoppingCart, Sparkles, BookOpen,
  Building2, Users, ListChecks, Inbox, BarChart2, Star,
  User, Upload, TrendingUp, Shield, Plug, GitBranch,
  Calendar, AlertTriangle, CheckCircle2, ShieldCheck, ChevronDown,
  Store, Layers, Rocket,
} from 'lucide-react';
import { useAuth } from 'react-oidc-context';
import { useProfileStore } from '../../store/auth.store';
import { getRoleFromToken } from '../../auth/oidc';

interface NavItem { labelKey: string; to: string; icon: React.ElementType }

// ── AI Center sub-tabs (deep-link into the page via ?tab=…) ────────────────
const aiCenterSubTabs: Array<{ tab: string; labelAr: string; labelEn: string; icon: React.ElementType }> = [
  { tab: 'dashboard', labelAr: 'لوحة العمل',        labelEn: 'Workboard',  icon: LayoutDashboard },
  { tab: 'approvals', labelAr: 'مركز الموافقات',    labelEn: 'Approvals',  icon: Inbox },
  { tab: 'tasks',     labelAr: 'مهامي',              labelEn: 'My Tasks',   icon: CheckCircle2 },
  { tab: 'agents',    labelAr: 'مساعدوك الأذكياء',  labelEn: 'Agents',     icon: Users },
  { tab: 'audit',     labelAr: 'السجل والشفافية',   labelEn: 'Audit',      icon: ShieldCheck },
];

const pharmacyNav: NavItem[] = [
  { labelKey: 'nav.dashboard',           to: '/pharmacy',             icon: LayoutDashboard },
  { labelKey: 'nav.onboarding',          to: '/pharmacy/onboarding',  icon: Rocket },
  // AI Center rendered as a special group below — do NOT put it here.
  { labelKey: 'nav.procurement_queue',   to: '/pharmacy/queue',       icon: Inbox },
  { labelKey: 'nav.forecast',            to: '/pharmacy/forecast',    icon: BarChart2 },
  { labelKey: 'nav.order_schedule',      to: '/pharmacy/eoq',         icon: Calendar },
  { labelKey: 'nav.dead_stock',          to: '/pharmacy/dead-stock',  icon: AlertTriangle },
  { labelKey: 'nav.reports',              to: '/pharmacy/reports',     icon: BarChart2 },
  { labelKey: 'nav.inventory',           to: '/pharmacy/inventory',   icon: Package },
  { labelKey: 'nav.products',            to: '/pharmacy/products',    icon: Layers },
  { labelKey: 'nav.supplier_catalog',    to: '/pharmacy/catalog',     icon: BookOpen },
  { labelKey: 'nav.catalog_requests',    to: '/pharmacy/catalog-requests', icon: GitBranch },
  { labelKey: 'nav.orders',              to: '/pharmacy/orders',      icon: ShoppingCart },
  { labelKey: 'nav.preferred_suppliers', to: '/pharmacy/connections', icon: Star },
  { labelKey: 'nav.marketplace',         to: '/pharmacy/marketplace', icon: Building2 },
  { labelKey: 'nav.migration',           to: '/pharmacy/migration',   icon: Upload },
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
  const location   = useLocation();
  const isAiCenter = location.pathname.startsWith('/pharmacy/ai-center');
  const activeSub  = new URLSearchParams(location.search).get('tab') ?? 'dashboard';
  const [aiOpen, setAiOpen] = useState(isAiCenter);
  const showAiGroup = role === 'pharmacy_admin';

  return (
    <aside className={clsx('w-64 min-h-screen bg-slate-800 flex flex-col', isRTL && 'font-arabic')}>
      <div className="px-6 py-5 border-b border-slate-700">
        <div className={clsx('flex items-center gap-2', isRTL && 'flex-row-reverse')}>
          <span className="text-2xl">💊</span>
          <span className="text-white font-bold text-xl tracking-tight">Bnoov</span>
        </div>
        {tenantName && <p className={clsx('text-slate-400 text-xs mt-1 truncate', isRTL && 'text-right')}>{tenantName}</p>}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* ── Dashboard (always first) ─────────────────────────────── */}
        {navItems.slice(0, 1).map(({ labelKey, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
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

        {/* ── AI Center group — flagship feature, prominent gradient header ── */}
        {showAiGroup && (
          <div className="mt-2 mb-2">
            <button
              type="button"
              onClick={() => setAiOpen(v => !v)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all',
                isRTL && 'flex-row-reverse text-right',
                isAiCenter
                  ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md'
                  : 'bg-slate-700/40 text-slate-100 hover:bg-slate-700',
              )}
            >
              <Sparkles size={18} className={isAiCenter ? 'text-white' : 'text-violet-300'} />
              <span className="flex-1">{t('nav.ai_center')}</span>
              <span className={clsx(
                'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider',
                isAiCenter ? 'bg-white/20 text-white' : 'bg-violet-500/20 text-violet-200',
              )}>
                AI
              </span>
              <ChevronDown
                size={14}
                className={clsx('transition-transform', aiOpen && 'rotate-180')}
              />
            </button>
            {aiOpen && (
              <div className={clsx(
                'mt-1 space-y-0.5 ps-2',
                isRTL ? 'border-r-2 border-violet-500/40 me-3' : 'border-l-2 border-violet-500/40 ms-3',
              )}>
                {aiCenterSubTabs.map(({ tab, labelAr, labelEn, icon: SubIcon }) => {
                  const to = `/pharmacy/ai-center?tab=${tab}`;
                  const active = isAiCenter && activeSub === tab;
                  return (
                    <NavLink
                      key={tab}
                      to={to}
                      className={clsx(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all',
                        isRTL && 'flex-row-reverse text-right',
                        active
                          ? 'bg-violet-500/20 text-violet-100 font-medium'
                          : 'text-slate-400 hover:bg-slate-700/60 hover:text-slate-100',
                      )}
                    >
                      <SubIcon size={14} className={active ? 'text-violet-200' : 'text-slate-500'} />
                      {isRTL ? labelAr : labelEn}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── P2P Exchange group — pharmacy only ──────────────────── */}
        {showAiGroup && (
          <div className="mt-2 mb-2">
            <NavLink
              to="/pharmacy/p2p"
              className={({ isActive }) =>
                clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all',
                  isRTL && 'flex-row-reverse text-right',
                  isActive
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                    : 'bg-slate-700/40 text-slate-100 hover:bg-slate-700',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Store size={18} className={isActive ? 'text-white' : 'text-emerald-400'} />
                  <span className="flex-1">{isRTL ? 'تبادل الصيدليات' : 'P2P Exchange'}</span>
                  <span className={clsx(
                    'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider',
                    isActive ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-300',
                  )}>
                    NEW
                  </span>
                </>
              )}
            </NavLink>
          </div>
        )}

        {/* ── Rest of nav (skip the dashboard we already rendered) ──── */}
        {navItems.slice(1).map(({ labelKey, to, icon: Icon }) => (
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
        Bnoov v1.5
      </div>
    </aside>
  );
}
