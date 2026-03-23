import { NextResponse } from "next/server";
import { prisma } from "@bookai/db";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = (session as { organizationId?: string }).organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const [org, clients, appointments, services, staff, communications, reviews] =
    await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId } }),
      prisma.client.findMany({ where: { organizationId: orgId } }),
      prisma.appointment.findMany({
        where: { organizationId: orgId },
        include: { service: true, client: true, staffMember: true },
      }),
      prisma.service.findMany({ where: { organizationId: orgId } }),
      prisma.staffMember.findMany({
        where: { organizationId: orgId },
        include: { schedules: true },
      }),
      prisma.communicationLog.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
      prisma.review.findMany({ where: { organizationId: orgId } }),
    ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    organization: org,
    clients,
    appointments: appointments.map((a) => ({
      ...a,
      serviceName: a.service.name,
      clientName: `${a.client.firstName} ${a.client.lastName || ""}`.trim(),
      staffName: a.staffMember.displayName,
    })),
    services,
    staff,
    communications,
    reviews,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="bookai-export-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
