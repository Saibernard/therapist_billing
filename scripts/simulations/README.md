# Simulation Scripts

Reusable scripts for validating the booking/reschedule flows.

## Prerequisites

- Web app running locally (default expected URL: `http://localhost:3456`)
- Local DB seeded with demo org/staff/service
- `npx tsx` available

## 1) End-to-End Booking + Reschedule

Creates a booking, extracts reschedule URL from confirmation log, reschedules using token, then verifies DB/log state.

```bash
npx tsx scripts/simulations/e2e-booking-reschedule.ts
```

## 2) Conflict Fallback -> Reschedule Link

Creates a forced reschedule conflict, runs owner approval resolver, and verifies client outbound message includes a reschedule link.

```bash
npx tsx scripts/simulations/conflict-fallback-reschedule-link.ts
```

## Optional Environment Overrides

These scripts support optional overrides if your IDs/host are different:

- `BASE_URL` (only used by `e2e-booking-reschedule.ts`)
- `ORG_ID`
- `ORG_SLUG`
- `SERVICE_ID`
- `STAFF_ID` (only used by `conflict-fallback-reschedule-link.ts`)
