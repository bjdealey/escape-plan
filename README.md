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
| `npm test` | Run the engine's Vitest unit tests. |
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

# 2. Create schema and seed
npm run db:migrate
npm run db:seed

# 3. Start the API
npm run dev:server        # http://localhost:4000
```

### Environment variables

| Var | Default | Used by |
|-----|---------|---------|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/escape_plan` | server |
| `PORT` | `4000` | server |
| `ENABLE_AI_PLANNER` | `false` | server (`/api/bootstrap` flag) |
| `VITE_API_URL` | `http://localhost:4000` | web dev proxy |

The API serves the **seeded fixtures when no database is reachable**, so
`npm run dev:server` works even without Postgres. Key endpoints:
`GET /api/health`, `GET /api/bootstrap`, `POST /api/optimise`, and
`GET /api/integrations/{weather,flights,currency,approval,calendar}` (all mock).

### Future integrations (scaffolded, not live)

Weather, flights, currency, HR (BambooHR/Workday/SAP), calendars
(Google/Microsoft 365/Apple), Teams, maps, and auth (Clerk/Auth.js) all sit
behind local interfaces returning seeded mock data, each marked
`// TODO: real integration`. Nothing calls the network.

---

## Verification

Reproduce the checks locally:

```bash
npm install          # ✅ succeeds; builds the engine
npm run typecheck    # ✅ zero TypeScript errors across all packages
npm test             # ✅ 9 engine tests pass
npm run build        # ✅ engine + web + server build
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
