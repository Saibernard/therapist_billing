import { createTRPCContext } from "../../packages/api/src/trpc";

type Slot = {
  startTime: string;
  endTime: string;
  staffMemberId: string;
  staffName: string;
  available: boolean;
};

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3456";
const ORG_ID = process.env.ORG_ID ?? "cmn2agdcr0000ynnlcjaernt2";
const ORG_SLUG = process.env.ORG_SLUG ?? "demo-studio";
const SERVICE_ID = process.env.SERVICE_ID ?? "cmn2agdmh0006ynnlp1igd64q";

async function getSlots(date: string): Promise<Slot[]> {
  const url =
    `${BASE_URL}/api/booking/slots?slug=${encodeURIComponent(ORG_SLUG)}` +
    `&serviceId=${encodeURIComponent(SERVICE_ID)}&date=${encodeURIComponent(date)}`;
  const res = await fetch(url);
  const data = (await res.json()) as { slots?: Slot[] };
  return data.slots ?? [];
}

async function postBooking(payload: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/api/booking`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, any>,
  };
}

async function main() {
  const allSlots: Array<{ date: string; slot: Slot }> = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    const slots = await getSlots(date);
    for (const slot of slots) {
      allSlots.push({ date, slot });
      if (allSlots.length >= 2) break;
    }
    if (allSlots.length >= 2) break;
  }

  if (allSlots.length < 2) {
    throw new Error("Not enough available slots for test run.");
  }

  const [first, second] = allSlots;
  const email = `e2e.reschedule.${Date.now()}@example.com`;

  const createResp = await postBooking({
    organizationId: ORG_ID,
    serviceId: SERVICE_ID,
    staffMemberId: first.slot.staffMemberId,
    startTime: `${first.date}T${first.slot.startTime}:00.000Z`,
    firstName: "E2E",
    lastName: "Reschedule",
    email,
  });
  if (createResp.status !== 200) {
    throw new Error(`Create booking failed: ${JSON.stringify(createResp)}`);
  }

  const appointmentId = createResp.body.appointment?.id as string | undefined;
  if (!appointmentId) {
    throw new Error("Booking API did not return appointment id.");
  }

  const ctx = await createTRPCContext({
    userId: "sim-owner",
    organizationId: ORG_ID,
  });
  const prisma = ctx.prisma;

  const firstConfirmation = await prisma.communicationLog.findFirst({
    where: {
      organizationId: ORG_ID,
      appointmentId,
      channel: "EMAIL",
      messageType: "CONFIRMATION",
    },
    orderBy: { createdAt: "desc" },
  });

  const firstContent = firstConfirmation?.content ?? "";
  const urlMatch = firstContent.match(
    /https?:\/\/[^\s]+\/book\/[^\s]+\?rescheduleToken=[^\s]+/
  );
  if (!urlMatch) {
    throw new Error("No reschedule URL found in first confirmation log.");
  }
  const rescheduleUrl = urlMatch[0];
  const parsed = new URL(rescheduleUrl);
  const token = parsed.searchParams.get("rescheduleToken");
  if (!token) {
    throw new Error("Missing rescheduleToken in confirmation URL.");
  }

  const contextRes = await fetch(
    `${BASE_URL}/api/booking/reschedule-context?token=${encodeURIComponent(token)}`
  );
  const contextBody = (await contextRes.json()) as Record<string, any>;
  if (!contextRes.ok) {
    throw new Error(`Reschedule context failed: ${JSON.stringify(contextBody)}`);
  }

  const rescheduleResp = await postBooking({
    organizationId: ORG_ID,
    serviceId: SERVICE_ID,
    staffMemberId: second.slot.staffMemberId,
    startTime: `${second.date}T${second.slot.startTime}:00.000Z`,
    firstName: "E2E",
    lastName: "Reschedule",
    email,
    rescheduleToken: token,
  });
  if (rescheduleResp.status !== 200) {
    throw new Error(`Reschedule booking failed: ${JSON.stringify(rescheduleResp)}`);
  }

  const latestConfirmation = await prisma.communicationLog.findFirst({
    where: {
      organizationId: ORG_ID,
      appointmentId,
      channel: "EMAIL",
      messageType: "CONFIRMATION",
    },
    orderBy: { createdAt: "desc" },
  });
  const latestContent = latestConfirmation?.content ?? "";

  const updatedAppointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { startTime: true, endTime: true, status: true },
  });

  const confirmationCount = await prisma.communicationLog.count({
    where: {
      organizationId: ORG_ID,
      appointmentId,
      channel: "EMAIL",
      messageType: "CONFIRMATION",
    },
  });

  console.log(
    JSON.stringify(
      {
        createBooking: {
          status: createResp.status,
          appointmentId,
          requestedStart: `${first.date}T${first.slot.startTime}:00.000Z`,
        },
        firstConfirmation: {
          hasRescheduleUrl: true,
          rescheduleUrl,
        },
        rescheduleContext: {
          status: contextRes.status,
          appointmentId: contextBody.appointment?.id,
          serviceId: contextBody.appointment?.serviceId,
        },
        rescheduleAction: {
          status: rescheduleResp.status,
          wasRescheduled: rescheduleResp.body.appointment?.wasRescheduled,
          sourceAppointmentId: rescheduleResp.body.appointment?.sourceAppointmentId,
          newStartTime: rescheduleResp.body.appointment?.startTime,
        },
        databaseVerification: {
          appointmentStatus: updatedAppointment?.status ?? null,
          appointmentStartTime: updatedAppointment?.startTime ?? null,
          appointmentEndTime: updatedAppointment?.endTime ?? null,
          confirmationEmailCount: confirmationCount,
          latestConfirmationHasRescheduleLink:
            latestContent.includes("Reschedule appointment:") ||
            /\/book\/demo-studio\?rescheduleToken=/.test(latestContent),
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
