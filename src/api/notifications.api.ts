import client from './client';

export interface NotificationPreferences {
  inApp: boolean
  email: boolean
  whatsapp: boolean
  push: boolean
  allowLow: boolean
  allowMedium: boolean
  allowHigh: boolean
  allowCritical: boolean
  /** Minutes from local midnight [0..1439], or null when quiet hours are off. */
  quietHoursStart: number | null
  quietHoursEnd: number | null
  quietHoursTimezone: string
}

export const notificationsApi = {
  list: (limit = 30) =>
    client.get(`/notifications?limit=${limit}`),

  getUnreadCount: () =>
    client.get('/notifications/unread-count'),

  markRead: (id: string) =>
    client.patch(`/notifications/${id}/read`),

  markAllRead: () =>
    client.patch('/notifications/mark-all-read'),

  getPreferences: (): Promise<NotificationPreferences> =>
    client.get('/notifications/preferences').then(r => r.data),

  updatePreferences: (data: Partial<NotificationPreferences>): Promise<NotificationPreferences> =>
    client.put('/notifications/preferences', data).then(r => r.data),
};
