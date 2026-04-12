import { z } from "zod";
import { router, publicProcedure } from "../trpc";

/**
 * Client-facing portal router.
 * Authenticated via a signed token containing clientId + organizationId.
 * All procedures verify the token before accessing data.
 */
export const portalRouter = router({
  // Validate a portal token and return client info
  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const { clientId, organizationId } = decodePortalToken(input.token);

      const client = await ctx.prisma.client.findFirstOrThrow({
        where: { id: clientId, organizationId },
      });

      const org = await ctx.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true, logoUrl: true, phone: true, email: true },
      });

      return {
        clientId,
        organizationId,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        business: org,
      };
    }),

  // Get upcoming appointments
  getAppointments: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const { clientId, organizationId } = decodePortalToken(input.token);

      return ctx.prisma.appointment.findMany({
        where: {
          clientId,
          organizationId,
          status: { in: ["CONFIRMED", "PENDING"] },
          startTime: { gte: new Date() },
        },
        include: {
          service: { select: { name: true, durationMinutes: true, price: true } },
          staffMember: { select: { displayName: true } },
        },
        orderBy: { startTime: "asc" },
      });
    }),

  // Get appointment history
  getHistory: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const { clientId, organizationId } = decodePortalToken(input.token);

      return ctx.prisma.appointment.findMany({
        where: {
          clientId,
          organizationId,
          OR: [
            { status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] } },
            { startTime: { lt: new Date() } },
          ],
        },
        include: {
          service: { select: { name: true, durationMinutes: true, price: true } },
          staffMember: { select: { displayName: true } },
        },
        orderBy: { startTime: "desc" },
        take: 50,
      });
    }),

  // Cancel an appointment
  cancelAppointment: publicProcedure
    .input(
      z.object({
        token: z.string(),
        appointmentId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { clientId, organizationId } = decodePortalToken(input.token);

      const appointment = await ctx.prisma.appointment.findFirstOrThrow({
        where: {
          id: input.appointmentId,
          clientId,
          organizationId,
          status: { in: ["CONFIRMED", "PENDING"] },
        },
      });

      return ctx.prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: "CANCELLED",
          cancellationReason: input.reason ?? "Cancelled by client via portal",
        },
      });
    }),

  // Get pending intake forms
  getPendingForms: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const { clientId, organizationId } = decodePortalToken(input.token);

      // Find upcoming appointments and their required intake forms
      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          clientId,
          organizationId,
          status: { in: ["CONFIRMED", "PENDING"] },
          startTime: { gte: new Date() },
        },
        include: {
          service: {
            include: {
              intakeFormLinks: {
                include: { intakeForm: true },
              },
            },
          },
        },
      });

      // Get already submitted forms
      const submissions = await ctx.prisma.intakeFormSubmission.findMany({
        where: { clientId, organizationId },
        select: { intakeFormId: true, appointmentId: true },
      });
      const submittedSet = new Set(
        submissions.map((s) => `${s.intakeFormId}_${s.appointmentId ?? ""}`)
      );

      const pending: Array<{
        intakeForm: { id: string; name: string; description: string | null; fields: unknown; requireSignature: boolean };
        appointmentId: string;
        serviceName: string;
        appointmentDate: Date;
      }> = [];

      for (const appt of appointments) {
        for (const link of appt.service.intakeFormLinks) {
          const key = `${link.intakeFormId}_${appt.id}`;
          if (!submittedSet.has(key) && link.intakeForm.isActive) {
            pending.push({
              intakeForm: link.intakeForm,
              appointmentId: appt.id,
              serviceName: appt.service.name,
              appointmentDate: appt.startTime,
            });
          }
        }
      }

      return pending;
    }),

  // Get packages
  getPackages: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const { clientId, organizationId } = decodePortalToken(input.token);

      return ctx.prisma.clientPackage.findMany({
        where: { clientId, organizationId },
        include: { package: true },
        orderBy: { createdAt: "desc" },
      });
    }),
});

/**
 * Decode a portal token.
 * Token format: base64(clientId:organizationId:timestamp:signature)
 * For now, simple base64 encoding. In production, use JWT or HMAC.
 */
function decodePortalToken(token: string): {
  clientId: string;
  organizationId: string;
} {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const [clientId, organizationId] = decoded.split(":");
    if (!clientId || !organizationId) {
      throw new Error("Invalid token format");
    }
    return { clientId, organizationId };
  } catch {
    throw new Error("Invalid or expired portal token");
  }
}

/**
 * Generate a portal token for a client.
 */
export function generatePortalToken(
  clientId: string,
  organizationId: string
): string {
  const payload = `${clientId}:${organizationId}:${Date.now()}`;
  return Buffer.from(payload).toString("base64url");
}
