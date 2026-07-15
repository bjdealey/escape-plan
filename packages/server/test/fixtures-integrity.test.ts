import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEMO_COLLEAGUES,
  DEMO_DESTINATIONS,
  UK_HOLIDAYS_2026,
  demoInput,
} from '@escape-plan/engine';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const __dirname = dirname(fileURLToPath(import.meta.url));

describe('seed / fixtures integrity', () => {
  it('every destination has 12 months of climate with valid ranges', () => {
    for (const d of DEMO_DESTINATIONS) {
      expect(d.climate).toHaveLength(12);
      const months = d.climate.map((c) => c.month).sort((a, b) => a - b);
      expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      for (const c of d.climate) {
        expect(c.beachScore).toBeGreaterThanOrEqual(0);
        expect(c.beachScore).toBeLessThanOrEqual(1);
        expect(c.skiScore).toBeGreaterThanOrEqual(0);
        expect(c.skiScore).toBeLessThanOrEqual(1);
      }
    }
  });

  it('holidays are valid, ordered ISO dates', () => {
    for (const h of UK_HOLIDAYS_2026) {
      expect(h.date).toMatch(ISO);
      expect(h.name.length).toBeGreaterThan(0);
    }
  });

  it('colleague leave ranges are well-formed', () => {
    for (const c of DEMO_COLLEAGUES) {
      expect(c.start).toMatch(ISO);
      expect(c.end).toMatch(ISO);
      expect(c.start <= c.end).toBe(true);
      expect(['approved', 'pending', 'rejected']).toContain(c.status);
    }
  });

  it('demoInput is internally consistent', () => {
    const input = demoInput();
    expect(input.leave.reserveDays).toBeLessThanOrEqual(input.leave.remaining);
    expect(input.budget.maxTripBudget).toBeGreaterThan(0);
    expect(input.destinations.length).toBe(DEMO_DESTINATIONS.length);
  });

  it('the migration references every table the seed writes to', () => {
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', '001_init.sql'),
      'utf8',
    );
    const seed = readFileSync(join(__dirname, '..', 'src', 'seed.ts'), 'utf8');
    const insertedTables = [...seed.matchAll(/INSERT INTO (\w+)/g)].map((m) => m[1]);
    for (const table of new Set(insertedTables)) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });
});
