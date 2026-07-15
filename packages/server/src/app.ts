import cors from 'cors';
import express, { type Express } from 'express';
import {
  DEMO_COLLEAGUES,
  DEMO_TEAM,
  demoInput,
  optimise,
  type EngineInput,
} from '@escape-plan/engine';
import { getPool, isDbAvailable } from './db.js';
import {
  getCalendarProvider,
  getCurrencyProvider,
  getFlightProvider,
  getHolidayProvider,
  getHrProvider,
  getWeatherProvider,
  providerStatus,
} from './providers/index.js';
import type { GroupRepository } from './access.js';
import { MemoryRepository } from './repository/memory.js';
import { PgRepository } from './repository/pg.js';
import { mountGroupRoutes } from './routes/groups.js';
import type { NotificationStore } from './notifications/store.js';
import { MemoryNotificationStore } from './notifications/memory.js';
import { PgNotificationStore } from './notifications/pg.js';
import { type Channels, channelStatus, resolveChannels } from './notifications/channels.js';
import type { NotifierDeps } from './notifications/notifier.js';
import { mountNotificationRoutes } from './routes/notifications.js';

/**
 * Resolve the group data store. Defaults to the seeded in-memory repository so
 * the multi-user features are explorable on a cold start with no Postgres. Set
 * `GROUPS_BACKEND=postgres` to persist to the database instead.
 */
function resolveRepository(): GroupRepository {
  return process.env.GROUPS_BACKEND === 'postgres'
    ? new PgRepository(getPool())
    : new MemoryRepository();
}

function resolveNotificationStore(): NotificationStore {
  return process.env.GROUPS_BACKEND === 'postgres'
    ? new PgNotificationStore(getPool())
    : new MemoryNotificationStore();
}

/**
 * Build the Express app. Extracted from `index.ts` so tests can import the app
 * without binding a port. Behaviour is unchanged from the original routes; the
 * integration endpoints resolve their provider via the env-gated factory, and
 * group routes enforce deny-by-default authorization in the service layer.
 */
export function createApp(
  opts: { repo?: GroupRepository; notificationStore?: NotificationStore; channels?: Channels } = {},
): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  const repo = opts.repo ?? resolveRepository();
  const notificationStore = opts.notificationStore ?? resolveNotificationStore();
  const channels = opts.channels ?? resolveChannels();
  const notifier: NotifierDeps = {
    groupRepo: repo,
    store: notificationStore,
    baseUrl: process.env.APP_BASE_URL ?? 'http://localhost:5173',
    now: () => new Date(),
  };
  // Exposed so the delivery worker (index.ts) and tests can reach them.
  app.locals.notificationStore = notificationStore;
  app.locals.channels = channels;

  app.get('/api/health', async (_req, res) => {
    res.json({
      ok: true,
      db: await isDbAvailable(),
      providers: providerStatus(),
      channels: channelStatus(),
    });
  });

  app.get('/api/bootstrap', async (_req, res) => {
    const dbUp = await isDbAvailable();
    const input = demoInput();
    let source = 'fixtures';
    if (dbUp) {
      try {
        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT id FROM users WHERE email = 'demo@escape-plan.app' LIMIT 1`,
        );
        if (rows.length > 0) source = 'database';
      } catch {
        source = 'fixtures';
      }
    }
    res.json({
      source,
      input,
      colleagues: DEMO_COLLEAGUES,
      team: DEMO_TEAM,
      aiPlannerEnabled: process.env.ENABLE_AI_PLANNER === 'true',
      providers: providerStatus(),
    });
  });

  app.post('/api/optimise', (req, res) => {
    try {
      const input: EngineInput =
        req.body && req.body.year ? (req.body as EngineInput) : demoInput();
      const result = optimise(input);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // -- Integration endpoints (env-gated real adapters, mock fallback) --------
  app.get('/api/integrations/weather', async (req, res) => {
    const dest = String(req.query.destination ?? '');
    const month = Number(req.query.month ?? 1);
    if (!dest || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'destination and month (1-12) required' });
    }
    return res.json(await getWeatherProvider().forecast(dest, month));
  });

  app.get('/api/integrations/currency', async (req, res) => {
    const { base = 'GBP', quote = 'EUR' } = req.query as Record<string, string>;
    if (!/^[A-Za-z]{3}$/.test(base) || !/^[A-Za-z]{3}$/.test(quote)) {
      return res.status(400).json({ error: 'base and quote must be 3-letter codes' });
    }
    return res.json({ rate: await getCurrencyProvider().rate(base.toUpperCase(), quote.toUpperCase()) });
  });

  app.get('/api/integrations/holidays', async (req, res) => {
    const year = Number(req.query.year ?? 2026);
    const country = String(req.query.country ?? 'GB');
    if (!Number.isInteger(year) || !/^[A-Za-z]{2}$/.test(country)) {
      return res.status(400).json({ error: 'year and 2-letter country required' });
    }
    return res.json(await getHolidayProvider().holidays(year, country.toUpperCase()));
  });

  app.get('/api/integrations/flights', async (req, res) => {
    const { from = 'LHR', to = 'BCN', date = '2026-06-01' } = req.query as Record<string, string>;
    if (!/^[A-Za-z]{3}$/.test(from) || !/^[A-Za-z]{3}$/.test(to)) {
      return res.status(400).json({ error: 'from and to must be 3-letter IATA codes' });
    }
    return res.json(await getFlightProvider().quote(from.toUpperCase(), to.toUpperCase(), date));
  });

  app.get('/api/integrations/approval', async (req, res) => {
    const { start = '2026-06-01', end = '2026-06-07' } = req.query as Record<string, string>;
    res.json({ likelihood: await getHrProvider().approvalLikelihood(1, start, end) });
  });

  app.get('/api/integrations/calendar', async (_req, res) => {
    res.json(await getCalendarProvider().busyRanges(1));
  });

  // Write-back: creating a calendar event ALWAYS requires explicit confirmation
  // AND passes API-layer validation before any provider is invoked.
  app.post('/api/integrations/calendar/events', async (req, res) => {
    const { confirm, event } = req.body ?? {};
    if (confirm !== true) {
      return res.status(428).json({
        error: 'Confirmation required',
        detail: 'Set { "confirm": true } to write this event to the calendar.',
      });
    }
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (
      !event ||
      typeof event.title !== 'string' ||
      !event.title.trim() ||
      !iso.test(event.start) ||
      !iso.test(event.end) ||
      event.start > event.end
    ) {
      return res.status(400).json({ error: 'Invalid event: title and start<=end (YYYY-MM-DD) required' });
    }
    const provider = getCalendarProvider();
    if (!provider.createEvent) {
      return res.status(501).json({ error: 'Calendar write-back not supported by this provider' });
    }
    try {
      const created = await provider.createEvent(1, {
        title: event.title.trim().slice(0, 200),
        start: event.start,
        end: event.end,
      });
      return res.status(201).json(created);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // -- Multi-user group routes (deny-by-default authorization) ---------------
  mountGroupRoutes(app, repo, notifier);

  // -- Notifications (in-app centre, preferences, push, public unsubscribe) --
  mountNotificationRoutes(app, notificationStore);

  return app;
}
