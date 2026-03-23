import { NextResponse } from "next/server";
import { prisma } from "@bookai/db";
import { getAvailableSlots } from "@bookai/scheduling";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const serviceId = searchParams.get("serviceId");
    const staffMemberId = searchParams.get("staffMemberId") || undefined;
    const date = searchParams.get("date");

    if (!slug || !serviceId || !date) {
      return NextResponse.json(
        { error: "Missing required parameters: slug, serviceId, date" },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { slug },
    });

    if (!org) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const slots = await getAvailableSlots({
      organizationId: org.id,
      serviceId,
      staffMemberId,
      date,
      timezone: org.timezone,
    });

    return NextResponse.json({ slots });
  } catch (err) {
    console.error("[BOOKING/SLOTS]", err);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 }
    );
  }
}
