import { prisma } from "@bookai/db";

/**
 * Shared entity resolution module.
 *
 * Every resolver follows the same deterministic pattern:
 *   1. If an ID is provided, look up directly — fail if not found.
 *   2. If a name/query is provided, fuzzy-search within the org.
 *   3. 0 results  → return { found: false, error: "not found" }
 *   4. 1 result   → return { found: true, data: ... }
 *   5. 2+ results → return { found: false, error: "multiple found: A, B — be more specific", candidates: [...] }
 *
 * Callers never need to write their own search logic.
 */

// ── Result types ──────────────────────────────────────────────

export type ResolveOk<T> = { found: true; data: T };
export type ResolveFail = {
  found: false;
  error: string;
  candidates?: Array<{ id: string; label: string }>;
};
export type ResolveResult<T> = ResolveOk<T> | ResolveFail;

function ok<T>(data: T): ResolveOk<T> {
  return { found: true, data };
}

function notFound(entity: string, query: string): ResolveFail {
  return { found: false, error: `No ${entity} found matching "${query}".` };
}

function ambiguous(
  entity: string,
  candidates: Array<{ id: string; label: string }>
): ResolveFail {
  const names = candidates.map((c) => c.label).join(", ");
  return {
    found: false,
    error: `Multiple ${entity}s found: ${names}. Please be more specific.`,
    candidates,
  };
}

// ── Client ────────────────────────────────────────────────────

export interface ResolvedClient {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

export async function resolveClient(
  organizationId: string,
  opts: { clientId?: string; clientName?: string }
): Promise<ResolveResult<ResolvedClient>> {
  if (opts.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: opts.clientId, organizationId },
    });
    if (!client) return notFound("client", opts.clientId);
    return ok(client);
  }

  if (!opts.clientName) {
    return { found: false, error: "Please provide a client name or ID." };
  }

  const nameParts = opts.clientName.trim().split(/\s+/);
  const first = nameParts[0]!;
  const last = nameParts.length > 1 ? nameParts[nameParts.length - 1]! : undefined;

  const clients = await prisma.client.findMany({
    where: {
      organizationId,
      OR: [
        { firstName: { contains: first } },
        ...(last ? [{ lastName: { contains: last } }] : []),
        ...(opts.clientName.includes("@")
          ? [{ email: { contains: opts.clientName } }]
          : []),
      ],
    },
    take: 10,
  });

  if (clients.length === 0) return notFound("client", opts.clientName);
  if (clients.length === 1) return ok(clients[0]!);

  // Try to narrow: exact first+last match
  if (last) {
    const exact = clients.filter(
      (c) =>
        c.firstName.toLowerCase() === first.toLowerCase() &&
        c.lastName?.toLowerCase() === last.toLowerCase()
    );
    if (exact.length === 1) return ok(exact[0]!);
  }

  return ambiguous(
    "client",
    clients.map((c) => ({
      id: c.id,
      label: `${c.firstName} ${c.lastName ?? ""}`.trim(),
    }))
  );
}

// ── Service ───────────────────────────────────────────────────

export interface ResolvedService {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: number | any;
  maxCapacity: number;
  category: string | null;
}

export async function resolveService(
  organizationId: string,
  opts: { serviceId?: string; serviceName?: string }
): Promise<ResolveResult<ResolvedService>> {
  if (opts.serviceId) {
    const svc = await prisma.service.findFirst({
      where: { id: opts.serviceId, organizationId, isActive: true },
    });
    if (!svc) return notFound("service", opts.serviceId);
    return ok(svc);
  }

  if (!opts.serviceName) {
    return { found: false, error: "Please provide a service name or ID." };
  }

  const services = await prisma.service.findMany({
    where: {
      organizationId,
      isActive: true,
      name: { contains: opts.serviceName },
    },
    take: 10,
  });

  if (services.length === 0) return notFound("service", opts.serviceName);
  if (services.length === 1) return ok(services[0]!);

  // Exact name match
  const exact = services.filter(
    (s) => s.name.toLowerCase() === opts.serviceName!.toLowerCase()
  );
  if (exact.length === 1) return ok(exact[0]!);

  return ambiguous(
    "service",
    services.map((s) => ({ id: s.id, label: s.name }))
  );
}

// ── Staff ─────────────────────────────────────────────────────

export interface ResolvedStaff {
  id: string;
  displayName: string;
}

export async function resolveStaff(
  organizationId: string,
  opts: { staffMemberId?: string; staffName?: string }
): Promise<ResolveResult<ResolvedStaff>> {
  if (opts.staffMemberId) {
    const staff = await prisma.staffMember.findFirst({
      where: { id: opts.staffMemberId, organizationId },
    });
    if (!staff) return notFound("staff member", opts.staffMemberId);
    return ok({ id: staff.id, displayName: staff.displayName });
  }

  if (!opts.staffName) {
    return { found: false, error: "Please provide a staff name or ID." };
  }

  const staff = await prisma.staffMember.findMany({
    where: {
      organizationId,
      isActive: true,
      displayName: { contains: opts.staffName },
    },
    take: 10,
  });

  if (staff.length === 0) return notFound("staff member", opts.staffName);
  if (staff.length === 1)
    return ok({ id: staff[0]!.id, displayName: staff[0]!.displayName });

  const exact = staff.filter(
    (s) => s.displayName.toLowerCase() === opts.staffName!.toLowerCase()
  );
  if (exact.length === 1)
    return ok({ id: exact[0]!.id, displayName: exact[0]!.displayName });

  return ambiguous(
    "staff member",
    staff.map((s) => ({ id: s.id, label: s.displayName }))
  );
}

