import * as React from 'react';
import { BellRing } from 'lucide-react';
import {
  type Channel,
  type NotificationPreference,
  type NotificationType,
  NOTIFICATION_CATALOG,
  NOTIFICATION_TYPES,
} from '@escape-plan/engine';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGroups } from '@/store/groups';
import { useNotifications } from '@/store/notifications';
import { track } from '@/lib/analytics';

const CHANNELS: Channel[] = ['inapp', 'email', 'push'];
const CHANNEL_LABEL: Record<Channel, string> = { inapp: 'In-app', email: 'Email', push: 'Push' };

export function NotificationPreferences() {
  const { currentUser } = useGroups();
  const notifications = useNotifications();
  const pref = notifications.prefFor(currentUser.id);

  const update = (mutate: (p: NotificationPreference) => void) => {
    const next: NotificationPreference = JSON.parse(JSON.stringify(pref));
    next.userId = currentUser.id;
    mutate(next);
    notifications.setPref(next);
  };

  const toggleChannel = (type: NotificationType, channel: Channel, value: boolean) => {
    update((p) => {
      p.overrides[type] = { ...p.overrides[type], [channel]: value };
    });
    // Only opt-ins are of funnel interest; opt-outs are respected silently.
    if (value) track('notification_channel_enabled', { type, channel });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card glass>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Notification preferences</CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose how you hear about each event. In-app is always available; email and push are optional.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span>Mute all</span>
            <Switch
              checked={pref.muted}
              onCheckedChange={(v) => update((p) => (p.muted = v))}
              aria-label="Mute all notifications"
            />
          </label>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Event</span>
            {CHANNELS.map((c) => (
              <span key={c} className="text-center text-xs font-semibold uppercase text-muted-foreground">
                {CHANNEL_LABEL[c]}
              </span>
            ))}
            {NOTIFICATION_TYPES.map((type) => (
              <React.Fragment key={type}>
                <span className="truncate">{NOTIFICATION_CATALOG[type].label}</span>
                {CHANNELS.map((channel) => (
                  <span key={channel} className="flex justify-center">
                    <Switch
                      checked={notifications.isEnabled(currentUser.id, type, channel)}
                      onCheckedChange={(v) => toggleChannel(type, channel, v)}
                      disabled={pref.muted}
                      aria-label={`${NOTIFICATION_CATALOG[type].label} — ${CHANNEL_LABEL[channel]}`}
                    />
                  </span>
                ))}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card glass>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quiet hours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Email &amp; push are held during these hours (in-app still arrives).
            </p>
            <div className="flex items-end gap-3">
              <div>
                <Label htmlFor="q-start" className="mb-1 block text-xs">From (hour)</Label>
                <Input
                  id="q-start"
                  type="number"
                  min={0}
                  max={23}
                  value={pref.quietHoursStart !== undefined ? Math.floor(pref.quietHoursStart / 60) : ''}
                  onChange={(e) =>
                    update((p) => (p.quietHoursStart = e.target.value === '' ? undefined : Number(e.target.value) * 60))
                  }
                  className="w-24"
                />
              </div>
              <div>
                <Label htmlFor="q-end" className="mb-1 block text-xs">To (hour)</Label>
                <Input
                  id="q-end"
                  type="number"
                  min={0}
                  max={23}
                  value={pref.quietHoursEnd !== undefined ? Math.floor(pref.quietHoursEnd / 60) : ''}
                  onChange={(e) =>
                    update((p) => (p.quietHoursEnd = e.target.value === '' ? undefined : Number(e.target.value) * 60))
                  }
                  className="w-24"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Browser push</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Opt in to browser push. We never prompt on first load — only when you ask.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                track('notification_channel_enabled', { channel: 'push' });
                notifications.requestPush();
              }}
              disabled={notifications.pushPermission === 'granted' || notifications.pushPermission === 'unsupported'}
              className="gap-2"
            >
              <BellRing className="h-4 w-4" />
              {notifications.pushPermission === 'granted'
                ? 'Push enabled'
                : notifications.pushPermission === 'unsupported'
                  ? 'Not supported'
                  : notifications.pushPermission === 'denied'
                    ? 'Blocked in browser'
                    : 'Enable browser push'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
