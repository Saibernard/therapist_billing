import { NextResponse } from "next/server";
import { prisma } from "@bookai/db";
import { createAppointment, rescheduleAppointment } from "@bookai/scheduling";
import {
  sendEmail,
  buildConfirmationEmail,
  sendSms,
  buildConfirmationSms,
  buildRescheduleBookingUrl,
  verifyRescheduleToken,
} from "@bookai/communications";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const bookingSchema = z.object({
  organizationId: z.string().min(1),
  serviceId: z.string().min(1),
  staffMemberId: z.string().min(1),
  startTime: z.string().datetime(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().max(500).optional(),
  rescheduleToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();

    const parsed = bookingSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid booking data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const body = parsed.data;

    if (!body.email && !body.phone) {
      return NextResponse.json(
        { error: "At least email or phone is required." },
        { status: 400 }
      );
    }

    const rateLimitKey = body.email || body.phone || "unknown";
    const { allowed } = checkRateLimit(`booking:${rateLimitKey}`, 10, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many booking attempts. Please try again later." },
        { status: 429 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: body.organizationId },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const bookingPage = await prisma.bookingPage.findUnique({
      where: { organizationId: body.organizationId },
    });

    const service = await prisma.service.findFirst({
      where: {
        id: body.serviceId,
        organizationId: body.organizationId,
        isActive: true,
      },
    });
    if (!service) {
      return NextResponse.json(
        { error: "Service not found or inactive" },
        { status: 404 }
      );
    }

    const staffMember = await prisma.staffMember.findFirst({
      where: {
        id: body.staffMemberId,
        organizationId: body.organizationId,
        isActive: true,
      },
    });
    if (!staffMember) {
      return NextResponse.json(
        { error: "Staff member not found" },
        { status: 404 }
      );
    }

    let client: Awaited<ReturnType<typeof prisma.client.findFirst>> | null = null;
    let appointment: Awaited<ReturnType<typeof createAppointment>>;
    let isReschedule = false;
    let sourceAppointmentId: string | null = null;

    if (body.rescheduleToken) {
      const tokenPayload = verifyRescheduleToken(body.rescheduleToken);
      if (!tokenPayload) {
        return NextResponse.json(
          { error: "This reschedule link is invalid or expired." },
          { status: 400 }
        );
      }
      if (tokenPayload.o !== body.organizationId) {
        return NextResponse.json(
          { error: "This reschedule link does not match this booking page." },
          { status: 400 }
        );
      }

      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          id: tokenPayload.a,
          organizationId: tokenPayload.o,
          clientId: tokenPayload.c,
        },
        include: {
          client: true,
          service: true,
          staffMember: true,
        },
      });

      if (!existingAppointment) {
        return NextResponse.json(
          { error: "Original appointment not found for this reschedule link." },
          { status: 404 }
        );
      }
      if (existingAppointment.serviceId !== body.serviceId) {
        return NextResponse.json(
          { error: "Reschedule link must keep the same service." },
          { status: 400 }
        );
      }
      if (existingAppointment.status === "CANCELLED") {
        return NextResponse.json(
          { error: "This appointment is already cancelled and cannot be rescheduled." },
          { status: 400 }
        );
      }

      client = existingAppointment.client;
      sourceAppointmentId = existingAppointment.id;
      await prisma.client.update({
        where: { id: client.id },
        data: {
          firstName: body.firstName,
          ...(body.lastName && { lastName: body.lastName }),
          ...(body.email && { email: body.email }),
          ...(body.phone && { phone: body.phone }),
        },
      });

      appointment = await rescheduleAppointment(
        existingAppointment.id,
        new Date(body.startTime),
        body.staffMemberId
      );
      isReschedule = true;
    } else {
      // Smart client matching: try email first, then phone, then create
      if (body.email) {
        client = await prisma.client.findUnique({
          where: {
            organizationId_email: {
              organizationId: body.organizationId,
              email: body.email,
            },
          },
        });
      }

      if (!client && body.phone) {
        client = await prisma.client.findFirst({
          where: {
            organizationId: body.organizationId,
            phone: body.phone,
          },
        });
      }

      if (client) {
        await prisma.client.update({
          where: { id: client.id },
          data: {
            firstName: body.firstName,
            ...(body.lastName && { lastName: body.lastName }),
            ...(body.email && !client.email && { email: body.email }),
            ...(body.phone && !client.phone && { phone: body.phone }),
          },
        });
      } else {
        client = await prisma.client.create({
          data: {
            organizationId: body.organizationId,
            email: body.email || undefined,
            firstName: body.firstName,
            lastName: body.lastName,
            phone: body.phone || undefined,
            source: "BOOKING_PAGE",
          },
        });
      }

      appointment = await createAppointment({
        organizationId: body.organizationId,
        clientId: client.id,
        serviceId: body.serviceId,
        staffMemberId: body.staffMemberId,
        startTime: new Date(body.startTime),
        source: "BOOKING_PAGE",
      });
    }

    if (!client) {
      throw new Error("Client lookup failed");
    }

    // Send confirmation via the channel they provided (fire-and-forget)
    if (body.email) {
      const rescheduleUrl = buildRescheduleBookingUrl({
        slug: org.slug,
        organizationId: body.organizationId,
        clientId: client.id,
        appointmentId: appointment.id,
      });
      const emailContent = buildConfirmationEmail({
        client: { firstName: body.firstName },
        service: {
          name: service.name,
          durationMinutes: service.durationMinutes,
        },
        staffMember: { displayName: staffMember.displayName },
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        organization: {
          name: org.name,
          address: org.address,
          phone: org.phone,
        },
        rescheduleUrl,
      });

      sendEmail({
        to: body.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        organizationId: body.organizationId,
        clientId: client.id,
        appointmentId: appointment.id,
        messageType: "CONFIRMATION",
      }).catch((err) => {
        console.error("[BOOKING] Failed to send confirmation email:", err);
      });
    } else if (body.phone) {
      const smsContent = buildConfirmationSms({
        client: { firstName: body.firstName },
        service: { name: service.name },
        staffMember: { displayName: staffMember.displayName },
        startTime: appointment.startTime,
        organization: { name: org.name },
      });

      sendSms({
        to: body.phone,
        body: smsContent,
        organizationId: body.organizationId,
        clientId: client.id,
        appointmentId: appointment.id,
        messageType: "CONFIRMATION",
      }).catch((err) => {
        console.error("[BOOKING] Failed to send confirmation SMS:", err);
      });
    }

    if (!isReschedule && bookingPage?.requirePayment && process.env.STRIPE_SECRET_KEY) {
      const { createCheckoutSession } = await import("@bookai/communications");
      const slug = org.slug;
      const checkoutUrl = await createCheckoutSession({
        organizationId: body.organizationId,
        appointmentId: appointment.id,
        clientId: client.id,
        amount: Number(service.price),
        currency: "usd",
        serviceName: service.name,
        successUrl: `${process.env.NEXTAUTH_URL || "http://localhost:3456"}/b/${slug}?success=1`,
        cancelUrl: `${process.env.NEXTAUTH_URL || "http://localhost:3456"}/b/${slug}?cancelled=1`,
      });

      if (checkoutUrl) {
        return NextResponse.json({
          success: true,
          appointmentId: appointment.id,
          checkoutUrl,
        });
      }
    }

    return NextResponse.json({
      appointment: {
        id: appointment.id,
        sourceAppointmentId,
        wasRescheduled: isReschedule,
        startTime: appointment.startTime.toISOString(),
        endTime: appointment.endTime.toISOString(),
        service: {
          name: appointment.service.name,
          durationMinutes: appointment.service.durationMinutes,
        },
        staffMember: {
          displayName: appointment.staffMember.displayName,
        },
      },
    });
  } catch (err) {
    console.error("[BOOKING] Error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    const isConflict = message.includes("conflict");
    return NextResponse.json(
      { error: isConflict ? "This time slot is no longer available. Please choose another time." : message },
      { status: isConflict ? 409 : 500 }
    );
  }
}
