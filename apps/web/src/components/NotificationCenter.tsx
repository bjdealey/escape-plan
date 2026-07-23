import * as React from 'react';
import { Bell, Check, Settings2 } from 'lucide-react';
import type { LinkTarget } from '@escape-plan/engine';
import { Button } from '@/components/ui/button';
import { useGroups } from '@/store/groups';
import { useNotifications } from '@/store/notifications';

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function NotificationCenter({
  onNavigate,
  onOpenSettings,
}: {
  onNavigate: (t: LinkTarget) => void;
  /** Opens notification/alert preferences — the settings home for the bell. */
  onOpenSettings?: () => void;
}) {
  const { currentUser } = useGroups();
  const notifications = useNotifications();
  const [open, setOpen] = React.useState(false);
  const items = notifications.forUser(currentUser.id);
  const unread = notifications.unreadCount(currentUser.id);
  const showBadge = notifications.badgeCountEnabled && unread > 0;
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications, ${unread} unread`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Bell className="h-4 w-4" />
        {showBadge ? (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg animate-scale-in"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => notifications.markAllRead(currentUser.id)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <Check className="h-3 w-3" /> Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-96 overflow-y-auto py-1">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                You’re all caught up.
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      notifications.markRead(n.id);
                      onNavigate(n.link);
                      setOpen(false);
                    }}
                    className="flex w-full gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary"
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-primary'}`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{n.title}</span>
                      <span className="block text-xs text-muted-foreground">{n.body}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {onOpenSettings ? (
            <div className="border-t border-border px-1 py-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenSettings();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary"
              >
                <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                Notification settings
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
