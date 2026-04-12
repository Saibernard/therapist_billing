import { describe, it, expect, vi } from "vitest";
import { prisma } from "./mocks/db";
import {
  resolveClient,
  resolveService,
  resolveStaff,
  resolvePackage,
  resolveAppointment,
  resolveCampaign,
  getOrgTimezone,
} from "../resolve";

const ORG_ID = "org-test-123";

// ─── resolveClient ──────────────────────────────────────────

describe("resolveClient", () => {
  it("returns client by ID", async () => {
    const mockClient = { id: "c1", firstName: "Jane", lastName: "Doe", email: "jane@test.com", phone: "555-1234" };
    (prisma.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockClient);

    const result = await resolveClient(ORG_ID, { clientId: "c1" });
    expect(result.found).toBe(true);
    if (result.found) expect(result.data.firstName).toBe("Jane");
  });

  it("returns not found when ID doesn't exist", async () => {
    (prisma.client.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await resolveClient(ORG_ID, { clientId: "nonexistent" });
    expect(result.found).toBe(false);
    if (!result.found) expect(result.error).toContain("No client found");
  });

  it("returns single match by name", async () => {
    const mockClient = { id: "c1", firstName: "Jane", lastName: "Doe", email: null, phone: null };
    (prisma.client.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockClient]);

    const result = await resolveClient(ORG_ID, { clientName: "Jane Doe" });
    expect(result.found).toBe(true);
    if (result.found) expect(result.data.id).toBe("c1");
  });

  it("returns not found when no name matches", async () => {
    (prisma.client.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await resolveClient(ORG_ID, { clientName: "Nobody" });
    expect(result.found).toBe(false);
    if (!result.found) expect(result.error).toContain("No client found");
  });

  it("returns ambiguous when multiple matches", async () => {
    const clients = [
      { id: "c1", firstName: "Jane", lastName: "Doe", email: null, phone: null },
      { id: "c2", firstName: "Jane", lastName: "Smith", email: null, phone: null },
    ];
    (prisma.client.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(clients);

    const result = await resolveClient(ORG_ID, { clientName: "Jane" });
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.error).toContain("Multiple");
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("narrows to exact first+last match from ambiguous", async () => {
    const clients = [
      { id: "c1", firstName: "Jane", lastName: "Doe", email: null, phone: null },
      { id: "c2", firstName: "Jane", lastName: "Smith", email: null, phone: null },
    ];
    (prisma.client.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(clients);

    const result = await resolveClient(ORG_ID, { clientName: "Jane Doe" });
    expect(result.found).toBe(true);
    if (result.found) expect(result.data.id).toBe("c1");
  });

  it("requires name or ID", async () => {
    const result = await resolveClient(ORG_ID, {});
    expect(result.found).toBe(false);
    if (!result.found) expect(result.error).toContain("provide a client name or ID");
  });
});

// ─── resolveService ─────────────────────────────────────────

describe("resolveService", () => {
  it("returns service by ID", async () => {
    const mockService = { id: "s1", name: "Haircut", durationMinutes: 30, bufferMinutes: 0, price: 50, maxCapacity: 1, category: null };
    (prisma.service.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockService);

    const result = await resolveService(ORG_ID, { serviceId: "s1" });
    expect(result.found).toBe(true);
    if (result.found) expect(result.data.name).toBe("Haircut");
  });

  it("returns single match by name", async () => {
    const mockService = { id: "s1", name: "Haircut", durationMinutes: 30, bufferMinutes: 0, price: 50, maxCapacity: 1, category: null };
    (prisma.service.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockService]);

    const result = await resolveService(ORG_ID, { serviceName: "Haircut" });
    expect(result.found).toBe(true);
  });

  it("returns ambiguous for multiple service matches", async () => {
    const services = [
      { id: "s1", name: "Haircut Regular", durationMinutes: 30, bufferMinutes: 0, price: 30, maxCapacity: 1, category: null },
      { id: "s2", name: "Haircut Premium", durationMinutes: 45, bufferMinutes: 0, price: 50, maxCapacity: 1, category: null },
    ];
    (prisma.service.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(services);

    const result = await resolveService(ORG_ID, { serviceName: "Haircut" });
    expect(result.found).toBe(false);
    if (!result.found) expect(result.candidates).toHaveLength(2);
  });

  it("narrows to exact name match", async () => {
    const services = [
      { id: "s1", name: "Haircut", durationMinutes: 30, bufferMinutes: 0, price: 30, maxCapacity: 1, category: null },
      { id: "s2", name: "Haircut Premium", durationMinutes: 45, bufferMinutes: 0, price: 50, maxCapacity: 1, category: null },
    ];
    (prisma.service.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(services);

    const result = await resolveService(ORG_ID, { serviceName: "Haircut" });
    expect(result.found).toBe(true);
    if (result.found) expect(result.data.id).toBe("s1");
  });

  it("requires name or ID", async () => {
    const result = await resolveService(ORG_ID, {});
    expect(result.found).toBe(false);
  });
});

// ─── resolveStaff ───────────────────────────────────────────

describe("resolveStaff", () => {
  it("returns staff by ID", async () => {
    const mockStaff = { id: "st1", displayName: "Dr. Smith" };
    (prisma.staffMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStaff);

    const result = await resolveStaff(ORG_ID, { staffMemberId: "st1" });
    expect(result.found).toBe(true);
    if (result.found) expect(result.data.displayName).toBe("Dr. Smith");
  });

  it("returns single match by name", async () => {
    const mockStaff = [{ id: "st1", displayName: "Dr. Smith", isActive: true }];
    (prisma.staffMember.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStaff);

    const result = await resolveStaff(ORG_ID, { staffName: "Smith" });
    expect(result.found).toBe(true);
  });

  it("returns ambiguous for multiple staff matches", async () => {
    const staff = [
      { id: "st1", displayName: "Sarah Smith", isActive: true },
      { id: "st2", displayName: "Sam Smith", isActive: true },
    ];
    (prisma.staffMember.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(staff);

    const result = await resolveStaff(ORG_ID, { staffName: "Smith" });
    expect(result.found).toBe(false);
    if (!result.found) expect(result.candidates).toHaveLength(2);
  });
});

// ─── resolvePackage ─────────────────────────────────────────

describe("resolvePackage", () => {
  it("returns package by ID", async () => {
    const mockPkg = { id: "pkg1", name: "10-Pack", type: "VISIT_PACK", price: 500, totalVisits: 10, validDays: null, billingInterval: null };
    (prisma.package.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockPkg);

    const result = await resolvePackage(ORG_ID, { packageId: "pkg1" });
    expect(result.found).toBe(true);
    if (result.found) expect(result.data.name).toBe("10-Pack");
  });

  it("returns not found for unknown package", async () => {
    (prisma.package.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await resolvePackage(ORG_ID, { packageName: "Nonexistent" });
    expect(result.found).toBe(false);
  });

  it("requires name or ID", async () => {
    const result = await resolvePackage(ORG_ID, {});
    expect(result.found).toBe(false);
    if (!result.found) expect(result.error).toContain("provide a package name or ID");
  });
});

// ─── resolveCampaign ────────────────────────────────────────

describe("resolveCampaign", () => {
  it("returns campaign by ID", async () => {
    const mock = { id: "camp1", name: "Birthday", type: "BIRTHDAY", status: "DRAFT", channel: "EMAIL" };
    (prisma.campaign.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

    const result = await resolveCampaign(ORG_ID, { campaignId: "camp1" });
    expect(result.found).toBe(true);
  });

  it("returns single match by name", async () => {
    const mock = [{ id: "camp1", name: "Birthday", type: "BIRTHDAY", status: "DRAFT", channel: "EMAIL" }];
    (prisma.campaign.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

    const result = await resolveCampaign(ORG_ID, { campaignName: "Birthday" });
    expect(result.found).toBe(true);
  });

  it("requires name or ID", async () => {
    const result = await resolveCampaign(ORG_ID, {});
    expect(result.found).toBe(false);
  });
});

// ─── getOrgTimezone ─────────────────────────────────────────

describe("getOrgTimezone", () => {
  it("returns org timezone", async () => {
    (prisma.organization.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      timezone: "America/Chicago",
    });

    const tz = await getOrgTimezone(ORG_ID);
    expect(tz).toBe("America/Chicago");
  });

  it("defaults to America/New_York when timezone is null", async () => {
    (prisma.organization.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      timezone: null,
    });

    const tz = await getOrgTimezone(ORG_ID);
    expect(tz).toBe("America/New_York");
  });
});
