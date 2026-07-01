import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Package, ShoppingCart, FileText, CheckCircle, AlertTriangle, Sparkles, XCircle, Clock, VolumeX, Volume2 } from 'lucide-react';
import clsx from 'clsx';
import { notificationsApi } from '../api/notifications.api';
import { useNotificationSound, setNotificationSoundMuted, getNotificationSoundMuted } from '../hooks/useNotificationSound';

const TYPE_ICON: Record<string, React.ElementType> = {
  high_risk_stockout:       AlertTriangle,
  order_status_changed:     ShoppingCart,
  draft_created:            FileText,
  supplier_overdue:         AlertTriangle,
  delivery_confirmed:       CheckCircle,
  forecast_spike:           AlertTriangle,
  reorder_deadline:         Package,
  dead_stock_warning:       Package,
  inventory_batch_complete: Sparkles,
  inventory_batch_failed:   XCircle,
  morning_briefing:         Sparkles,
  system:                   Bell,
  near_expiry:              Clock,
  expiry_digest:            Clock,
  p2p_order_received:           ShoppingCart,
  p2p_order_accepted:           CheckCircle,
  p2p_order_rejected:           XCircle,
  p2p_order_completed:          CheckCircle,
  p2p_invoice_ready:            FileText,
  p2p_order_action_required:    AlertTriangle,
  p2p_order_reminder:           AlertTriangle,
  p2p_pool_opportunity:         Sparkles,
};

const TYPE_COLOR: Record<string, string> = {
  high_risk_stockout:       'text-red-500',
  order_status_changed:     'text-blue-500',
  draft_created:            'text-purple-500',
  delivery_confirmed:       'text-green-500',
  reorder_deadline:         'text-orange-500',
  inventory_batch_complete: 'text-emerald-500',
  inventory_batch_failed:   'text-red-500',
  morning_briefing:         'text-violet-500',
  near_expiry:              'text-orange-500',
  expiry_digest:            'text-orange-500',
  p2p_order_received:           'text-emerald-600',
  p2p_order_accepted:           'text-emerald-600',
  p2p_order_rejected:           'text-red-500',
  p2p_order_completed:          'text-emerald-600',
  p2p_invoice_ready:            'text-blue-500',
  p2p_order_action_required:    'text-orange-500',
  p2p_order_reminder:           'text-orange-500',
  p2p_pool_opportunity:         'text-emerald-600',
};

// Notification types that warrant a critical (urgent) sound
const CRITICAL_TYPES = new Set([
  'high_risk_stockout', 'near_expiry', 'expired_stock', 'low_stock', 'drug_need_broadcast',
]);

