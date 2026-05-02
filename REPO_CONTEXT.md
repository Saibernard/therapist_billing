# BookAI — Repo Context

> Reference doc for fast onboarding into this codebase. Folder is named `meeting_summary` for legacy reasons; the actual product is **BookAI**.

Last verified: 2026-05-02 against `main`.

---

## What it is

Multi-tenant SaaS for **AI-first appointment scheduling**. Two interfaces:

- **Operator** — business owner manages the schedule by chatting with the AI in a web dashboard.
- **Client** — books / reschedules / cancels by replying to email, SMS, or WhatsApp. No consumer app.

Target verticals: salons, medspas, clinics, fitness — service businesses where no-shows hurt and the owner is mobile.

Not a meeting summarizer. Not a Calendly clone. The wedge is *autonomous, conversational scheduling*.

---

## Topology

Turborepo (`turbo.json`) + npm workspaces. One app, eight packages.

```
apps/
  web/                    Next.js 15 (App Router), React 19, Tailwind 4
packages/
  ai/                     OpenAI agent, 50+ tool functions, no-show scorer, coach insights
  api/                    tRPC 11 routers (~22 sub-routers)
  communications/         Resend / Twilio / Stripe / inbound-message router
  db/                     Prisma 6 on SQLite, 18+ models
  scheduling/             Conflict detection, availability, recurrence, Google Calendar
  types/                  Shared TS types
  utils/                  Date / timezone / currency helpers
  validators/             Zod schemas
scripts/
  simulations/            E2E booking + reschedule scripts (run with tsx)
docker-compose.yml        Postgres 16 + Redis 7 (aspirational — see "Disconnects")
```

Package import names: `@bookai/ai`, `@bookai/api`, `@bookai/db`, etc. (not `@meeting-summary/*`).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router, React 19, TS 5.7 |
| Database | **SQLite** via Prisma 6 (not Postgres in code, despite docker-compose) |
| API | tRPC 11 + superjson + React Query 5 |
| Auth | NextAuth 5 beta, credentials provider, JWT strategy, bcrypt |
| AI | OpenAI GPT-4o-mini, function calling, retry w/ backoff |
| Email | Resend (`@bookai/communications`) |
| SMS / WhatsApp | Twilio |
| Payments | Stripe — checkout, Connect (revenue share), deposits, no-show fees |
| Calendar | Google Calendar OAuth, delta sync via `syncToken` |
| UI | Tailwind 4, Radix primitives, Lucide icons, custom `cn()` — no shadcn install |
| Build | Turborepo 2.4 |
| Tests | Vitest 4, **159 tests in `packages/ai`, all passing** |

---

## `apps/web` — surface area

App Router. Path alias `@/*` → `./src/*`. Middleware (`src/middleware.ts`) gates `/dashboard/*` on session.

### Public routes
- `/` — landing
- `/login`, `/signup`
- `/b/[slug]` — public booking widget
- `/book/[slug]` — alt booking URL
- `/portal/[token]` — client self-service (token-gated)
- `/intake/[token]` — intake form

### Dashboard routes (auth-gated)
`/dashboard` (home + briefing), `/calendar`, `/appointments`, `/clients`, `/services`, `/staff`, `/staff/schedule`, `/availability`, `/packages`, `/forms`, `/campaigns`, `/payroll`, `/waitlist`, `/reviews`, `/request-centre`, `/messages`, `/reports`, `/analytics`, `/insights`, `/competitive`, `/onboarding`, `/settings`, `/settings/billing`, `/settings/import`.

### API routes
| Route | Purpose |
|---|---|
| `POST /api/auth/signup` | Org + user + subscription + booking page |
| `[...nextauth]` | NextAuth handlers |
| `GET /api/auth/google-calendar` | OAuth init |
| `POST /api/booking` | Create / reschedule (calls `@bookai/scheduling`) |
| `GET /api/booking/slots` | Availability for date |
| `GET /api/booking/info` | Booking page metadata |
| `GET /api/booking/reschedule-context` | Resolve token → appointment context |
| `POST /api/webhooks/email` | Inbound email → `handleInboundMessage` |
| `POST /api/webhooks/twilio` | Inbound SMS / WhatsApp → `handleInboundMessage` |
| `POST /api/webhooks/stripe` | Payment events → `handleStripeWebhook` |
| `POST /api/cron/calendar-sync` | `syncAllCalendars()` |
| `POST /api/cron/generate-recurring` | `generateUpcomingRecurring()` |
| `POST /api/cron/reminders` | `sendPendingReminders()` |
| `POST /api/cron/no-show-scoring` | `scoreUpcomingAppointments()` |
| `POST /api/cron/campaigns` | `runActiveCampaigns()` |
| `GET\|POST /api/trpc/[trpc]` | tRPC entrypoint |
| `POST /api/upload`, `/api/import/upload` | File uploads |
| `POST /api/intake/[formId]` | Intake form submit |
| `GET /api/calendar`, `POST /api/export` | Exports |

