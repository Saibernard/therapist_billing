import { describe, it, expect, vi } from "vitest";
import { prisma } from "./mocks/db";
import { executeFunctionCall } from "../executor";

const ORG_ID = "org-test-123";

// ─── Pipeline: entry point ──────────────────────────────────

describe("executeFunctionCall — pipeline", () => {
  it("rejects unknown function name", async () => {
    const result = await executeFunctionCall("nonexistent_function", {}, ORG_ID);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unknown function");
  });

  it("rejects invalid args before hitting handler", async () => {
    // create_service requires name, durationMinutes, price
    const result = await executeFunctionCall("create_service", {}, ORG_ID);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Invalid parameters");
  });

  it("catches handler exceptions gracefully", async () => {
    // Make prisma.service.count throw to simulate a DB crash
    (prisma.service.count as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DB connection lost"));

    const result = await executeFunctionCall(
      "create_service",
      { name: "Test", durationMinutes: 30, price: 50 },
      ORG_ID,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("DB connection lost");
  });
});

// ─── Service handlers ───────────────────────────────────────

describe("create_service handler", () => {
  it("creates a service and returns success", async () => {
    (prisma.service.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);
    (prisma.service.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "svc-new",
      name: "Deep Tissue Massage",
      durationMinutes: 60,
      price: 120,
    });

    const result = await executeFunctionCall(
      "create_service",
      { name: "Deep Tissue Massage", durationMinutes: 60, price: 120 },
      ORG_ID,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("Deep Tissue Massage");
    expect(result.message).toContain("$120.00");
    expect(prisma.service.create).toHaveBeenCalledOnce();
  });
});

describe("update_service handler", () => {
  it("updates service price", async () => {
    // resolveService: findMany returns one match
    (prisma.service.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "svc-1", name: "Haircut", durationMinutes: 30, bufferMinutes: 0, price: 50, maxCapacity: 1, category: null },
    ]);
    (prisma.service.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "svc-1",
      name: "Haircut",
      price: 60,
    });

    const result = await executeFunctionCall(
      "update_service",
      { serviceName: "Haircut", price: 60 },
      ORG_ID,
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("Haircut");
  });

  it("returns error when no fields to update", async () => {
    (prisma.service.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "svc-1", name: "Haircut", durationMinutes: 30, bufferMinutes: 0, price: 50, maxCapacity: 1, category: null },
    ]);

    const result = await executeFunctionCall(
      "update_service",
      { serviceName: "Haircut" },
      ORG_ID,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("No fields to update");
  });
});

describe("delete_service handler", () => {
  it("asks for confirmation first", async () => {
    (prisma.service.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "svc-1", name: "Old Service", durationMinutes: 30, bufferMinutes: 0, price: 50, maxCapacity: 1, category: null },
    ]);
    (prisma.appointment.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5);

    const result = await executeFunctionCall(
      "delete_service",
      { serviceName: "Old Service" },
      ORG_ID,
    );
    expect(result.success).toBe(false);
    expect(result.needsConfirmation).toBe(true);
    expect(result.confirmationSummary).toContain("5 upcoming");
  });

  it("deletes when confirmed", async () => {
    (prisma.service.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "svc-1", name: "Old Service", durationMinutes: 30, bufferMinutes: 0, price: 50, maxCapacity: 1, category: null },
    ]);

    const result = await executeFunctionCall(
      "delete_service",
      { serviceName: "Old Service", confirmed: true },
      ORG_ID,
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("Deactivated");
    expect(prisma.service.update).toHaveBeenCalled();
  });
});

// ─── Client handlers ────────────────────────────────────────

describe("create_client handler", () => {
  it("creates a client", async () => {
    (prisma.client.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "c-new",
      firstName: "John",
      lastName: "Smith",
      email: "john@test.com",
    });

    const result = await executeFunctionCall(
      "create_client",
      { firstName: "John", lastName: "Smith", email: "john@test.com" },
      ORG_ID,
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("John");
  });

  it("rejects duplicate email", async () => {
    (prisma.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "c-existing",
      firstName: "Existing",
      lastName: "Client",
    });

    const result = await executeFunctionCall(
      "create_client",
      { firstName: "John", email: "existing@test.com" },
      ORG_ID,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("already exists");
  });
});

