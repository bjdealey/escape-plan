import {
  DEFAULT_BUDGET,
  DEFAULT_LEAVE,
  DEFAULT_PREFERENCES,
  DEMO_COLLEAGUES,
  DEMO_DESTINATIONS,
  DEMO_TEAM,
  UK_HOLIDAYS_2026,
  demoInput,
  optimise,
} from '@escape-plan/engine';
import { closePool, getPool } from './db.js';

async function seed(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reset demo data (idempotent seed).
    await client.query('DELETE FROM users WHERE email = $1', ['demo@escape-plan.app']);
    await client.query('DELETE FROM holidays WHERE year = 2026');
    await client.query('DELETE FROM school_holidays WHERE year = 2026');
    await client.query('DELETE FROM climate');
    await client.query('DELETE FROM destinations');

    const {
      rows: [user],
    } = await client.query<{ id: number }>(
      `INSERT INTO users (name, email, country_code, weekend_days)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      ['Demo User', 'demo@escape-plan.app', 'GB', '{0,6}'],
    );
    const userId = user.id;

    await client.query(
      `INSERT INTO leave_config
        (user_id, allowance, remaining, carry_over, reserve_days, purchased_days, sold_days, allow_half_days, expiry_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        userId,
        DEFAULT_LEAVE.allowance,
        DEFAULT_LEAVE.remaining,
        DEFAULT_LEAVE.carryOver,
        DEFAULT_LEAVE.reserveDays,
        DEFAULT_LEAVE.purchasedDays,
        DEFAULT_LEAVE.soldDays,
        DEFAULT_LEAVE.allowHalfDays,
        '2027-03-31',
      ],
    );

    for (const s of DEFAULT_LEAVE.shutdowns) {
      await client.query(
        `INSERT INTO shutdowns (user_id, start_date, end_date, label) VALUES ($1,$2,$3,$4)`,
        [userId, s.start, s.end, s.label ?? null],
      );
    }

    for (const h of UK_HOLIDAYS_2026) {
      await client.query(
        `INSERT INTO holidays (country_code, region, date, name, type, year)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        ['GB', h.region ?? null, h.date, h.name, h.type, 2026],
      );
    }

    const input = demoInput();
    for (const b of input.blackouts) {
      await client.query(
        `INSERT INTO blackouts (user_id, start_date, end_date, label) VALUES ($1,$2,$3,$4)`,
        [userId, b.start, b.end, b.label ?? null],
      );
    }
    for (const s of input.schoolHolidays) {
      await client.query(
        `INSERT INTO school_holidays (country_code, start_date, end_date, label, year)
         VALUES ($1,$2,$3,$4,$5)`,
        ['GB', s.start, s.end, s.label ?? null, 2026],
      );
    }

    for (const c of DEMO_COLLEAGUES) {
      await client.query(
        `INSERT INTO colleague_leave (user_id, colleague_name, start_date, end_date, status)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, c.colleague, c.start, c.end, c.status],
      );
    }
    await client.query(
      `INSERT INTO team_settings (user_id, max_simultaneous, team_size) VALUES ($1,$2,$3)`,
      [userId, DEMO_TEAM.maxSimultaneous, DEMO_TEAM.teamSize],
    );

    for (const d of DEMO_DESTINATIONS) {
      await client.query(
        `INSERT INTO destinations
          (id, name, country, country_code, domestic, flight_hours, flight_cost, accommodation_per_night, daily_spend, trip_types)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          d.id,
          d.name,
          d.country,
          d.countryCode,
          d.domestic,
          d.flightHours,
          d.flightCost,
          d.accommodationPerNight,
          d.dailySpend,
          JSON.stringify(d.tripTypes),
        ],
      );
      for (const m of d.climate) {
        await client.query(
          `INSERT INTO climate
            (destination_id, month, avg_temp_c, rainfall_mm, sunshine_hours, beach_score, ski_score, hazard)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [d.id, m.month, m.avgTempC, m.rainfallMm, m.sunshineHours, m.beachScore, m.skiScore, m.hazard],
        );
      }
    }

    await client.query(`INSERT INTO preferences (user_id, data) VALUES ($1,$2)`, [
      userId,
      JSON.stringify(DEFAULT_PREFERENCES),
    ]);
    await client.query(
      `INSERT INTO budget (user_id, currency, holiday_fund, monthly_savings, max_trip_budget)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        userId,
        DEFAULT_BUDGET.currency,
        DEFAULT_BUDGET.holidayFund,
        DEFAULT_BUDGET.monthlySavings,
        DEFAULT_BUDGET.maxTripBudget,
      ],
    );
    for (const p of DEFAULT_PREFERENCES.personalDates) {
      await client.query(
        `INSERT INTO personal_dates (user_id, date, label, kind) VALUES ($1,$2,$3,$4)`,
        [userId, p.date, p.label, p.kind],
      );
    }

    // Persist the deterministic engine's ranked sample plans.
    const result = optimise(input);
    for (const plan of result.plans) {
      await client.query(
        `INSERT INTO plans (user_id, strategy, score, payload) VALUES ($1,$2,$3,$4)`,
        [userId, plan.strategy, plan.score, JSON.stringify(plan)],
      );
    }

    await client.query('COMMIT');
    console.log(
      `✓ seeded demo user (#${userId}) with ${UK_HOLIDAYS_2026.length} holidays, ` +
        `${DEMO_DESTINATIONS.length} destinations and ${result.plans.length} sample plans`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
