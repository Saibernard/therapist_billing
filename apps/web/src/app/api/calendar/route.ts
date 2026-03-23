import { NextResponse } from "next/server";
import { prisma } from "@bookai/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("org");

  if (!slug) {
    return NextResponse.json(
      { error: "Missing org parameter" },
      { status: 400 }
    );
  }

  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 }
    );
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAhead = new Date();
  ninetyDaysAhead.setDate(ninetyDaysAhead.getDate() + 90);

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId: org.id,
      startTime: { gte: thirtyDaysAgo, lte: ninetyDaysAhead },
      status: { in: ["CONFIRMED", "PENDING"] },
    },
    include: { client: true, service: true, staffMember: true },
    orderBy: { startTime: "asc" },
  });

  function formatICSDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  const events = appointments.map((a) => {
    const clientName =
      `${a.client.firstName} ${a.client.lastName || ""}`.trim();
    return [
      "BEGIN:VEVENT",
      `UID:${a.id}@bookai`,
      `DTSTART:${formatICSDate(a.startTime)}`,
      `DTEND:${formatICSDate(a.endTime)}`,
      `SUMMARY:${a.service.name} - ${clientName}`,
      `DESCRIPTION:Client: ${clientName}\\nStaff: ${a.staffMember.displayName}\\nStatus: ${a.status}${a.notes ? "\\nNotes: " + a.notes : ""}`,
      `LOCATION:${org.address || ""}`,
      `STATUS:CONFIRMED`,
      "END:VEVENT",
    ].join("\r\n");
  });

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//BookAI//${org.name}//EN`,
    `X-WR-CALNAME:${org.name} Appointments`,
    `X-WR-TIMEZONE:${org.timezone}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${org.slug}-calendar.ics"`,
    },
  });
}
