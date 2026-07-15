# ITERATION-NOTES.md

Additive iteration on the existing Escape Plan repo. Three goals: (1) full test
suite, (2) real env-gated integrations behind the existing stub interfaces,
(3) UX polish. Nothing below changes the deterministic, LLM-free engine or the
cold-start-without-keys guarantee.

## Step 0 — what already existed (map of the repo)

Monorepo, npm workspaces, all ESM. `postinstall` builds the engine so the web
app and server can resolve `@escape-plan/engine`.

- **`packages/engine`** — deterministic, pure-TS optimiser. No runtime deps.
  - `dateutil.ts` (UTC-safe date maths), `types.ts`, `calendar.ts` (day
    classification + candidate-break generation), `destinations.ts` (climate
    scoring + cost estimation), `scoring.ts` (weighted transparent score +
    explanations), `optimiser.ts` (`optimise()` — strategies → ranked plans),
    `fixtures.ts` (UK 2026 holidays, 9 destinations + climate, colleagues,
    defaults, `demoInput()`).
  - Tests: `test/engine.test.ts` (10 tests) run by `vitest run`.
- **`packages/server`** — Node + Express + PostgreSQL.
  - `db.ts` (pg pool + `isDbAvailable`), `migrate.ts`, `seed.ts`,
    `migrations/001_init.sql` (full relational schema), `index.ts` (REST API),
    `integrations.ts` — the **stub interface seam**: `WeatherProvider`,
    `FlightProvider`, `CurrencyProvider`, `HrProvider`, `CalendarProvider`, each
    with a deterministic `mock*` implementation.
  - The API serves seeded fixtures when Postgres is absent, so it runs keyless.
- **`apps/web`** — Vite + React + TS + Tailwind + shadcn/ui + Recharts +
  FullCalendar. Runs the engine **client-side** (`store/planner.tsx` calls
  `optimise` in a `useMemo`), so the app is fully explorable with no backend.
  Components: `Onboarding`, `Dashboard`, `CalendarView`, `PlansView`,
  `PreferencesPanel`, `AiPlanner`, plus `components/ui/*`. Libs:
  `calendarEvents.ts`, `metrics.ts`, `assistant.ts`, `useThemeColors.ts`.

### Existing commands
`npm run dev` (web), `npm run dev:server`, `npm run build`, `npm run typecheck`,
`npm test` (engine only), `npm run db:migrate`, `npm run db:seed`.

### Conventions matched
ESM + NodeNext (engine/server), Bundler resolution (web); `.js` import
specifiers in engine/server; Vitest for tests; providers behind interfaces with
a `mock*` default; env read via `process.env` (server) / `import.meta.env`
(web). New code follows all of these.

---

## Goal 1 — Test suite (see the "Coverage achieved" section at the bottom)

Layers, all wired so `npm test` runs the offline suite in one command:

- **Unit (engine)** — expanded `engine.test.ts` split into focused files under
  `packages/engine/test/`: scoring, bridging, budget caps, reserve, spread,
  conflicting priorities, mandatory/half-day, school-holiday avoidance, plus
  `dateutil`/`destinations` units.
- **Integration (server)** — `index.ts` refactored to export the Express `app`
  from `app.ts` (unchanged behaviour; `index.ts` just calls `listen`). Route
  tests use `supertest` against the fixtures path (keyless, offline). A
  migrate+seed integrity test runs only when `TEST_DATABASE_URL` is set (CI
  provides a Postgres service); it is **skipped offline** and reported as such.
- **Component (web)** — Vitest + jsdom + Testing Library render PlanCard,
  CalendarView legend/events, Dashboard readouts, and the Onboarding flow.
- **E2E (web)** — Playwright core-journey spec (onboard → allowance/prefs →
  ranked plans → explanation → select/"book"). Run via `npm run test:e2e`
  (kept out of the default `npm test` — see deviation note).

### Deviation (justified): E2E is a separate script, not part of `npm test`
The brief lists E2E under `npm test`, but the hard constraint "fresh clone, no
keys: install/build/boot offline" outranks it: Playwright needs a browser
download (`npx playwright install`) that a fresh offline clone will not have.
So `npm test` runs the fully-offline vitest suites (engine + server +
component), and `npm run test:e2e` runs the browser journey. **CI runs both.**
This keeps cold-start green while still shipping the E2E journey.

---

## Goal 2 — Real integrations (providers, env vars, defaults)

Each stub interface gains a real adapter selected by env, **defaulting to the
existing mock when the flag/key is absent**. External responses are validated
with `zod` before use (untrusted input); write-back requires explicit
confirmation enforced in code.