### Top-level components (in `src/components/`)
- `providers.tsx` — React Query + tRPC client, `httpBatchLink`, superjson, **`refetchInterval: 5s`** (polling, not realtime)
- `dashboard/sidebar.tsx` — 19-item nav
- `dashboard/ai-chat-panel.tsx` — right-side AI chat, expandable, supports function calls + UI blocks
- `dashboard/global-search.tsx` — header search
- `dashboard/chat-ui-blocks.tsx` — renders interactive blocks from AI responses

State pattern: tRPC queries + mutations, invalidate on success via `utils.<resource>.<method>.invalidate()`. No Zustand / Redux. Local state via `useState`.

---

## Packages

### `@bookai/db` (Prisma + SQLite)
Singleton `prisma` client, dev-mode caching. Re-exports all Prisma types.

**Core models** (18+ tables):
- **Tenancy / identity** — `Organization`, `Location`, `User`, `Client`, `StaffMember`
- **Catalog** — `Service`, `Package`, `ClientPackage`
- **Scheduling** — `Appointment`, `StaffSchedule`, `StaffScheduleOverride`, `RecurrenceRule`, `WaitlistEntry`, `CalendarSync`
- **Comms** — `CommunicationLog`, `MessageTemplate`, `Campaign`, `CampaignExecution`
- **AI** — `AiConversation` (messages stored as JSON array), `AiActionLog`
- **Money** — `Payment`, `Subscription` (revenueSharePct), `BookingPage`
- **Forms** — `IntakeForm`, `IntakeFormServiceLink`, `IntakeFormSubmission`
- **Misc** — `ImportJob`, `Review`

**Notable fields:**
- `Organization.settings` — JSON blob: timezone fallback, cancellation policy hours, AI personality, request automation policy
- `Appointment.noShowRisk` — Float, populated by AI scorer
- `Appointment.externalCalendarId` — Google Calendar event ID
- `CommunicationLog.{channel, direction, messageType, status}` — full audit
- `AiConversation.status` — ACTIVE / RESOLVED / ESCALATED / PAUSED
- `AiActionLog.actionType` — enum covering every AI mutation type
- `CalendarSync.{syncToken, syncDirection}` — supports ONE_WAY_PUSH / ONE_WAY_PULL / TWO_WAY

### `@bookai/scheduling`
Exports: `getAvailableSlots`, `detectConflicts`, `hasConflict`, `createAppointment`, `cancelAppointment`, `rescheduleAppointment`, `generateOccurrenceDates`, `createRecurringSeries`, `cancelSeries`, `generateUpcomingRecurring`, `getGoogleAuthUrl`, `exchangeCodeForTokens`, `pushAppointmentToGoogle`, `deleteGoogleCalendarEvent`, `pullFromGoogle`, `syncAllCalendars`, `checkWaitlistOnCancellation`, `expireWaitlistNotifications`.

- Group services (`maxCapacity > 1`) allow overlap up to capacity.
- Recurrence: WEEKLY / BIWEEKLY / MONTHLY / CUSTOM, respects `endDate` + `maxOccurrences`.
- Google: token refresh w/ 5-min buffer, `YYYYMMDDTHHmmssZ` formatting.
- Cancellation policy read from `org.settings.cancellationPolicyHours`.

### `@bookai/communications`
Exports: `sendEmail`, `buildConfirmationEmail`, `buildReminderEmail`, `sendSms`, `buildConfirmationSms`, `buildReminderSms`, `sendWhatsApp`, `handleInboundMessage`, `sendPendingReminders`, `createCheckoutSession`, `handleStripeWebhook`, `createSubscriptionCheckout`, `createSetupIntent`, `collectDeposit`, `chargeNoShowFee`, `createMembershipSubscription`, `encodeReplyAddress`, `decodeReplyAddress`, `createRescheduleToken`, `verifyRescheduleToken`, `buildRescheduleBookingUrl`, `REQUEST_AUTOMATION_FUNCTIONS`, `DEFAULT_REQUEST_AUTOMATION_POLICY`, `normalizeRequestAutomationPolicy`.