describe("search_clients handler", () => {
  it("returns matching clients", async () => {
    (prisma.client.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "c1", firstName: "Jane", lastName: "Doe", email: "jane@test.com", phone: "555-1234", tags: "[]" },
    ]);

    const result = await executeFunctionCall(
      "search_clients",
      { query: "Jane" },
      ORG_ID,
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("1 client");
  });

  it("returns no results message", async () => {
    (prisma.client.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await executeFunctionCall(
      "search_clients",
      { query: "Nobody" },
      ORG_ID,
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("No clients found");
  });
});

// ─── Appointment lifecycle ──────────────────────────────────

describe("confirm_appointment handler", () => {
  it("confirms an appointment", async () => {
    (prisma.appointment.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "appt-1",
      status: "CONFIRMED",
      startTime: new Date("2026-04-15T10:00:00Z"),
      endTime: new Date("2026-04-15T11:00:00Z"),
      service: { name: "Haircut" },
    });

    const result = await executeFunctionCall(
      "confirm_appointment",
      { appointmentId: "appt-1" },
      ORG_ID,
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("Confirmed");
  });
});

// ─── Package handlers ───────────────────────────────────────

describe("create_package handler", () => {
  it("creates a visit pack", async () => {
    (prisma.package.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "pkg-1",
      name: "10-Session Pack",
      type: "VISIT_PACK",
      price: 500,
      totalVisits: 10,
      billingInterval: null,
    });

    const result = await executeFunctionCall(
      "create_package",
      { name: "10-Session Pack", type: "VISIT_PACK", price: 500, totalVisits: 10 },
      ORG_ID,
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("10-Session Pack");
    expect(result.message).toContain("$500.00");
  });
});

// ─── Campaign handlers ──────────────────────────────────────

describe("create_campaign handler", () => {
  it("creates a campaign in DRAFT", async () => {
    (prisma.campaign.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "camp-1",
      name: "Birthday Special",
      type: "BIRTHDAY",
      channel: "EMAIL",
      status: "DRAFT",
    });

    const result = await executeFunctionCall(
      "create_campaign",
      { name: "Birthday Special", type: "BIRTHDAY", channel: "EMAIL" },
      ORG_ID,
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("Birthday Special");
    expect(result.message).toContain("DRAFT");
  });
});

describe("update_campaign_status handler", () => {
  it("activates a campaign", async () => {
    (prisma.campaign.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "camp-1", name: "Birthday Special", type: "BIRTHDAY", status: "DRAFT", channel: "EMAIL" },
    ]);
    (prisma.campaign.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "camp-1",
      name: "Birthday Special",
      status: "ACTIVE",
    });

    const result = await executeFunctionCall(
      "update_campaign_status",
      { campaignName: "Birthday Special", status: "ACTIVE" },
      ORG_ID,
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("ACTIVE");
  });
});

// ─── Analytics & Info ───────────────────────────────────────

describe("get_analytics handler", () => {
  it("returns revenue analytics", async () => {
    (prisma.appointment.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(50);
    (prisma.appointment.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ _sum: { totalAmount: 5000 } });

    const result = await executeFunctionCall(
      "get_analytics",
      { metric: "revenue", period: "this_month" },
      ORG_ID,
    );
    expect(result.success).toBe(true);
  });
});

describe("get_business_info handler", () => {
  it("returns business hours", async () => {
    (prisma.organization.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: ORG_ID,
      name: "Test Salon",
      address: "123 Main St",
      phone: "555-0000",
      email: "test@salon.com",
      services: [
        { id: "s1", name: "Haircut", durationMinutes: 30, price: 50 },
      ],
      staffMembers: [
        {
          id: "st1",
          displayName: "Sarah",
          schedules: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isAvailable: true },
          ],
        },
      ],
    });

    const result = await executeFunctionCall(
      "get_business_info",
      { infoType: "hours" },
      ORG_ID,
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("Mon");
  });
});

// ─── Escalation ─────────────────────────────────────────────

describe("escalate_to_human handler", () => {
  it("escalates and logs the action", async () => {
    const result = await executeFunctionCall(
      "escalate_to_human",
      { reason: "Customer needs billing help" },
      ORG_ID,
      "client-123",
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("business owner");
    expect(prisma.aiActionLog.create).toHaveBeenCalled();
  });
});

// ─── Bulk operations ────────────────────────────────────────

describe("bulk_cancel handler", () => {
  it("asks for confirmation first", async () => {
    (prisma.appointment.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "a1", client: { firstName: "Jane" }, service: { name: "Haircut" }, startTime: new Date() },
      { id: "a2", client: { firstName: "John" }, service: { name: "Massage" }, startTime: new Date() },
    ]);

    const result = await executeFunctionCall(
      "bulk_cancel",
      { date: "2026-04-15" },
      ORG_ID,
    );
    expect(result.success).toBe(false);
    expect(result.needsConfirmation).toBe(true);
    expect(result.confirmationSummary).toContain("2");
  });
});

describe("bulk_reschedule handler", () => {
  it("asks for confirmation first", async () => {
    (prisma.appointment.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "a1", startTime: new Date("2026-04-15T10:00:00Z"), endTime: new Date("2026-04-15T11:00:00Z"), client: { firstName: "Jane" }, service: { name: "Cut" } },
    ]);

    const result = await executeFunctionCall(
      "bulk_reschedule",
      { sourceDate: "2026-04-15", targetDate: "2026-04-16" },
      ORG_ID,
    );
    expect(result.success).toBe(false);
    expect(result.needsConfirmation).toBe(true);
  });
});
