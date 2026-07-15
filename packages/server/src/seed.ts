import {
  DEFAULT_BUDGET,
  DEFAULT_LEAVE,
  DEFAULT_PREFERENCES,
  DEMO_COLLEAGUES,
  DEMO_DESTINATIONS,
  DEMO_GROUPS,
  DEMO_INVITES,
  DEMO_LEAVE_REQUESTS,
  DEMO_MEMBERSHIPS,
  DEMO_PLAN_SHARES,
  DEMO_PRIVACY,
  DEMO_TEAM,
  DEMO_USERS,
  UK_HOLIDAYS_2026,
  demoInput,
  optimise,
} from '@escape-plan/engine';
import { pathToFileURL } from 'node:url';
import type pg from 'pg';
import { closePool, getPool } from './db.js';

/** Seed the demo user, holidays, destinations, colleagues, and sample plans. */
export async function runSeed(
  pool: pg.Pool,
  log = console.log,
): Promise<{ userId: number; plans: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reset demo data (idempotent seed). Deleting groups + users cascades to
    // members/invites/requests/shares/privacy.
    const demoEmails = DEMO_USERS.map((u) => u.email);
    await client.query('DELETE FROM groups WHERE id = ANY($1)', [DEMO_GROUPS.map((g) => g.id)]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [demoEmails]);
    await client.query('DELETE FROM holidays WHERE year = 2026');
    await client.query('DELETE FROM school_holidays WHERE year = 2026');
    await client.query('DELETE FROM climate');
    await client.query('DELETE FROM destinations');

    // Seed all demo users with explicit ids so group memberships resolve.
    for (const u of DEMO_USERS) {
      await client.query(
        `INSERT INTO users (id, name, email, country_code, weekend_days)
         VALUES ($1,$2,$3,'GB','{0,6}')`,
        [u.id, u.name, u.email],
      );
    }
    // Keep the SERIAL sequence ahead of the explicit ids.
    await client.query(
      `SELECT setval(pg_get_serial_sequence('users','id'), (SELECT max(id) FROM users))`,
    );
    const userId = DEMO_USERS[0].id; // primary demo user owns the leave config etc.

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

    // -- Phase 3: multi-user groups, memberships, invites, requests, shares --
    for (const g of DEMO_GROUPS) {
      await client.query(`INSERT INTO groups (id, name, type) VALUES ($1,$2,$3)`, [
        g.id,
        g.name,
        g.type,
      ]);
    }
    for (const m of DEMO_MEMBERSHIPS) {
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3)`,
        [m.groupId, m.userId, m.role],
      );
    }
    for (const inv of DEMO_INVITES) {
      await client.query(
        `INSERT INTO group_invites (id, group_id, email, role, token, status, invited_by, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [inv.id, inv.groupId, inv.email, inv.role, inv.token, inv.status, inv.invitedBy, inv.createdAt, inv.expiresAt],
      );
    }
    for (const r of DEMO_LEAVE_REQUESTS) {
      await client.query(
        `INSERT INTO leave_requests (id, group_id, user_id, start_date, end_date, state, reason, decided_by, decided_at, history)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [r.id, r.groupId, r.userId, r.start, r.end, r.state, r.reason ?? null, r.decidedBy ?? null, r.decidedAt ?? null, JSON.stringify(r.history)],
      );
    }
    for (const s of DEMO_PLAN_SHARES) {
      await client.query(
        `INSERT INTO plan_shares (id, plan_id, owner_user_id, group_id, target_user_id, level)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [s.id, s.planId, s.ownerUserId, s.groupId ?? null, s.userId ?? null, s.level],
      );
    }
    for (const p of DEMO_PRIVACY) {
      await client.query(
        `INSERT INTO user_group_privacy (group_id, user_id, setting) VALUES ($1,$2,$3)`,
        [p.groupId, p.userId, p.setting],
      );
    }

    await client.query('COMMIT');
    log(
      `✓ seeded demo user (#${userId}) with ${UK_HOLIDAYS_2026.length} holidays, ` +
        `${DEMO_DESTINATIONS.length} destinations and ${result.plans.length} sample plans`,
    );
    return { userId, plans: result.plans.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// CLI entry point.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeed(getPool())
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
