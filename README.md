# Escape Plan 🧭

**An intelligent annual-leave planner that generates optimised holiday plans —
not just a calendar.** Give it your leave allowance and priorities and it
produces multiple ranked plans that maximise consecutive days off, minimise
leave spent, bridge bank holidays, respect your budget and emergency reserve,
suggest weather-appropriate destinations, and explain every trade-off in plain
language.

The optimisation engine is **deterministic, pure TypeScript, unit-tested, and
completely independent of any LLM**.

![stack](https://img.shields.io/badge/React-TS-blue) ![engine](https://img.shields.io/badge/engine-deterministic-success) ![tests](https://img.shields.io/badge/engine%20tests-9%20passing-success)

---

## Quick start (under 2 minutes)

```bash
npm install        # installs all workspaces and builds the engine
npm run dev        # starts the web app at http://localhost:5173
```

That's it. **No database, no accounts, no API keys, no network calls.** The
engine runs in your browser against bundled seed data. Open the app, click
through the four-step onboarding, and you'll have ranked plans, a full yearly
calendar, and a dashboard.

### Requirements

- Node.js **≥ 20** (developed on Node 26)
- npm **≥ 10**
- PostgreSQL is **optional** — only needed for the backend persistence path.

---

## Every command

| Command | What it does |
|---------|--------------|
| `npm install` | Install all workspaces; builds the engine via `postinstall`. |
| `npm run dev` | Start the Vite web app (http://localhost:5173). |
| `npm run build` | Type-check + build engine, web, and server. |
| `npm run typecheck` | Type-check all three packages (zero errors). |
| `npm test` | Run the full offline suite: engine unit + server integration + web component. |
| `npm run test:coverage` | The suite with coverage reports. |
| `npm run test:e2e` | Playwright core-journey E2E (run `npx playwright install chromium` once). |
| `npm run dev:server` | Start the Express API (http://localhost:4000). |
| `npm run db:migrate` | Apply Postgres migrations (needs `DATABASE_URL`). |
| `npm run db:seed` | Seed Postgres with the demo data + sample plans. |

---

## What you can do in the app

- **Onboarding** — four quick steps (leave → preferences → budget → priorities).
- **Dashboard** — remaining leave, days off, leave-efficiency ratio, longest
  break, budget remaining, holiday countdown, warmest trip, and Recharts charts
  for leave allocation, month-by-month affordability, and days off per month.
- **Calendar** — an interactive **FullCalendar** yearly view layering annual
  leave, bank holidays, weekends, colleague leave, company blackouts, shutdown,
  school holidays, personal dates, and per-trip weather + budget indicators.
- **Plans** — multiple plans ranked by a transparent 0–100 score, each with a
  plain-language explanation, a per-criterion score breakdown, trade-offs, and
  the trips it books. Select one to drive the calendar and dashboard.
- **Assistant** — a natural-language Q&A answered *by the engine* ("What if I
  buy five extra leave days?", "cheaper alternatives?", "optimise for warmer
  destinations"). The LLM flag is **off by default**; the app is fully
  functional without it.
- **Preferences** — weighted priority sliders that re-rank plans instantly, plus
  leave, budget, seasons, trip types, and "avoid school holidays".

---

## Project structure

```
escape-plan/
├─ packages/
│  ├─ engine/            # deterministic optimiser (pure TS, Vitest)
│  │  ├─ src/            # dateutil, calendar, destinations, scoring, optimiser
│  │  ├─ src/fixtures.ts # seed: UK 2026 holidays, destinations+climate, defaults
│  │  └─ test/           # unit tests (bridging, budget, reserve, determinism…)
│  └─ server/            # Node + Express + PostgreSQL
│     ├─ migrations/     # 001_init.sql — full relational schema
│     ├─ src/migrate.ts  # migration runner
│     ├─ src/seed.ts     # seeds config, holidays, climate, colleagues, plans
│     ├─ src/integrations.ts  # weather/flights/currency/HR/calendar STUBS
│     └─ src/index.ts    # REST API (also runs the engine server-side)
└─ apps/
   └─ web/               # Vite + React + Tailwind + shadcn/ui + Recharts + FullCalendar
```

---

## The optimisation engine

`packages/engine` is an isolated, documented module with typed inputs/outputs.

```ts
import { optimise, demoInput } from '@escape-plan/engine';

const result = optimise(demoInput());
result.plans.forEach((p) => {
  console.log(p.score, p.strategyLabel, p.explanation);
});
```

- **Input** (`EngineInput`): year, leave config, holidays, blackouts, school
  holidays, weekend days, weighted preferences, budget, and destinations.
- **Output** (`EngineResult`): ranked `Plan[]`, each with breaks, totals,
  efficiency, `score` (0–100), a transparent `scoreBreakdown`, an `explanation`,
  and `tradeoffs`.
- **Scoring** = weighted average of eight normalised criteria (consecutive days
  off, leave conservation, warmth, budget fit, spread, preference match, long
  weekends). Fully documented in `src/scoring.ts`.

See **DECISIONS.md** for the scoring model, budget layering, and trip-count caps.

---

## Backend (optional)

The web app does **not** require the backend. To run the full server path:

```bash
# 1. Point at a Postgres instance
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/escape_plan"

# 2. Create schema and seed (db:rollback reverts the last migration)
npm run db:migrate
npm run db:seed

# 3. Start the API (persist groups to Postgres instead of the seeded memory store)
GROUPS_BACKEND=postgres npm run dev:server   # http://localhost:4000
```

### Multi-user & sharing

Groups (households + teams), invites, an approval workflow, and shared plans are
enforced **deny-by-default in the data/service layer** using a single shared
permission matrix (`packages/engine/src/groups.ts`) — the same rules run in the
server service (over Postgres or an in-memory store) and the web store. A user
can never read or mutate another group's data without a checked membership.

- The web app is fully explorable on a **cold start with no backend**: the
  multi-user demo (a household + a team with varied roles and leave states) runs
  against the seeded in-memory store. A dev-only "Viewing as" switcher (header)
  acts as different seeded users — it maps to an `x-user-id` request header that
  is **ignored under a real auth provider or in production**.
- Existing single-user data migrates safely: migration `002` back-fills every
  user into an owned **group-of-one**, and is reversible (`npm run db:rollback`).
- Real IdP login (Clerk/Auth.js) remains a documented seam; the dev switcher
  stands in for it.

### Notifications

Multi-user events (invites, approval requests/decisions, shared plans, reminders)
produce notifications across three channels — **in-app** (always on), **email**,
and **web push** — and are **additive, asynchronous, and authorization-scoped**:

- Sending never blocks or rolls back the triggering action. An **outbox** row is
  persisted with the action; delivery runs in a background worker with
  exponential-backoff retries and a **dead-letter** state after 5 attempts.
  Everything is **idempotent** (dedup by type+subject+recipient) so retries and
  repeated triggers never duplicate.
- Recipients reuse the group/role checks — a non-member or wrong-role user is
  never a recipient, and content is redacted to what they can already see.
- **Preferences** (Alerts tab): per-event × per-channel toggles, quiet hours,
  global mute. Email carries a `List-Unsubscribe` header and a **no-login
  unsubscribe** link that is honoured immediately. Web push is **opt-in** and
  never prompts on first load.
- Cold start with no keys: email/push degrade to a logged mock; in-app still
  works. User text is HTML-escaped and CR/LF-stripped (no header/markup
  injection).

### Environment variables

| Var | Default | Used by |
|-----|---------|---------|
| `DATABASE_URL` | `postgres://…/escape_plan` | server (persistence) |
| `PORT` | `4000` | server |
| `ENABLE_AI_PLANNER` | `false` | server (`/api/bootstrap` flag) |
| `VITE_API_URL` | `http://localhost:4000` | web dev proxy |
| `VITE_MAPBOX_TOKEN` | _(unset)_ | web maps (placeholder without it) |

**Integration flags (all optional; absent ⇒ seeded mock).** See
`packages/server/.env.example` for the full list.

| Var | Provider (real) | Verified |
|-----|-----------------|----------|
| `CURRENCY_PROVIDER=frankfurter` | Frankfurter / ECB (keyless) | ✅ live |
| `HOLIDAY_PROVIDER=nager` | Nager.Date (keyless) | ✅ live |
| `WEATHER_PROVIDER=open-meteo` | Open-Meteo ERA5 (keyless) | ✅ live |
| `AMADEUS_CLIENT_ID` / `_SECRET` | Amadeus flight offers | contract only |
| `GOOGLE_ACCESS_TOKEN` | Google Calendar (write needs `confirm`) | contract only |
| `AUTH_PROVIDER` | Auth.js/Clerk seam (dev session default) | n/a |
| `RESEND_API_KEY` / `NOTIFY_EMAIL_FROM` | Resend transactional email | contract only |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push (VAPID) | seam only |

The API serves the **seeded fixtures when no database is reachable** and every
integration **defaults to its seeded mock**, so `npm run dev:server` works with
zero configuration. Key endpoints: `GET /api/health` (shows live/mock per
provider), `GET /api/bootstrap`, `POST /api/optimise`,
`GET /api/integrations/{weather,flights,currency,holidays,approval,calendar}`,
and `POST /api/integrations/calendar/events` (requires `{ "confirm": true }`).

### Integration design

Each provider sits behind the interface in `packages/server/src/integrations.ts`
with a real adapter in `packages/server/src/providers/`, selected by env via a
factory (`providers/index.ts`). External responses are validated with `zod`
before use (untrusted input); nothing external is executed, and calendar
write-back is gated on explicit confirmation. See `ITERATION-NOTES.md`.

---

## Verification

Reproduce the checks locally:

```bash
npm install          # ✅ succeeds; builds the engine
npm run typecheck    # ✅ zero TypeScript errors across all packages
npm test             # ✅ 154 tests pass (engine 66 · server 56 +4 db-gated · web 32)
npm run build        # ✅ engine + web + server build
npm run test:e2e     # ✅ Playwright: solo + multi-user journeys (needs `npx playwright install chromium`)
npm run dev          # ✅ dev server starts on :5173
```

The engine tests include the three required scenarios:

1. **Bank-holiday bridging** produces a longer break for fewer leave days than a
   naive booking (efficiency > 1×, days off > leave used).
2. A **budget-capped run** never returns a plan whose trip exceeds the cap (and a
   separate test asserts total spend never exceeds the annual fund).
3. A **"leave N days for emergencies"** run never spends the reserved days.

Plus determinism, blackout-respect, and trip-count-cap tests.

**Accessibility:** all primary text/surface token pairs meet **WCAG AA** in both
light and dark mode (verified numerically; lowest ratio 4.57:1). Keyboard
navigable with visible focus states and semantic landmarks.

### What was verified visually vs. programmatically

- Programmatic (this repo): install, type-check, build, engine tests, and WCAG
  contrast ratios (computed from the design tokens).
- Visual (in a browser during development): onboarding, dashboard + charts,
  yearly calendar with all layers, ranked plans with explanations, and dark
  mode — all render with **no console errors or warnings**.

---

## License

MIT — sample/demo project.
