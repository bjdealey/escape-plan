import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import {
  DEMO_COLLEAGUES,
  DEMO_TEAM,
  demoInput,
  optimise,
  type EngineInput,
} from '@escape-plan/engine';
import { getPool, isDbAvailable } from './db.js';
import {
  mockCalendar,
  mockCurrency,
  mockFlights,
  mockHr,
  mockWeather,
} from './integrations.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT ?? 4000);

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, db: await isDbAvailable() });
});

/**
 * Bootstrap payload: the full EngineInput plus mock integration data. Reads
 * from Postgres when available, otherwise returns the seeded fixtures so the
 * API works with zero external dependencies.
 */
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
  });
});

/** Run the deterministic engine on a supplied (or default) input. */
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

// -- Mock integration endpoints (seeded, no live calls) ---------------------
app.get('/api/integrations/weather', async (req, res) => {
  const dest = String(req.query.destination ?? '');
  const month = Number(req.query.month ?? 1);
  res.json(await mockWeather.forecast(dest, month));
});
app.get('/api/integrations/flights', async (req, res) => {
  const { from = 'LHR', to = 'BCN', date = '2026-06-01' } = req.query as Record<string, string>;
  res.json(await mockFlights.quote(from, to, date));
});
app.get('/api/integrations/currency', async (req, res) => {
  const { base = 'GBP', quote = 'EUR' } = req.query as Record<string, string>;
  res.json({ rate: await mockCurrency.rate(base, quote) });
});
app.get('/api/integrations/approval', async (req, res) => {
  const { start = '2026-06-01', end = '2026-06-07' } = req.query as Record<string, string>;
  res.json({ likelihood: await mockHr.approvalLikelihood(1, start, end) });
});
app.get('/api/integrations/calendar', async (_req, res) => {
  res.json(await mockCalendar.busyRanges(1));
});

app.listen(PORT, () => {
  console.log(`Escape Plan API listening on http://localhost:${PORT}`);
});
