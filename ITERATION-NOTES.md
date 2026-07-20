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

---

# Phase 3 — Multi-user & sharing

## Step 0 — current single-user data model (before this phase)

- **Auth:** `packages/server/src/providers/auth.ts` exposes `getSession()` — a
  static local dev session (`userId: 1`, `demo@escape-plan.app`). No real
  Clerk/Auth.js is wired; the seam is documented as a stub.
- **Server data model** (`migrations/001_init.sql`): everything is keyed by a
  single `users.id`. Per-user tables: `leave_config`, `shutdowns`,
  `mandatory_dates`, `blackouts`, `preferences`, `budget`, `personal_dates`,
  `plans`. Team/colleague data was flat and user-owned: `colleague_leave`
  (name + range + status string) and `team_settings` (max_simultaneous,
  team_size). `holidays`, `school_holidays`, `destinations`, `climate` are
  global reference data. **No groups, no membership, no authorization** — the
  API served fixtures and never scoped a query by requester.
- **Engine:** `optimise(EngineInput)` is pure/deterministic. It had **no group
  constraints** — colleague leave and `maxSimultaneous` existed only as calendar
  decoration (`DEMO_COLLEAGUES`, `DEMO_TEAM` in `fixtures.ts`); the optimiser
  ignored them. Approval status was a mocked string / a mock provider signal.
- **Web:** runs the engine client-side (`store/planner.tsx`); the solo journey
  needs no backend. Colleague/team data comes from engine fixtures.

## Authorization model (this phase)

Single source of truth for the permission matrix lives in the pure engine
package (`packages/engine/src/groups.ts`) and is enforced in **both** the
server service layer (against Postgres rows) and the web store (against seeded
in-memory rows). UI never decides access; it only reflects it.

- **Group** has a `type`: `household` (peer roles) or `team` (approver/member).
  A user may belong to many groups. Migration puts every existing user into a
  **group-of-one** they `own`.
- **Roles:** `owner`, `admin`, `approver`, `member`. Rank owner>admin>approver>member.
- **Permission matrix** (action → min role / rule):

  | Action | household | team |
  |--------|-----------|------|
  | view group + shared calendar | any member | any member |
  | invite / revoke invite | owner, admin (peers: any member) | owner, admin |
  | remove member / change role | owner, admin | owner, admin |
  | delete group | owner | owner |
  | request leave | any member (self) | any member (self) |
  | approve / reject leave | any member except requester (auto-ack) | approver+ (owner/admin/approver), not self |
  | share a plan / set co-edit | plan owner | plan owner |
  | edit a shared plan | co-edit grantees | co-edit grantees |

- **Deny by default:** `requireMembership(userId, groupId, minRole?)` throws
  `AuthorizationError` (HTTP 403) unless an explicit membership row (and role
  rank) is found. Cross-group reads/writes are impossible without a checked row.
- **Invites:** token = 32 random bytes hex (`crypto.randomBytes`), single-use,
  `expires_at` (default 7 days). Invite email is validated/normalised and
  treated as untrusted input.
- **Privacy:** per-user, per-group `share full | busy | private`. Others see
  full details, busy-only blocks, or nothing accordingly.
- **Approval workflow states:** `draft → requested → pending → approved | rejected`
  with `reason` + timestamps + history. Team groups require an approver; household
  groups auto-approve/acknowledge.
- **Approval likelihood** is now derived by a pure function
  `computeApprovalLikelihood({ overlap, blackout, remainingCapacity })` — no stub.

## New tables (migration 002, reversible)
`groups`, `group_members`, `group_invites`, `leave_requests`,
`plan_shares`, `user_group_privacy`. Migration 002 also back-fills a
group-of-one per existing user. Rollback: `002_groups.down.sql` drops them.

## Engine group constraints (deterministic inputs)
`EngineInput` gains optional `colleagueLeave: DateRangeSpec[]` and
`maxSimultaneous?: number`. The optimiser never books a leave day that would
exceed `maxSimultaneous` colleagues-off, and (as before) never books into a
blackout. Team blackouts are passed via the existing `blackouts` field.

## New env vars (Phase 3)
- `GROUPS_BACKEND=postgres` — persist groups to Postgres (default: seeded
  in-memory repo, so cold start works with no DB).
- Dev-only `x-user-id` request header — "act as" a seeded user. Honoured ONLY
  when no real `AUTH_PROVIDER` is set and `NODE_ENV !== 'production'`. Ignored
  otherwise, so it can never impersonate in a deployed environment.

## Commands (Phase 3)
- `npm run db:migrate` / `npm run db:rollback` (reverts the last migration) /
  `npm run db:seed`.

