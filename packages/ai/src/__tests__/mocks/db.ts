/**
 * Mock Prisma client for unit tests.
 *
 * Every model method returns a vi.fn() so tests can set return values
 * with mockResolvedValueOnce().  The default return is undefined/null
 * which mirrors "not found" behavior.
 */
import { vi } from "vitest";

function mockModel() {
  return {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockRejectedValue(new Error("Not found")),
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "mock-id", ...data })),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "mock-id", ...data })),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
    groupBy: vi.fn().mockResolvedValue([]),
  };
}

export const prisma = {
  client: mockModel(),
  service: mockModel(),
  staffMember: mockModel(),
  staffSchedule: mockModel(),
  staffService: mockModel(),
  appointment: mockModel(),
  organization: mockModel(),
  package: mockModel(),
  clientPackage: mockModel(),
  campaign: mockModel(),
  campaignExecution: mockModel(),
  intakeForm: mockModel(),
  intakeFormServiceLink: mockModel(),
  waitlistEntry: mockModel(),
  recurrenceRule: mockModel(),
  scheduleOverride: mockModel(),
  aiConversation: mockModel(),
  aiActionLog: mockModel(),
  communicationLog: mockModel(),
};

/** Reset all mocks between tests */
export function resetPrismaMocks() {
  for (const model of Object.values(prisma)) {
    for (const method of Object.values(model)) {
      if (typeof method === "function" && "mockReset" in method) {
        (method as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
  // Re-apply sensible defaults after reset
  for (const model of Object.values(prisma)) {
    (model.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (model.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (model.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (model.create as ReturnType<typeof vi.fn>).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "mock-id", ...data })
    );
    (model.update as ReturnType<typeof vi.fn>).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "mock-id", ...data })
    );
    (model.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  }
}
