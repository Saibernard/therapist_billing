# BookAI — AI-First Scheduling Platform

An AI-powered appointment scheduling platform where the AI is the interface, not an add-on. Business owners manage their schedule by chatting. Clients book and manage appointments by replying to emails, texts, or WhatsApp. No consumer app needed.

## Architecture

- **Turborepo monorepo** with shared packages
- **Next.js 15** web app (dashboard + public booking pages + API)
- **tRPC** for end-to-end type-safe API
- **Prisma + PostgreSQL** with multi-tenant Row-Level Security
- **OpenAI GPT-4o-mini** with function calling for AI agent
- **Twilio** for SMS/WhatsApp, **Resend** for email
- **Stripe** for payments (subscription + revenue share)

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL + Redis)

### Setup

```bash
# Install dependencies
npm install

# Start local database
docker compose up -d

# Generate Prisma client
npx prisma generate --schema=packages/db/prisma/schema.prisma

# Push schema to database
npx prisma db push --schema=packages/db/prisma/schema.prisma

# Seed demo data
npx tsx packages/db/prisma/seed.ts

# Copy environment variables
cp .env.example .env
# Edit .env with your values

# Start dev server
cd apps/web && npx next dev
```

### Project Structure

```
├── apps/
│   └── web/                  # Next.js 15 web application
├── packages/
│   ├── api/                  # tRPC routers (shared API layer)
│   ├── db/                   # Prisma schema + client
│   ├── ai/                   # AI agent (GPT-4o-mini + function calling)
│   ├── communications/       # Email, SMS, WhatsApp integration
│   ├── scheduling/           # Availability engine + booking logic
│   ├── validators/           # Zod schemas (shared validation)
│   ├── types/                # Shared TypeScript types
│   └── utils/                # Shared utilities
├── docker-compose.yml        # Local Postgres + Redis
└── turbo.json                # Turborepo config
```

## Key Concepts

- **AI-first UX**: The AI chat panel is the primary interface for business owners
- **No consumer app**: Clients interact via email replies, SMS, and WhatsApp
- **Reply-to-anything**: Every outbound message is a conversation entry point — clients reply to reschedule, cancel, or ask questions
- **Multi-tenant**: Single database with organization_id on every row, enforced via RLS
- **Hybrid pricing**: Businesses choose subscription ($9/mo) or free + revenue share (4%)

## Deferred Plan: Multi-User Launch Hardening

This is intentionally deferred for later implementation before broader public launch.

1. **Database and concurrency**
   - Move all environments to PostgreSQL (AWS RDS/Aurora).
   - Add connection pooling (PgBouncer or managed pooler).
   - Add indexes for high-traffic queries (calendar, availability, appointments, clients).

2. **Real-time architecture**
   - Replace broad global polling with targeted polling by page.
   - Add websocket/SSE updates for high-change screens (Calendar, Appointments, Messages).
   - Keep fallback polling for reliability if real-time channel disconnects.

3. **Write safety and idempotency**
   - Add idempotency keys for mutation endpoints used by AI flows.
   - Enforce duplicate guards for create actions (staff, service, client, appointment).
   - Add transactional guards for schedule/booking conflicts.

4. **Rate limiting and abuse protection**
   - Add per-organization and per-IP rate limits for API and public booking endpoints.
   - Add AI usage quotas and circuit breakers to prevent runaway token/cost spikes.

5. **Observability and ops**
   - Add error tracking (Sentry) and structured logs.
   - Add metrics dashboards (latency, error rate, queue depth, AI latency/cost).
   - Add alerting for elevated failures and slow DB queries.

6. **Performance and load validation**
   - Run staged load tests (50, 100, 300+ concurrent active users).
   - Define SLO targets (p95 API latency, booking success rate, chat response time).
   - Resolve bottlenecks before launch gate.

7. **Launch gate checklist**
   - Concurrency test pass.
   - Incident/rollback runbook ready.
   - Backup/restore verified.
   - Cost guardrails enabled (OpenAI + infra + messaging).