## Coverage achieved (Phase 3)
`npm test` runs 126 tests offline (+3 DB-gated skipped) plus 3 Playwright E2E:
- **Engine:** 54 tests — 97.7% stmts / 91.2% branch. Permission matrix
  (`groups.ts`) 94.6%; `optimiser.ts` 98.4%.
- **Server:** 47 tests (+3 DB-gated skipped). Authorization service `access.ts`
  77%, `routes/groups.ts` 96.5%, in-memory repo 83%. `pg.ts`, `migrate.ts`,
  `seed.ts` are exercised only by the DB-gated tests (CI Postgres service).
- **Web:** 25 tests — client group store 85.8%, `GroupView` 74.7%.
- **E2E (Chromium):** solo journey (unchanged) + multi-user
  (invite→accept→request→approve→co-edit) + deny-by-default UI.

## What was verified vs. not (Phase 3, honesty)
- **Verified offline (`npm test`):** deny-by-default and cross-group isolation
  (non-member denied read+write), role checks (member can't invite in a team;
  can't approve; nobody approves their own request), invite lifecycle
  (accept/expiry/revoke, unguessable tokens), plan-sharing authorization,
  household auto-approval, and the same enforcement in the web store. The engine
  proves group constraints (never exceeds max-off-simultaneously, never books a
  blackout) while the solo path stays byte-identical.
- **Verified in-browser (cold start, no keys):** the Group surface renders, the
  act-as switcher works, deny-by-default is reflected in the UI, dark mode is
  clean. Console is clean on cold load; the only errors seen were transient
  React Fast Refresh (HMR) context warnings that clear on reload and never occur
  in the production build (the E2E in fresh Chromium is error-free).
- **Verified in CI only (no local Docker/Postgres):** the reversible group
  migration + back-fill to a group-of-one, its rollback, idempotent re-seed,
  and Postgres-enforced authorization (`PgRepository`). These are written and
  gated on `TEST_DATABASE_URL`; locally they are reported as **skipped**, not
  passing. The GitHub Actions `db-integration` job runs them against a Postgres
  service.
- **Not implemented (kept honest):** real IdP login (Clerk/Auth.js) remains a
  documented seam — the dev `x-user-id` switch stands in for it; and real
  calendar/notification write-back stays behind explicit confirmation (Phase 2).

---

# Phase 4 — Notifications (additive, async, authorization-scoped)

## Step 0 — events that should produce notifications (from what already exists)

All triggers are existing actions in `packages/server/src/access.ts` (server) and
the mirrored client store `apps/web/src/store/groups.tsx`:

| Event type | Trigger (existing) | Recipients (via existing authz) | Essential |
|------------|--------------------|---------------------------------|-----------|
| `invite.created` | `createInvite` | the invited email (+ in-app if a known user) | yes |
| `invite.accepted` | `acceptInvite` | the inviter + group admins/owner | yes |
| `invite.declined` | `declineInvite` | the inviter | yes |
| `invite.revoked` | `revokeInvite` | the invited email | yes |
| `invite.expiring` | digest (pending invite near `expiresAt`) | the inviter | no |
| `leave.requested` | `createLeaveRequest` (team) | approvers (owner/admin/approver, not requester) | yes |
| `leave.approved` / `leave.rejected` | `decideLeaveRequest` | the requester (with reason) | yes |
| `plan.shared` | `createPlanShare` | the target member, or members of the target group | yes |
| `plan.coedit` | co-edit change seam (batched) | the plan owner | no |
| `reminder.holiday` | digest (upcoming booked break) | the user | no |
| `reminder.approval` | digest (requests awaiting your action) | approvers | no |
| `reminder.savings` | digest (optional nudge) | the user | no |

Recipient scoping **reuses** `requireMembership` / `membersOf` / role checks —
no second access path. Content is redacted per recipient (a recipient only sees
what they could already see in-app; e.g. a requester's leave reason goes only to
the requester and approvers of that group).

## Channels & providers

- **In-app** (always on): a `notifications` feed row per recipient, written
  synchronously at emit, idempotent by `dedup_key`. Read/unread + deep link.
- **Email** (env-gated): real adapter targets **Resend** (`POST
  https://api.resend.com/emails`, documented) — mock fallback logs + records.
  `List-Unsubscribe` header + working no-login unsubscribe link.
- **Web push** (env-gated): VAPID/`web-push` seam — mock fallback logs. Browser
  opt-in via `Notification.requestPermission` (never on first load). The real
  push send is documented but **not verified** (no VAPID keys / real
  subscription) — recorded honestly.

## Delivery & reliability (outbox pattern)

- Emit writes the in-app row(s) and one `notification_outbox` row per async
  channel (email/push) **after** the triggering action, wrapped so it can never
  throw into the request path (non-blocking). Delivery runs **outside** the
  request (interval worker `processOutbox`, or invoked directly in tests).
- **Idempotent / dedup:** `dedup_key = type:subjectId:recipientId`, unique — a
  repeated trigger or retry never creates a second notification or send.
- **Retry/backoff:** failed sends increment `attempts` with exponential backoff
  (`next_attempt_at`); after `MAX_ATTEMPTS` (5) the row is `dead` (dead-letter),
  never lost.
- **Batching:** reminders and `plan.coedit` coalesce into a single digest
  (`batchDigest`) rather than one message per event.

## Preferences & compliance

- Per-user, per-channel, per-type preferences with sensible defaults
  (in-app on; email on for transactional, off for digests/nudges; push off).
- Quiet hours defer email/push (in-app still delivered). Global mute.
- Unsubscribe tokens are unguessable, single-purpose, expiring; the
  `/api/unsubscribe?token=` route works without login and is honoured
  immediately. `List-Unsubscribe` header set for the email provider.
- Bounce/complaint handling: documented as a provider webhook seam (Resend);
  not wired live without keys — recorded as unimplemented.

## Security
- Recipient scoping + redaction reuse the group/role checks; a test asserts a
  non-member / wrong-role user never receives a notification about a group's
  leave or plan.
- User text (names, plan titles) is HTML-escaped in email bodies and stripped of
  CR/LF before use in subjects/headers → no header/markup injection.

## New env vars (Phase 4, all optional; absent ⇒ mock, cold start works)
- `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM` — real transactional email via Resend.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — real web push (documented seam; not
  wired live).
- `APP_BASE_URL` (deep-link base in emails), `API_BASE_URL` (unsubscribe links).

## Coverage achieved (Phase 4)
`npm test` runs 154 tests offline (+4 DB-gated skipped) plus 5 Playwright E2E:
- **Engine:** 66 tests — notifications core `notifications.ts` 92.6% stmts
  (catalogue defaults, escaping/header-injection, redaction, preferences +
  quiet hours, dedup, digest batching, backoff).
- **Server:** 56 tests (+4 DB-gated). notifier 73%, delivery 75%, routes 82%,
  channels 61% (the live Resend path is not exercised offline). DB-gated tests
  cover migration 003, the Pg notification store, and rollback (CI only).
- **Web:** 32 tests — client notifications store (emit/dedup/opt-out/unread),
  notification centre deep-link, preferences toggles.
- **E2E (Chromium):** invite → recipient notified → deep-link opens the group
  screen; leave requested → approver notified → approves → requester notified.
  Solo + prior multi-user journeys still pass.

## Verified vs. not (Phase 4, honesty)
- **Verified offline / in-browser:** event→notification mapping and redaction;
  authorization-safe recipient scoping (approver notified, plain member and
  non-member NOT — asserted via API and engine); non-blocking (action commits
  though the email channel throws); retry with backoff → dead-letter after 5,
  never lost, never duplicated (dedup); preferences (disabling an email keeps
  in-app), no-login unsubscribe honoured immediately; HTML-escaped body +
  CR/LF-stripped subject (no header injection). Notification centre + prefs
  render with no console errors on cold load; AA tokens unchanged.
- **Not verified (no keys/account):** live Resend email send and live web push
  (VAPID) — implemented/seamed against documented contracts, default to mocks.
- **Verified in CI only (no local Docker/Postgres):** migration 003 + rollback
  and the Postgres notification store — reported as skipped locally, not passing.
- **Not implemented (kept honest):** provider bounce/complaint webhooks are a
  documented Resend seam, not wired without keys.

---

# Phase 5 — Automatic location detection

Adds keyless location awareness for currency + local (staycation) weather, plus
a consistent server IP-geolocation seam. Additive; cold-start-without-keys and
the deterministic engine are unchanged.

## What it does
- **Locale heuristic (default, keyless, no prompt):** the web reads
  `Intl.DateTimeFormat().resolvedOptions().timeZone` + `navigator.language` and
  maps them to a country + currency (pure `guessLocationFromLocale` in the
  engine). Applied to a fresh user's currency + "home" profile; fully
  overridable in onboarding (a "Home country" select) — nothing leaves the
  device.
- **Home / staycation weather:** `EngineInput.home` (optional) carries a seeded
  monthly climate profile; the optimiser annotates every *staycation* break with
  `homeWeather` for that month. **Foreign trips keep their destination weather**
  (unchanged) — exactly the split requested. Absent `home` ⇒ engine output is
  byte-identical to before, so existing tests/solo journey are unaffected.
- **Server `LocationProvider` seam:** env-gated IP geolocation via **ipwho.is**
  (keyless HTTPS; `LOCATION_PROVIDER=ipwho`), mock (GB) by default, exposed at
  `GET /api/integrations/location`. The web optionally calls it to refine a
  fresh guess and silently falls back to the locale heuristic.

## Providers / env
| Concern | Real provider | Env gate | Verified live? |
|---------|---------------|----------|----------------|
| IP geolocation | **ipwho.is** (keyless HTTPS) | `LOCATION_PROVIDER=ipwho` | ✅ yes (returned CA/CAD/America-Toronto) |

Seeded home-climate profiles ship for GB, IE, ES, FR, DE, US (approximate
national averages), defaulting to GB — documented as extensible.

## Honesty
- `ipapi.co` was tried first but its free tier now rate-limits/requires signup
  (HTTP 429), so the adapter was switched to **ipwho.is**, which I verified live.
- School-holiday *datasets* remain UK-only: detection sets the country (which
  the server bank-holiday provider already uses) but per-country school-holiday
  ranges are not shipped — recorded as not implemented rather than faked.

## Coverage (Phase 5)
`npm test` runs 170 tests offline (+4 DB-gated skipped):
- Engine: 74 (+8) — locale guess, currency map, home profiles, staycation
  `homeWeather` present / trips-abroad unaffected / solo unchanged.
- Server: 61 (+5) — location factory default mock, ipwho parse + failure +
  malformed rejection, `/api/integrations/location` route.
- Web: 35 (+3) — locale detection, fresh-user home + detected currency,
  changing home country updates currency + profile. Verified in-browser:
  onboarding detects UK, switching to Spain flips currency to EUR and staycation
  chips show Spanish local temperatures; no console errors.

---

# Phase 6 — Suggestions driven by travel preferences

Destinations were only *soft-ranked* by trip type, so a place like Barcelona
could appear regardless of intent. Now `suggestDestination` **hard-filters** the
seeded destinations by the user's travel preferences before ranking on weather:

- **Trip types** (existing): a destination must offer at least one selected type,
  else it's excluded (no match on any break ⇒ staycation).
- **Travel scope** (new): domestic-only / international-only / anywhere.
- **Countries to avoid / preferred** (new): block- and allow-lists by ISO code.
- **Max flight time** (new): excludes long-haul destinations (0h ⇒ domestic).
- Budget cap unchanged.

All new `Preferences` fields are **optional** (absent ⇒ no constraint), so
`demoInput()` and existing tests are unchanged. UI: a new **Travel preferences**
card in the Preferences tab (scope, max-flight-time slider, countries-to-avoid
chips); plan chips now show the matched trip type, e.g. "Cornwall (beach)".

Coverage: engine 80 (+6 travel-filter tests), web 37 (+2 travel-prefs UI).
Verified in-browser: setting *Domestic only* switched every suggestion to UK
destinations (Cornwall/Edinburgh) — Barcelona no longer appears; no console errors.

---

# Phase 7 — Book time off for any reason (purpose + event anchoring)

The planner treated every break as an implied trip. Now leave has a **purpose**
and can be **anchored to real-life dates** — making it an all-encompassing
planner, not just a holiday tool.

- **`Break.purpose`** (`getaway | staycation | event | family | admin | rest`):
  trips are `getaway`, no-travel breaks are `staycation`, and anchored breaks
  take their purpose from the occasion kind. Non-travel breaks get **no
  destination suggestion**.
- **`PersonalDate` extended** with `bookAround` + `daysAround` and a broader
  `kind` set (wedding, family, medical, admin, moving, study, rest, …). When
  `bookAround` is set, the optimiser builds a **forced break anchored around the
  date** using the cheapest window that contains it (bridging nearby
  weekends/holidays). Anchored breaks honour the **emergency reserve** and the
  **max-colleagues-off** cap — they're skipped, never overspent.
- Plans **explain** anchored time off ("…also books time off around Anniversary,
  House move"); plan chips + the calendar label them (e.g. "House move (Life
  admin)").
- New optional fields ⇒ `DEFAULT_PREFERENCES`/`baseInput` and all prior tests
  are unchanged. `demoInput` opts a couple of dates in (an anniversary + a house
  move) to showcase it.
- UI: a **"Time off for anything"** editor in Preferences (add/remove occasions,
  set type, toggle "book time off", choose days).

Coverage: engine 86 (+6 anchoring/purpose), web 40 (+3 occasions UI + anchored
plan chips). Verified in-browser: the demo plan books "Anniversary (Occasion)"
and "House move (Life admin)" as non-travel breaks; no console errors.
