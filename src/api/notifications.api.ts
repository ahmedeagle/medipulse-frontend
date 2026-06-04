import client from './client';

export const notificationsApi = {
  list: (limit = 30) =>
    client.get(`/notifications?limit=${limit}`),

  getUnreadCount: () =>
    client.get('/notifications/unread-count'),

  markRead: (id: string) =>
    client.patch(`/notifications/${id}/read`),

  markAllRead: () =>
    client.patch('/notifications/mark-all-read'),
};
