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
};

// Notification types that warrant a critical (urgent) sound
const CRITICAL_TYPES = new Set([
  'high_risk_stockout', 'near_expiry', 'expired_stock', 'low_stock',
]);

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
                      if (!n.resourceRef || typeof n.resourceRef !== 'string') { setOpen(false); return; }
                      setOpen(false);
                      if (n.resourceRef.startsWith('/')) {
                        navigate(n.resourceRef);
                      } else if (n.type === 'p2p_order_action_required') {
                        // AI monitor task → go directly to AI Center tasks tab
                        navigate('/pharmacy/ai-center?tab=tasks');
                      } else if (n.type === 'near_expiry' || n.type === 'expiry_digest' || n.type === 'expired_stock') {
                        navigate('/pharmacy/reports/expiry?days=30&from=alert');
                      } else if (n.type === 'dead_stock_warning') {
                        navigate('/pharmacy/reports/operational?from=alert');
                      } else if (n.type === 'low_stock' || n.type === 'high_risk_stockout' || n.type === 'reorder_deadline') {
                        navigate('/pharmacy/reports/inventory?statFilter=lowStock&from=alert');
                      } else if (n.type === 'morning_briefing') {
                        navigate('/pharmacy/reports?from=alert');
                      } else if (n.resourceRef.startsWith('p2p_order:') || n.resourceRef.startsWith('p2p_invoice:')) {
                        const orderId = n.resourceRef.split(':')[1];
                        // Map notification type to the role the recipient plays in that order
                        const buyerTypes = new Set(['p2p_order_accepted','p2p_order_rejected','p2p_order_shipped','p2p_invoice_ready','p2p_order_reminder']);
                        const sellerTypes = new Set(['p2p_order_received','p2p_order_completed']);
                        const role = buyerTypes.has(n.type) ? 'buyer' : sellerTypes.has(n.type) ? 'seller' : 'both';
                        navigate(`/pharmacy/p2p?tab=orders&orderRole=${role}&highlight=${orderId}`);
                      }
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
                        {new Date(n.createdAt).toLocaleString('ar-EG')}
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
