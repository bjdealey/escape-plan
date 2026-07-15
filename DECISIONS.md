# DECISIONS.md

Every default, assumption, and conflict resolution made while building Escape
Plan. The guiding rule: keep the app **runnable, deterministic, and honest**.

## Architecture

- **Monorepo (npm workspaces), all ESM.** Three packages:
  - `packages/engine` — the deterministic optimisation engine (pure TypeScript,
    zero runtime dependencies, unit-tested with Vitest).
  - `packages/server` — Node + Express + PostgreSQL API, migrations, and seed.
  - `apps/web` — Vite + React + TypeScript + Tailwind + shadcn/ui + Recharts +
    FullCalendar frontend.
- **The engine runs client-side in the browser.** The web app imports
  `@escape-plan/engine` directly and optimises in-process. This is the single
  most important decision for the brief: it makes the app *fully explorable on
  first run with no backend, no database, no accounts, and no network calls*.
  The Node service exposes the **same** engine over HTTP for anyone who wants a
  server-side flow.
- **The engine is built to `dist/` on `postinstall`.** Both the web app (Vite)
  and the server resolve the engine via its package `exports`, so `npm install`
  alone leaves the workspace type-checkable and buildable.
- **Single source of truth for seed data.** UK 2026 bank holidays, destinations
  + climate, colleague availability, and defaults live in
  `packages/engine/src/fixtures.ts`. The web app, the server API, and the
  Postgres seed all import from there, so the demo is identical everywhere.

## Optimisation engine

- **Deterministic, LLM-free.** No randomness, no `Date.now()` in the scoring
  path, UTC-only date maths. Two identical inputs always yield byte-identical
  plans (there is a unit test for this).
- **Candidate generation** enumerates "bridges": for every bookable working day
  it books 1..N consecutive days and measures the resulting contiguous days off,
  plus standalone breaks at the preferred trip length. Default max bridge span =
  5 leave days.
- **Strategies → plans.** Six strategies (max time off, fewest leave days,
  frequent long weekends, one long holiday, spread across the year, and one
  tuned to your weights) each greedily select non-overlapping candidates. All
  plans are then scored with the *user's* weights and ranked. Identical plans are
  de-duplicated; the top `planCount` (default 5) are returned.
- **Trip-count caps (added for realism).** Without a cap, greedy strategies book
  every possible long weekend (20+ one-day trips) and blow the annual budget.
  Each strategy now caps its breaks (1 for "one long holiday", 4–6 for the
  others). Assumption recorded here because the brief did not specify a cap.
- **Two budget layers:**
  - *Per-trip cap* (`maxTripBudget`) — a **hard** constraint. A destination
    whose estimated cost exceeds it is never suggested (the break becomes a
    zero-cost staycation). Unit-tested: no plan ever exceeds it.
  - *Annual fund* (`holidayFund`) — a **soft** target enforced greedily: once
    cumulative spend would exceed the fund, remaining breaks are kept as
    staycations rather than pushing total spend over budget. Unit-tested.
  - **Conflict resolved:** the brief lists both a per-trip budget and an annual
    fund. Treating the per-trip figure as the hard cap and the annual fund as a
    fill-until-exhausted target keeps every plan affordable while still using
    leave. Recorded here.
- **Emergency reserve is absolute.** Bookable leave = `remaining - reserveDays`;
  the engine never books into the reserve. Unit-tested.
- **Scoring** is a transparent weighted average of eight criteria (each
  normalised to 0–1) scaled to 0–100. `scoreBreakdown` exposes the weight, score
  and contribution of every criterion so the UI can explain *why*.
- **Weather scoring** uses the seeded climate dataset (temperature vs the user's
  preferred minimum, sunshine, dryness, beach/ski suitability) and hard-penalises
  hazard (monsoon/hurricane) months. Ski intent flips the temperature reward to
  favour cold.

## Defaults chosen

