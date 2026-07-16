import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

afterEach(() => {
  // Ensure no env flag leaks between tests (keep providers on mock defaults).
  delete process.env.CURRENCY_PROVIDER;
  delete process.env.WEATHER_PROVIDER;
  delete process.env.HOLIDAY_PROVIDER;
});

describe('GET /api/health', () => {
  it('reports ok and provider status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.providers).toMatchObject({ currency: 'mock', weather: 'mock' });
  });
});

describe('GET /api/bootstrap', () => {
  it('returns a full engine input from fixtures without a database', async () => {
    const res = await request(app).get('/api/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('fixtures');
    expect(res.body.input.year).toBe(2026);
    expect(res.body.input.destinations.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.colleagues)).toBe(true);
  });
});

describe('POST /api/optimise', () => {
  it('optimises the default input when body is empty', async () => {
    const res = await request(app).post('/api/optimise').send({});
    expect(res.status).toBe(200);
    expect(res.body.plans.length).toBeGreaterThanOrEqual(3);
    expect(res.body.plans[0]).toHaveProperty('explanation');
  });

  it('honours a supplied reserve so no plan spends reserved days', async () => {
    const base = (await request(app).get('/api/bootstrap')).body.input;
    const input = { ...base, leave: { ...base.leave, remaining: 10, reserveDays: 4 } };
    const res = await request(app).post('/api/optimise').send(input);
    expect(res.status).toBe(200);
    expect(res.body.bookableLeave).toBe(6);
    for (const plan of res.body.plans) {
      expect(plan.totalLeaveUsed).toBeLessThanOrEqual(6);
    }
  });
});

describe('integration endpoints (mock defaults)', () => {
  it('returns seeded weather for a destination + month', async () => {
    const res = await request(app).get('/api/integrations/weather?destination=barcelona&month=7');
    expect(res.status).toBe(200);
    expect(typeof res.body.avgTempC).toBe('number');
  });

  it('validates the month range', async () => {
    const res = await request(app).get('/api/integrations/weather?destination=barcelona&month=13');
    expect(res.status).toBe(400);
  });

  it('returns a currency rate and validates codes', async () => {
    const ok = await request(app).get('/api/integrations/currency?base=GBP&quote=EUR');
    expect(ok.status).toBe(200);
    expect(typeof ok.body.rate).toBe('number');
    const bad = await request(app).get('/api/integrations/currency?base=POUND&quote=EUR');
    expect(bad.status).toBe(400);
  });

  it('returns holidays from the mock provider', async () => {
    const res = await request(app).get('/api/integrations/holidays?year=2026&country=GB');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('date');
    expect(res.body[0]).toHaveProperty('name');
  });

  it('validates flight IATA codes', async () => {
    const bad = await request(app).get('/api/integrations/flights?from=LONDON&to=BCN');
    expect(bad.status).toBe(400);
  });

  it('returns a location guess (mock GB by default)', async () => {
    const res = await request(app).get('/api/integrations/location');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ countryCode: 'GB', currency: 'GBP' });
  });
});

describe('calendar write-back requires explicit confirmation', () => {
  const event = { title: 'Annual leave', start: '2026-08-03', end: '2026-08-07' };

  it('refuses without confirm:true (HTTP 428)', async () => {
    const res = await request(app).post('/api/integrations/calendar/events').send({ event });
    expect(res.status).toBe(428);
  });

  it('creates the event when confirm:true', async () => {
    const res = await request(app)
      .post('/api/integrations/calendar/events')
      .send({ confirm: true, event });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('confirmed');
  });

  it('rejects an invalid event even when confirmed', async () => {
    const res = await request(app)
      .post('/api/integrations/calendar/events')
      .send({ confirm: true, event: { title: '', start: 'nope', end: 'nope' } });
    expect(res.status).toBe(400);
  });
});