// ── Package ───────────────────────────────────────────────────

export interface ResolvedPackage {
  id: string;
  name: string;
  type: string;
  price: number | any;
  totalVisits: number | null;
  validDays: number | null;
  billingInterval: string | null;
}

export async function resolvePackage(
  organizationId: string,
  opts: { packageId?: string; packageName?: string }
): Promise<ResolveResult<ResolvedPackage>> {
  if (opts.packageId) {
    const pkg = await prisma.package.findFirst({
      where: { id: opts.packageId, organizationId, isActive: true },
    });
    if (!pkg) return notFound("package", opts.packageId);
    return ok(pkg);
  }

  if (!opts.packageName) {
    return { found: false, error: "Please provide a package name or ID." };
  }

  const packages = await prisma.package.findMany({
    where: {
      organizationId,
      isActive: true,
      name: { contains: opts.packageName },
    },
    take: 10,
  });

  if (packages.length === 0) return notFound("package", opts.packageName);
  if (packages.length === 1) return ok(packages[0]!);

  const exact = packages.filter(
    (p) => p.name.toLowerCase() === opts.packageName!.toLowerCase()
  );
  if (exact.length === 1) return ok(exact[0]!);

  return ambiguous(
    "package",
    packages.map((p) => ({ id: p.id, label: p.name }))
  );
}

// ── Appointment ───────────────────────────────────────────────

export interface ResolvedAppointment {
  id: string;
  clientId: string;
  serviceId: string;
  staffMemberId: string;
  startTime: Date;
  endTime: Date;
  status: string;
  client: { firstName: string; lastName: string | null } | null;
  service: { name: string } | null;
  staffMember: { displayName: string } | null;
}

export async function resolveAppointment(
  organizationId: string,
  opts: {
    appointmentId?: string;
    clientName?: string;
    date?: string;
    status?: string;
  }
): Promise<ResolveResult<ResolvedAppointment>> {
  if (opts.appointmentId) {
    const appt = await prisma.appointment.findFirst({
      where: { id: opts.appointmentId, organizationId },
      include: { client: true, service: true, staffMember: true },
    });
    if (!appt) return notFound("appointment", opts.appointmentId);
    return ok(appt);
  }

  // Search by client name + date
  const where: Record<string, unknown> = { organizationId };

  if (opts.date) {
    const dayStart = new Date(`${opts.date}T00:00:00Z`);
    const dayEnd = new Date(`${opts.date}T23:59:59Z`);
    where.startTime = { gte: dayStart, lte: dayEnd };
  }

  if (opts.status) {
    where.status = opts.status;
  }

  if (opts.clientName) {
    const clientResult = await resolveClient(organizationId, {
      clientName: opts.clientName,
    });
    if (!clientResult.found) return { found: false, error: clientResult.error };
    where.clientId = clientResult.data.id;
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: { client: true, service: true, staffMember: true },
    orderBy: { startTime: "asc" },
    take: 10,
  });

  if (appointments.length === 0) {
    const desc = [
      opts.clientName && `for "${opts.clientName}"`,
      opts.date && `on ${opts.date}`,
      opts.status && `with status ${opts.status}`,
    ]
      .filter(Boolean)
      .join(" ");
    return notFound("appointment", desc || "given criteria");
  }

  if (appointments.length === 1) return ok(appointments[0]!);

  return ambiguous(
    "appointment",
    appointments.map((a) => ({
      id: a.id,
      label: `${a.client?.firstName ?? "?"} ${a.client?.lastName ?? ""} — ${a.service?.name ?? "?"} at ${a.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`.trim(),
    }))
  );
}

// ── Campaign ──────────────────────────────────────────────────

export interface ResolvedCampaign {
  id: string;
  name: string;
  type: string;
  status: string;
  channel: string;
}

export async function resolveCampaign(
  organizationId: string,
  opts: { campaignId?: string; campaignName?: string }
): Promise<ResolveResult<ResolvedCampaign>> {
  if (opts.campaignId) {
    const c = await prisma.campaign.findFirst({
      where: { id: opts.campaignId, organizationId },
    });
    if (!c) return notFound("campaign", opts.campaignId);
    return ok(c);
  }

  if (!opts.campaignName) {
    return { found: false, error: "Please provide a campaign name or ID." };
  }

  const campaigns = await prisma.campaign.findMany({
    where: {
      organizationId,
      name: { contains: opts.campaignName },
    },
    take: 10,
  });

  if (campaigns.length === 0) return notFound("campaign", opts.campaignName);
  if (campaigns.length === 1) return ok(campaigns[0]!);

  return ambiguous(
    "campaign",
    campaigns.map((c) => ({ id: c.id, label: c.name }))
  );
}

// ── Organization timezone helper ──────────────────────────────

export async function getOrgTimezone(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return org.timezone || "America/New_York";
}
