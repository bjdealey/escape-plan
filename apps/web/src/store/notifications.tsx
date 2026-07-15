import * as React from 'react';
import {
  type Channel,
  type LinkTarget,
  type NotificationPreference,
  type NotificationType,
  type RenderContext,
  dedupKey,
  emptyPreference,
  isChannelEnabled,
  renderNotification,
} from '@escape-plan/engine';

export interface NotificationItem {
  id: string;
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  link: LinkTarget;
  createdAt: string;
  readAt?: string;
  dedupKey: string;
}

export interface EmitItem {
  recipientUserId: number;
  type: NotificationType;
  subjectId: string;
  ctx: RenderContext;
}

export interface NotificationsContextValue {
  forUser: (userId: number) => NotificationItem[];
  unreadCount: (userId: number) => number;
  markRead: (id: string) => void;
  markAllRead: (userId: number) => void;
  emit: (items: EmitItem[]) => void;
  prefFor: (userId: number) => NotificationPreference;
  setPref: (pref: NotificationPreference) => void;
  isEnabled: (userId: number, type: NotificationType, channel: Channel) => boolean;
  pushPermission: 'default' | 'granted' | 'denied' | 'unsupported';
  requestPush: () => Promise<void>;
}

const NotificationsContext = React.createContext<NotificationsContextValue | null>(null);

// A couple of seeded items so the centre is populated on first load.
function seedFeed(): NotificationItem[] {
  const now = new Date().toISOString();
  const mk = (id: string, userId: number, type: NotificationType, ctx: RenderContext): NotificationItem => {
    const c = renderNotification(type, ctx);
    return { id, userId, type, title: c.title, body: c.body, link: c.link, createdAt: now, dedupKey: `seed:${id}` };
  };
  return [
    mk('seed-1', 1, 'leave.approved', { groupName: 'Product Team', start: '2026-06-15', end: '2026-06-19' }),
    mk('seed-2', 3, 'leave.requested', { actorName: 'Demo User', groupName: 'Product Team', start: '2026-06-15', end: '2026-06-19' }),
    mk('seed-3', 2, 'plan.shared', { actorName: 'Demo User', planTitle: 'plan-1' }),
  ];
}

let counter = 0;
const nextId = () => `ntf-${Date.now()}-${counter++}`;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<NotificationItem[]>(seedFeed);
  const [prefs, setPrefs] = React.useState<Map<number, NotificationPreference>>(new Map());
  const [pushPermission, setPushPermission] = React.useState<NotificationsContextValue['pushPermission']>(
    typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as 'default' | 'granted' | 'denied'),
  );

  const value = React.useMemo<NotificationsContextValue>(() => {
    const prefFor = (userId: number) => prefs.get(userId) ?? emptyPreference(userId);
    return {
      forUser: (userId) =>
        items.filter((n) => n.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      unreadCount: (userId) => items.filter((n) => n.userId === userId && !n.readAt).length,
      markRead: (id) =>
        setItems((prev) => prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n))),
      markAllRead: (userId) =>
        setItems((prev) =>
          prev.map((n) => (n.userId === userId && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
        ),
      emit: (toEmit) =>
        setItems((prev) => {
          const next = [...prev];
          for (const e of toEmit) {
            const pref = prefs.get(e.recipientUserId);
            if (!isChannelEnabled(pref, e.type, 'inapp')) continue; // respects opt-out
            const key = dedupKey(e.type, e.subjectId, e.recipientUserId);
            if (next.some((n) => n.dedupKey === key)) continue; // idempotent
            const c = renderNotification(e.type, e.ctx);
            next.push({
              id: nextId(),
              userId: e.recipientUserId,
              type: e.type,
              title: c.title,
              body: c.body,
              link: c.link,
              createdAt: new Date().toISOString(),
              dedupKey: key,
            });
          }
          return next;
        }),
      prefFor,
      setPref: (pref) => setPrefs((prev) => new Map(prev).set(pref.userId, pref)),
      isEnabled: (userId, type, channel) => isChannelEnabled(prefs.get(userId), type, channel),
      pushPermission,
      requestPush: async () => {
        if (typeof Notification === 'undefined') return;
        const result = await Notification.requestPermission();
        setPushPermission(result as 'default' | 'granted' | 'denied');
      },
    };
  }, [items, prefs, pushPermission]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = React.useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
