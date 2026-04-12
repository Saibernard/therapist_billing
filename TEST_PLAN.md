# BookAI Test Plan

Run this test suite whenever a new feature is added, a handler is modified, or a function definition changes. All tests must pass before merging.

## Quick Start

```bash
# Run all AI package tests
cd packages/ai && npx vitest run

# Run in watch mode during development
cd packages/ai && npx vitest

# Run a specific test file
cd packages/ai && npx vitest run src/__tests__/validate.test.ts
```

## Test Architecture

```
packages/ai/
├── vitest.config.ts                  # Test runner config with module aliases
└── src/__tests__/
    ├── setup.ts                      # beforeEach: resets all Prisma mocks
    ├── mocks/
    │   ├── db.ts                     # Mock Prisma client (all models)
    │   ├── scheduling.ts             # Mock scheduling functions
    │   └── utils.ts                  # Mock utility functions
    ├── validate.test.ts              # Zod schema validation tests
    ├── functions.test.ts             # Function definition structure tests
    ├── resolve.test.ts               # Entity resolver tests
    └── executor.test.ts              # Handler + pipeline smoke tests
```

All tests use mocked dependencies (no database required). The `setup.ts` file resets mocks between every test to prevent cross-contamination.

---

## Test Files

### 1. validate.test.ts — Zod Schema Validation (57 tests)

Tests that every AI function's arguments are validated correctly before execution. If a schema rejects bad input, the handler never runs.

| Test Group | What It Covers |
|---|---|
| `unknown functions` | Backward compat: unknown function names pass through |
| `create_service` | Required fields (name, duration, price), min values, optional fields |
| `update_service` | Partial updates, empty object (all optional) |
| `delete_service` | Accepts serviceId or serviceName |
| `create_client` | Required firstName, invalid email rejection, empty email opt-out, tags |
| `search_clients` | Required query, rejects empty string |
| `create_appointment` | Required dateTime |
| `search_appointments` | Date filter, status enum, invalid status rejection |
| `reschedule_appointment` | Required appointmentId + newDateTime |
| `cancel_appointment` | Required appointmentId |
| `bulk_reschedule` | Required sourceDate + targetDate, optional filters |
| `bulk_cancel` | Required date |
| `create_recurring_appointment` | Required frequency + preferredTime + startDate, invalid frequency |
| `create_package` | Visit pack, membership, negative price rejection |
| `create_campaign` | Required name + type, invalid type/channel rejection |
| `create_intake_form` | Valid fields array, missing fields rejection |
| `get_analytics` | Valid metric enum, invalid metric rejection |
| `get_business_info` | Valid infoType enum, invalid infoType rejection |
| `escalate_to_human` | Required reason, empty reason rejection |
| `get_payroll_summary` | Valid period enum, invalid period, all-optional |
| `get_revenue_report` | Valid period + groupBy, invalid groupBy |
| `add_to_waitlist` | Valid input, all-optional |
| `update_service_fees` | Valid input, invalid deposit type |

**When to update:** Add a test group whenever a new Zod schema is added to `validate.ts`.

### 2. functions.test.ts — Function Definition Structure (54 tests)

Tests that every function the LLM can call has a properly structured definition. This is the contract between the AI model and the code.

| Test Group | What It Covers |
|---|---|
| `BUSINESS_FUNCTIONS` | Has 35+ definitions, each has name/description/parameters |
| No duplicate names | Every function name is unique |
| Required functions exist | All 38 critical function names are present |
| Required fields declared | `create_service` requires name/duration/price, etc. |
| `CLIENT_FUNCTIONS` | Has 7+ definitions, all 7 critical names present |

**When to update:** Add the new function name to `requiredFunctions` array whenever a handler is added to the executor.

### 3. resolve.test.ts — Entity Resolution (21 tests)

Tests the shared resolver module that converts names/IDs to database entities. Every resolver follows the pattern: ID lookup -> name search -> 0=notFound, 1=ok, 2+=ambiguous.