- All providers fall back to `console.log` if env keys missing — silent in prod.
- Email confirmations include reply-to encoding (clients reply → routed back to conversation) and a Google Calendar add button.
- Stripe Connect: revenue share = `subscription.revenueSharePct` (default 4%) → `transfer_data` to `org.stripeConnectId`.
- Inbound flow:
  1. Decode reply-to or look up org by phone
  2. Find or auto-create client; merge phone/email across channels
  3. Call `processMessage` from `@bookai/ai` with the org's automation policy
  4. If functions need approval → mark `PENDING_APPROVAL`, set conversation `ESCALATED`
  5. Send response back via the same channel

### `@bookai/ai`
Exports: `processMessage`, `buildAiContext`, `executeFunctionCall`, `BUSINESS_FUNCTIONS`, `CLIENT_FUNCTIONS`, `generateCoachInsights`, `generateCompetitiveReport`, `getCompetitorDetails`, `scoreAppointment`, `scoreUpcomingAppointments`, `generateCampaignMessage`, `generateOptimizationReport`, `getUtilizationSummary`, `detectUIBlocks`.

- GPT-4o-mini, max 5 tool-call iterations, 3 retries on 429/5xx/timeout.
- Two execution modes:
  - `execute` — run immediately (operator chat)
  - `plan_mutations` — record without executing (client inbound, gated by approval policy)
- Function library covers: appointments (create/update/complete/no_show/reschedule/cancel/confirm/bulk_*), services (create/update/delete/update_fees), clients (create/update/search), staff (create/update_schedule/update_services), availability (search/block/extra/remove_override/staff/suggest_optimal), recurrence, packages, campaigns, intake, waitlist, reporting (payroll/revenue/analytics/business_info), `escalate_to_human`.
- No-show scorer weights: client history (35), first-time (15), Mon/Fri (5), early/late slot (8/5), long lead time (10), recent no-show recency boost.
- **Tests** — 159 in `packages/ai`:
  - `validate.test.ts` — 57 Zod schemas
  - `functions.test.ts` — 54 function-definition shape checks
  - `resolve.test.ts` — 21 entity resolver tests
  - `executor.test.ts` — 27 end-to-end handler smoke tests

### `@bookai/api` (tRPC)
~22 sub-routers: `organization`, `service`, `client`, `staff`, `appointment`, `availability`, `ai`, `analytics`, `payment`, `insights`, `competitive`, `waitlist`, `review`, `import`, `recurrence`, `package`, `intakeForm`, `calendarSync`, `portal`, `campaign`, `location`, `payroll`, `reports`. Context = `{ userId, organizationId, prisma }`. `protectedProcedure` checks org membership.

### `@bookai/validators`
Zod schemas for all create/update/reschedule paths. Source enum: `BOOKING_PAGE`, `SMS`, `WHATSAPP`, `EMAIL_REPLY`, `AI_CHAT`, `MANUAL`, `WIDGET`. Status enum: `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`.

### `@bookai/types`, `@bookai/utils`
Shared TS types, `date-fns` + `date-fns-tz` helpers, slug generator, `Intl.NumberFormat` for currency (US locale hardcoded — fixable).

---

## Data flow: a booking, end to end

1. Inbound — public form, AI chat, email reply, SMS, or WhatsApp
2. If conversational → `handleInboundMessage` → resolve org + client → `processMessage` (AI)
3. AI chooses function call → `executeFunctionCall` → `scheduling.createAppointment` (conflict check, capacity-aware)
4. On success → `buildConfirmationEmail` + `buildConfirmationSms` (with reschedule token in email)
5. `CommunicationLog` row created; `AiActionLog` row created
6. Cron: `sendPendingReminders` (24-hour window), `scoreUpcomingAppointments` (no-show risk)
7. Reschedule via email reply (decoded reply-to → conversation) or web (token → `/book/[slug]?rescheduleToken=...`)

---

## Wired vs stubbed

**Solid:**
- Booking + reschedule + cancel (web + AI)
- Calendar drag-drop UI
- Clients / services / staff CRUD
- Auth (signup, login, session)
- Confirmation emails with reschedule tokens
- No-show risk scoring
- Stripe webhook handling
- Google Calendar OAuth handshake
- AI agent with 50+ functions

