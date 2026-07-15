import 'dotenv/config';
import { createApp } from './app.js';
import { providerStatus } from './providers/index.js';
import { startOutboxWorker } from './notifications/delivery.js';
import type { Channels } from './notifications/channels.js';
import type { NotificationStore } from './notifications/store.js';

const PORT = Number(process.env.PORT ?? 4000);
const app = createApp();

// Deliver notifications asynchronously, outside the request path.
startOutboxWorker({
  store: app.locals.notificationStore as NotificationStore,
  channels: app.locals.channels as Channels,
  apiBaseUrl: process.env.API_BASE_URL ?? `http://localhost:${PORT}`,
  now: () => new Date(),
});

app.listen(PORT, () => {
  console.log(`Escape Plan API listening on http://localhost:${PORT}`);
  const live = Object.entries(providerStatus())
    .filter(([, v]) => v === 'live')
    .map(([k]) => k);
  console.log(
    live.length ? `Live providers: ${live.join(', ')}` : 'All providers using seeded mocks',
  );
});