| Area | Default | Why |
|------|---------|-----|
| Year | 2026 | Matches the seeded UK bank-holiday dataset. |
| Country / holidays | UK (England & Wales) 2026 | Concrete, verifiable dataset. |
| Weekend | Sat/Sun (`[0,6]`) | Configurable per user. |
| Allowance / remaining | 28 / 25 days | Typical UK statutory + a little used. |
| Emergency reserve | 3 days | Sensible non-zero default to demonstrate the feature. |
| Shutdown | 24–31 Dec | Common company shutdown. |
| Blackout | 23–30 Nov | Demonstrates the "leave forbidden" layer. |
| Currency | GBP | UK-centric demo; switchable to EUR/USD/CHF. |
| Holiday fund / per-trip cap | £4,000 / £2,500 | Realistic mid-range. |
| Plans returned | 5 | Comfortably satisfies "at least three ranked plans". |
| "Today" for countdowns | 2026-07-15 | Fixed reference date so the demo is deterministic. |
| AI planner | OFF | Feature-flagged; app is fully functional without it. |

## AI planner (optional)

- **Off by default and never required.** The assistant answers from the
  engine's structured output via deterministic pattern-matching
  (`apps/web/src/lib/assistant.ts`). "What if I buy 5 days?", "cheaper
  alternatives?", "optimise for warmer destinations" actually re-run the engine.
- When the flag is on, the contract is that an LLM would only *rephrase* these
  same facts. The real OpenAI call is left as a `// TODO: real integration`
  seam; no key is required and none is called.

## External integrations — all stubbed

Every third-party service sits behind a local interface returning seeded mock
data with a `// TODO: real integration` marker
(`packages/server/src/integrations.ts` and the web app's client fallbacks):

- Weather (Open-Meteo/OpenWeather), Flights (Skyscanner/Google Flights/Duffel),
  Currency (ECB/exchangerate.host), HR/approval (BambooHR/Workday/SAP),
  Calendars (Google/Microsoft 365/Apple), Maps (graceful placeholder).
- **Auth:** a local dev session (the seeded "Demo User") is assumed; Clerk/Auth.js
  is a documented seam, not wired, so the app runs with zero keys.

## Accessibility & design

- Class-based light/dark themes. **All primary text/surface token pairs meet
  WCAG AA** in both themes (verified numerically — see the README verification
  section; lowest ratio is 4.57:1).
- Keyboard navigable, visible `:focus-visible` rings everywhere (including the
  FullCalendar controls), semantic landmarks (`header`/`main`/`nav`/`footer`),
  a skip link, `aria-pressed` chips, and `aria-live` on the assistant log.
- Glassmorphism is used only for elevation/hierarchy, never behind body text, so
  contrast is preserved.
- Desktop-first layout; grids collapse to single-column and the calendar scrolls
  horizontally on mobile.

## Conflicts / trade-offs resolved

1. **"App must build & run" vs. "requires PostgreSQL".** Resolved by running the
   engine client-side with bundled seed data; Postgres is optional and only
   needed for the server-persistence path. The app is fully usable without it.
2. **Per-trip budget vs. annual fund** — see the budget section above.
3. **Greedy optimisation vs. realistic plans** — trip-count caps + annual-fund
   staycation fallback, documented above.
4. **shadcn/ui CLI needs network/interactivity.** Resolved by hand-authoring the
   component files (Radix + cva + tailwind-merge) exactly as the CLI would
   generate them, so `npm install` is fully offline.

## Known limitations (stubbed, not dropped)

- Half-days are modelled in the config/schema but the engine books whole days.
- Colleague availability and approval-likelihood are shown as a calendar layer /
  assistant answer but do not yet constrain the optimiser (the interface exists).
- Passport expiry, max flight time, and airport preferences are captured in the
  types/schema but not yet used as engine constraints.
- The server persists sample plans but the web app does not read them back (it
  recomputes client-side); the endpoint exists for a future server-first flow.