| Interface | Real provider | Contract | Env gate | Verified live? |
|-----------|---------------|----------|----------|----------------|
| Currency | **Frankfurter** (ECB) | `GET api.frankfurter.app/latest?base=&symbols=` | `CURRENCY_PROVIDER=frankfurter` | ✅ yes |
| Holidays *(new interface)* | **Nager.Date** | `GET date.nager.at/api/v3/PublicHolidays/{year}/{cc}` | `HOLIDAY_PROVIDER=nager` | ✅ yes |
| Weather | **Open-Meteo** archive | `GET archive-api.open-meteo.com/v1/archive` (ERA5) | `WEATHER_PROVIDER=open-meteo` | ✅ yes |
| Flights | **Amadeus** self-service | OAuth2 `+ /v2/shopping/flight-offers` | `AMADEUS_CLIENT_ID/SECRET` | ⚠️ code-complete, not verified (no key) |
| Maps | **Mapbox** Static Images | `api.mapbox.com/styles/v1/.../static/...` | `VITE_MAPBOX_TOKEN` | ⚠️ graceful placeholder without token |
| Calendar | **Google Calendar** free/busy + insert | documented; write-back gated | `GOOGLE_*` | ⚠️ mock default; write requires `confirm:true` |
| Auth | **local dev session** (Auth.js seam) | — | `AUTH_PROVIDER` | local session by default |

All three keyless providers (Frankfurter, Nager, Open-Meteo) are keyless free
tiers, verified against their live endpoints during development. The key-gated
adapters (Amadeus, Mapbox, Google) are implemented against their **documented**
contracts but could not be verified without accounts — recorded here honestly
rather than claimed as working.

### Env vars added (all optional; absent ⇒ mock/placeholder)
`CURRENCY_PROVIDER`, `HOLIDAY_PROVIDER`, `WEATHER_PROVIDER`,
`AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`, `AMADEUS_HOSTNAME`,
`GOOGLE_ACCESS_TOKEN` (calendar), `AUTH_PROVIDER`, and web `VITE_MAPBOX_TOKEN`.

### Security posture
- External JSON is parsed through zod schemas; unknown/invalid shapes fall back
  to the mock rather than propagating.
- No external string is ever `eval`'d, templated into SQL, or executed. Values
  used in the UI are plain data (numbers/dates/labels) and React-escaped.
- Calendar write-back (`POST /api/integrations/calendar/events`) refuses to act
  unless the request body has `confirm: true`, returning HTTP 428 otherwise.

---

## Refactors performed (isolated, justified)
- **`server/src/app.ts`** extracted from `index.ts` so tests can import the
  Express app without opening a port. `index.ts` now only creates the app and
  calls `listen`. No route/behaviour change. Required to make supertest
  integration tests possible.

## Coverage achieved

`npm test` runs 79 tests offline (+1 DB-gated skipped, +1 Playwright E2E):

- **Engine (Vitest v8):** 33 tests — **98.45% statements, 90.97% branch,
  98.07% functions**. `dateutil` and `fixtures` at 100%.
- **Server (Vitest v8):** 32 tests (1 DB-gated skipped offline). `providers/`
  **95.2% statements**, `app.ts` 80.9%, `integrations.ts` 82.7%, `auth.ts`
  100%. Overall server statements 64% — the remainder is `migrate.ts`/`seed.ts`,
  which are exercised only by the DB-gated test (runs in CI with a Postgres
  service, skipped offline).
- **Web (Vitest v8 + Testing Library):** 15 tests across calendar layers, plan
  cards + explanations, dashboard readouts, and the onboarding flow.
- **E2E:** 1 Playwright journey, verified passing in Chromium.

Meaningful assertions were prioritised over raw percentage: budget-cap-never-
exceeded, reserved-days-never-spent, deterministic conflicting-priority
resolution, untrusted-response rejection, and the calendar confirm-gate.

## What was verified vs. not (honesty)

- **Verified live during development:** Frankfurter (GBP→EUR 1.1752),
  Nager.Date (14 UK 2026 holidays), Open-Meteo (Barcelona July ≈ 25.6 °C) — the
  three keyless adapters returned real data. Full offline suite, typecheck,
  build, and the E2E journey all pass. Calendar layer toggling, dashboard
  savings/efficiency readouts, and dark mode verified in-browser with **no
  console errors** on cold load.
- **Not verified (no account/keys):** Amadeus flights and Google Calendar
  adapters — implemented against documented contracts and unit-tested with
  mocked HTTP, but not exercised against the live services.
- **Not verified locally (no Docker/Postgres in the sandbox):** the DB-gated
  migrate+seed integration test. It is written and gated on `TEST_DATABASE_URL`
  and runs in CI via the Postgres service; locally it is reported as skipped.
- **Accessibility:** onboarding field labels now associated with inputs; layer
  toggles are `aria-pressed` buttons reachable by keyboard with visible focus.
  No design tokens changed, so the previously-audited AA contrast is preserved.

## Goal 3 — UX polish delivered (no new product surfaces)
- **Onboarding:** added a "Skip setup — explore the seeded demo" fast path so a
  first-time user reaches ranked plans in seconds; associated labels for a11y.
- **Calendar:** legend is now interactive per-layer toggles (`aria-pressed`),
  with native hover tooltips on events.
- **Dashboard:** added sharpened **Leave efficiency** (with a normalised bar and
  plain-language verdict) and **Savings progress** (fund coverage now + by
  year-end) readouts.
