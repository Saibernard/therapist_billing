import { NextResponse } from "next/server";
import { prisma } from "@bookai/db";
import { verifyRescheduleToken } from "@bookai/communications";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const payload = verifyRescheduleToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired reschedule link." },
        { status: 400 }
      );
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: payload.a,
        organizationId: payload.o,
        clientId: payload.c,
      },
      include: {
        client: true,
        organization: true,
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { error: "Appointment not found for this reschedule link." },
        { status: 404 }
      );
    }

    if (appointment.status === "CANCELLED") {
      return NextResponse.json(
        { error: "This appointment is cancelled and cannot be rescheduled." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      appointment: {
        id: appointment.id,
        organizationId: appointment.organizationId,
        serviceId: appointment.serviceId,
        staffMemberId: appointment.staffMemberId,
        startTime: appointment.startTime.toISOString(),
        endTime: appointment.endTime.toISOString(),
      },
      client: {
        firstName: appointment.client.firstName,
        lastName: appointment.client.lastName,
        email: appointment.client.email,
        phone: appointment.client.phone,
      },
    });
  } catch (err) {
    console.error("[BOOKING] Failed to load reschedule context:", err);
    return NextResponse.json(
      { error: "Failed to load reschedule context." },
      { status: 500 }
    );
  }
}