| Test Group | What It Covers |
|---|---|
| `resolveClient` | By ID, not found, single match by name, no matches, ambiguous (2+), exact narrowing, missing input |
| `resolveService` | By ID, single match, ambiguous, exact narrowing, missing input |
| `resolveStaff` | By ID, single match, ambiguous |
| `resolvePackage` | By ID, not found, missing input |
| `resolveCampaign` | By ID, single match, missing input |
| `getOrgTimezone` | Returns timezone, defaults to America/New_York |

**When to update:** Add a test group when a new resolver is added to `resolve.ts`.

### 4. executor.test.ts — Handler + Pipeline Smoke Tests (27 tests)

End-to-end tests through the full execution pipeline: `executeFunctionCall()` -> validation -> handler -> response.

| Test Group | What It Covers |
|---|---|
| **Pipeline** | Unknown function rejection, validation failure, DB crash handling |
| `create_service` | Creates service, returns formatted message with price |
| `update_service` | Updates price, rejects empty update |
| `delete_service` | Confirmation gate (asks first), executes when confirmed |
| `create_client` | Creates client, rejects duplicate email |
| `search_clients` | Returns matches, handles no results |
| `confirm_appointment` | Confirms and returns formatted message |
| `create_package` | Creates visit pack with correct message |
| `create_campaign` | Creates in DRAFT status |
| `update_campaign_status` | Activates campaign |
| `get_analytics` | Returns revenue analytics |
| `get_business_info` | Returns hours with day names |
| `escalate_to_human` | Escalates and logs action |
| `bulk_cancel` | Confirmation gate with count |
| `bulk_reschedule` | Confirmation gate |

**When to update:** Add a test for every new handler in `executor.ts`. At minimum test: (1) happy path, (2) entity not found, (3) confirmation gate if destructive.

---

## Adding Tests for New Features

When you add a new AI function (e.g., `send_invoice`), you must update **4 files**:

### Step 1: Add Zod schema → `validate.ts`
```typescript
send_invoice: z.object({
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  amount: z.number().min(0),
}),
```

### Step 2: Add function definition → `functions.ts`
```typescript
{
  name: "send_invoice",
  description: "Send an invoice to a client",
  parameters: { ... },
},
```

### Step 3: Add handler → `executor.ts`
```typescript
async function handleSendInvoice(args: Args, orgId: string): Promise<FunctionCallResult> { ... }
```
And register it: `send_invoice: handleSendInvoice,`

### Step 4: Add tests → update all 4 test files

**validate.test.ts** — add:
```typescript
describe("send_invoice", () => {
  it("accepts valid input", () => { ... });
  it("rejects negative amount", () => { ... });
});
```

**functions.test.ts** — add `"send_invoice"` to the `requiredFunctions` array.

**resolve.test.ts** — add tests if you created a new resolver.

**executor.test.ts** — add:
```typescript
describe("send_invoice handler", () => {
  it("sends invoice and returns success", async () => { ... });
  it("fails when client not found", async () => { ... });
});
```

### Step 5: Run the full suite
```bash
cd packages/ai && npx vitest run
```

All tests must pass. If any fail, fix the issue before committing.

---

## Test Mocking Strategy

All external dependencies are aliased in `vitest.config.ts`:
- `@bookai/db` → `src/__tests__/mocks/db.ts` (mock Prisma with `vi.fn()`)
- `@bookai/scheduling` → `src/__tests__/mocks/scheduling.ts`
- `@bookai/utils` → `src/__tests__/mocks/utils.ts`

Mocks reset automatically before each test via `setup.ts`. To set up a specific mock return:

```typescript
// Mock a single call
(prisma.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "c1", ... });

// Mock to throw
(prisma.service.count as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DB down"));
```

---

## Current Test Count

| File | Tests | Status |
|---|---|---|
| validate.test.ts | 57 | Passing |
| functions.test.ts | 54 | Passing |
| resolve.test.ts | 21 | Passing |
| executor.test.ts | 27 | Passing |
| **Total** | **159** | **All passing** |

Last verified: 2026-04-11
