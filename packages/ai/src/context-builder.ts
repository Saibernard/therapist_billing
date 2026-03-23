import { prisma } from "@bookai/db";
import type { AiContext } from "@bookai/types";

export async function buildAiContext(
  organizationId: string,
  clientId?: string
): Promise<AiContext> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: {
      services: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      staffMembers: {
        where: { isActive: true },
        include: {
          staffServices: { include: { service: true } },
        },
      },
    },
  });

  let clientData: AiContext["clientId"] = undefined;
  let clientName: AiContext["clientName"] = undefined;
  let recentAppointments: AiContext["recentAppointments"] = undefined;

  if (clientId) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        appointments: {
          take: 5,
          orderBy: { startTime: "desc" },
          include: { service: true },
        },
      },
    });

    if (client) {
      clientData = client.id;
      clientName = `${client.firstName}${client.lastName ? ` ${client.lastName}` : ""}`;
      recentAppointments = client.appointments.map((a) => ({
        id: a.id,
        serviceName: a.service.name,
        startTime: a.startTime.toISOString(),
        status: a.status,
      }));
    }
  }

  return {
    organizationId: org.id,
    organizationName: org.name,
    timezone: org.timezone,
    services: org.services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      price: Number(s.price),
      category: s.category ?? undefined,
    })),
    staffMembers: org.staffMembers.map((sm) => ({
      id: sm.id,
      name: sm.displayName,
      services: sm.staffServices.map((ss) => ss.service.name),
    })),
    clientId: clientData,
    clientName,
    recentAppointments,
  };
}