// Resolve the in-app destination for a notification. Returns a router path, or
// null when there is nothing meaningful to open. The backend stamps either a
// path-style `resourceRef` (e.g. "/pharmacy/inventory?filter=expired"), a
// prefixed ref ("order:<id>", "p2p_order:<id>", "approval:<id>", …), or nothing
// at all — in which case we fall back to a sensible page based on `type`.
function resolveNotificationTarget(n: any): string | null {
  const type = (n?.type ?? '') as string;
  const ref  = typeof n?.resourceRef === 'string' ? n.resourceRef.trim() : '';

  const p2pRole = () => {
    const buyerTypes  = new Set(['p2p_order_accepted', 'p2p_order_rejected', 'p2p_order_shipped', 'p2p_invoice_ready', 'p2p_order_reminder']);
    const sellerTypes = new Set(['p2p_order_received', 'p2p_order_completed']);
    return buyerTypes.has(type) ? 'buyer' : sellerTypes.has(type) ? 'seller' : 'both';
  };

  // AI-monitor task: always send the user to the agent's task queue, even though
  // it also carries a p2p_order ref — the action lives in the AI Center.
  if (type === 'p2p_order_action_required') return '/pharmacy/ai-center?tab=tasks&domain=p2p&state=open';

  // 1) Path-style ref → use directly, repairing known legacy routes.
  if (ref.startsWith('/')) {
    const imp = ref.match(/^\/pharmacy\/inventory\/imports\/([^/?]+)/);
    if (imp) return `/pharmacy/inventory?linkStatus=suggested&batchId=${imp[1]}`;
    return ref;
  }

  // 2) Prefixed ref "<kind>:<id>".
  if (ref.includes(':')) {
    const idx  = ref.indexOf(':');
    const kind = ref.slice(0, idx);
    const id   = ref.slice(idx + 1);
    switch (kind) {
      case 'order':                  return `/pharmacy/orders/${id}`;
      case 'p2p_order':
      case 'p2p_invoice':            return `/pharmacy/p2p?tab=orders&orderRole=${p2pRole()}&highlight=${id}`;
      case 'approval':               return `/pharmacy/ai-center?tab=approvals&id=${id}`;
      case 'recommendation':         return '/pharmacy/ai-center?tab=tasks&domain=purchasing&state=open';
      case 'pos_shift':              return '/pharmacy/pos/shifts';
      case 'p2p':                    return '/pharmacy/p2p?tab=insights';
      case 'financial-health-daily': return '/pharmacy/reports/profit-loss';
      case 'recall':                 return '/pharmacy/inventory';
      case 'batch':                  return '/pharmacy/inventory';
      case 'feature-request':        return '/pharmacy/settings';
      default:                       break; // fall through to type mapping
    }
  }

  // 3) No usable ref → map by notification type to a valid page.
  switch (type) {
    case 'high_risk_stockout':
    case 'low_stock':
    case 'reorder_deadline':         return '/pharmacy/inventory?filter=low_stock';
    case 'near_expiry':
    case 'expiry_digest':            return '/pharmacy/inventory?filter=expiry';
    case 'expired_stock':            return '/pharmacy/inventory?filter=expired';
    case 'dead_stock_warning':       return '/pharmacy/inventory?filter=dead';
    case 'forecast_spike':           return '/pharmacy/ai-center';
    case 'order_status_changed':
    case 'delivery_confirmed':
    case 'supplier_overdue':         return '/pharmacy/orders';
    case 'draft_created':            return '/pharmacy/ai-center?tab=approvals';
    case 'inventory_batch_complete': return '/pharmacy/inventory?linkStatus=suggested';
    case 'inventory_batch_failed':   return '/pharmacy/inventory';
    case 'morning_briefing':         return '/pharmacy/ai-center';
    case 'p2p_pool_opportunity':     return '/pharmacy/p2p?tab=marketplace';
    // Demand Broadcast ("أحتاج دواء"): a nearby pharmacy needs a drug you hold → list it to sell.
    case 'drug_need_broadcast':      return '/pharmacy/p2p?tab=sell';
    // Requester side: a nearby pharmacy can supply your need → go buy it.
    case 'drug_need_response':       return '/pharmacy/p2p?tab=marketplace';
    default:                         return null;
  }
}

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(getNotificationSoundMuted);
  const ref = useRef<HTMLDivElement>(null);
  const prevCount = useRef<number>(0);
  const { play } = useNotificationSound();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setNotificationSoundMuted(next);
  };

  const { data: countData } = useQuery({
    queryKey: ['notification-count'],
    queryFn: () => notificationsApi.getUnreadCount().then((r) => r.data),
    refetchInterval: 30_000, // poll every 30s for new notifications
  });

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(20).then((r) => r.data),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notification-count'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notification-count'] });
    },
  });

  const unreadCount = countData?.count ?? 0;

  // Play sound when new notifications arrive (count increased since last poll)
  useEffect(() => {
    if (unreadCount > prevCount.current && prevCount.current >= 0) {
      // Fetch the latest notification type to pick the right sound
      notificationsApi.list(1).then((r) => {
        const latest = (r.data as any[])[0];
        const type = latest?.type ?? '';
        play(CRITICAL_TYPES.has(type) ? 'critical' : 'normal');
      }).catch(() => play('normal'));
    }
    prevCount.current = unreadCount;
  }, [unreadCount, play]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-12 w-[min(24rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center px-4 py-3 border-b border-gray-100" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-gray-500" />
              <span className="font-semibold text-gray-800 text-sm">الإشعارات</span>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} جديد
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 ms-auto">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                >
                  تعليم الكل كمقروء
                </button>
              )}
              <button
                onClick={toggleMute}
                className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title={muted ? 'تفعيل الصوت' : 'كتم الصوت'}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {(notifications as any[]).length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-gray-400 text-sm">
                  {isRTL ? 'لا توجد إشعارات' : 'No notifications yet'}
                </p>
              </div>
            ) : (
              (notifications as any[]).map((n: any) => {
                const Icon = TYPE_ICON[n.type] ?? Bell;
                const iconColor = TYPE_COLOR[n.type] ?? 'text-gray-400';
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.isRead) markRead.mutate(n.id);
                      setOpen(false);
                      const target = resolveNotificationTarget(n);
                      if (target) navigate(target);
                    }}
                    className={clsx(
                      'w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0',
                      !n.isRead && 'bg-blue-50/40',
                    )}
                    dir="rtl"
                  >
                    <div className={clsx('p-1.5 rounded-lg bg-white border border-gray-100 shrink-0 mt-0.5', iconColor)}>
                      <Icon size={13} />
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex items-start justify-between gap-2 flex-row-reverse">
                        <p className={clsx('text-sm font-medium text-right', n.isRead ? 'text-gray-600' : 'text-gray-900')}>
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 text-right">{n.body}</p>
                      <p className="text-xs text-gray-400 mt-1 text-right">
                        {new Date(n.createdAt).toLocaleString('en-US')}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