**Stubs / TODO:**
- `executeCampaign` records `CampaignExecution` but never sends — explicit TODO
- `pullFromGoogle` / `syncAllCalendars` read tokens, skip API calls
- `generateUpcomingRecurring` exported, minimal body
- `getCompetitorDetails` / `generateCompetitiveReport` return empty
- Waitlist (`checkWaitlistOnCancellation`, `expireWaitlistNotifications`) — stubs
- Approval workflow: escalation gets set, but `approveFunction` / `rejectFunction` don't fully clear `ESCALATED` state
- `chargeNoShowFee` assumes `stripeCustomerId` + card on file, no precheck
- All providers (Resend, Twilio, Stripe) silently `console.log` if env missing — risky in prod

**Deferred per `README.md` "Multi-User Launch Hardening" (7 phases):**
1. Postgres + connection pooling + indexes (calendar / availability / appointments)
2. Realtime — replace 5s polling with SSE / websocket
3. Idempotency keys for mutation endpoints
4. Rate limiting + AI usage quotas + circuit breakers
5. Sentry, structured logs, metrics
6. Load tests at 50 / 100 / 300+ concurrent users
7. Launch gate — runbook, backups, cost guardrails

---

## Disconnects to know

- `docker-compose.yml` provisions Postgres + Redis but `packages/db` is on **SQLite**. Migration is part of Phase 1 of the deferred plan.
- `next.config.ts` `transpilePackages` lists `@bookai/*` while folder name is `meeting_summary`. Consistent inside the code, only the directory name lies.
- `Intl.NumberFormat('en-US')` is hardcoded — multi-currency org support exists in schema but not in formatters.
- `Providers` polling at `refetchInterval: 5s` will collide on multi-user edits.

---

## Known product gaps (from review on 2026-05-02)

Friction worth fixing for "seamless" before adding features:

1. **Cross-channel client identity** — phone-then-email creates two `Client` rows; merge is forward-only.
2. **SMS reschedule has no tap-to-rebook link** — only email confirmations carry the token.
3. **No deposit / card-on-file gate at booking** — Stripe wired but not enforced; no-show fee path untrustworthy.
4. **No unified "needs my attention" inbox** — approvals, escalations, at-risk, new bookings live in 4 different routes.
5. **Coach insights are pull-only** — no morning briefing push via SMS / email.
6. **Polling, not realtime** — see "Disconnects."
7. **No phone channel** — Twilio Voice + OpenAI Realtime would close the last booking surface.

Highest-leverage first builds: **#4 (unified inbox) + #1 (identity merge)**.

---

## Running things

```bash
# Local infra (Postgres 16 + Redis 7 — aspirational, not yet wired)
docker compose up -d

# Dev
npm run dev          # turbo dev across workspaces

# Tests (all in packages/ai)
npm run test         # 159 tests via vitest

# Simulations (run from repo root)
npx tsx scripts/simulations/e2e-booking-reschedule.ts
npx tsx scripts/simulations/conflict-fallback-reschedule-link.ts
# Override: BASE_URL, ORG_ID, ORG_SLUG, SERVICE_ID, STAFF_ID
```

---

## File-level pointers (fast jump)

| Need | Path |
|---|---|
| tRPC router root | `packages/api/src/router.ts` (or similar — see exports of `appRouter`) |
| Prisma schema | `packages/db/prisma/schema.prisma` |
| AI agent loop | `packages/ai/src/processMessage.ts` |
| AI function registry | `packages/ai/src/functions.ts` + `executor.ts` |
| Inbound message routing | `packages/communications/src/inbound.ts` (or `handleInboundMessage`) |
| Conflict detection | `packages/scheduling/src/conflicts.ts` |
| Google Calendar | `packages/scheduling/src/googleCalendar.ts` |
| Auth setup | `apps/web/src/lib/auth.ts` |
| Middleware (route guard) | `apps/web/src/middleware.ts` |
| tRPC client / providers | `apps/web/src/components/providers.tsx` |
| AI chat panel UI | `apps/web/src/components/dashboard/ai-chat-panel.tsx` |
| Public booking page | `apps/web/src/app/b/[slug]/page.tsx` |
| Booking API | `apps/web/src/app/api/booking/route.ts` |
| Webhooks | `apps/web/src/app/api/webhooks/{email,twilio,stripe}/route.ts` |
| Crons | `apps/web/src/app/api/cron/*/route.ts` |

(Paths are best-effort by module name; if a file moved, grep the function name.)
