import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, Package, ShoppingCart, FileText, CheckCircle, AlertTriangle, Sparkles, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { notificationsApi } from '../api/notifications.api';

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
};

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-gray-500" />
              <span className="font-semibold text-gray-800 text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {(notifications as any[]).length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-gray-400 text-sm">No notifications yet</p>
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
                      // Backend stores deep-link target in resourceRef; following
                      // it (when present and a relative path) takes the user
                      // directly to the actionable screen — e.g. the suggested-
                      // review queue after a successful import.
                      if (n.resourceRef && typeof n.resourceRef === 'string' && n.resourceRef.startsWith('/')) {
                        setOpen(false);
                        navigate(n.resourceRef);
                      }
                    }}
                    className={clsx(
                      'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0',
                      !n.isRead && 'bg-blue-50/40',
                    )}
                  >
                    <div className={clsx('p-1.5 rounded-lg bg-white border border-gray-100 shrink-0 mt-0.5', iconColor)}>
                      <Icon size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={clsx('text-sm font-medium', n.isRead ? 'text-gray-600' : 'text-gray-900')}>
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(n.createdAt).toLocaleString()}
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
