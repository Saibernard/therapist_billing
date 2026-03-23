import { NextResponse } from "next/server";
import { prisma } from "@bookai/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { slug },
      include: {
        services: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            price: true,
            category: true,
          },
        },
        staffMembers: {
          where: { isActive: true },
          include: {
            staffServices: { select: { serviceId: true } },
            schedules: {
              where: { isAvailable: true },
              select: { dayOfWeek: true },
            },
          },
        },
        bookingPage: true,
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const bookingPage = org.bookingPage;
    if (!bookingPage?.isActive) {
      return NextResponse.json(
        { error: "Booking is currently unavailable" },
        { status: 404 }
      );
    }

    const staff = org.staffMembers.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      bio: s.bio,
      photoUrl: s.photoUrl,
      serviceIds: s.staffServices.map((ss) => ss.serviceId),
      workingDays: s.schedules.map((sch) => sch.dayOfWeek),
    }));

    return NextResponse.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl,
        timezone: org.timezone,
        address: org.address,
        phone: org.phone,
      },
      services: org.services.map((s) => ({
        ...s,
        price: Number(s.price),
      })),
      staff,
      bookingPage: {
        title: bookingPage.title,
        description: bookingPage.description,
        showStaffSelection: bookingPage.showStaffSelection,
        showPrices: bookingPage.showPrices,
        requirePayment: bookingPage.requirePayment,
      },
    });
  } catch (err) {
    console.error("[BOOKING/INFO]", err);
    return NextResponse.json(
      { error: "Failed to load booking info" },
      { status: 500 }
    );
  }
}
