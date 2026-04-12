import { NextResponse } from "next/server";
import { prisma } from "@bookai/db";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = checkRateLimit(`signup:${ip}`, 5, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { name, email, password, businessName } = body as {
      name: string;
      email: string;
      password: string;
      businessName: string;
    };

    if (!name || !email || !password || !businessName) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const { allowed: emailAllowed } = checkRateLimit(`signup-email:${email}`, 3, 15 * 60 * 1000);
    if (!emailAllowed) {
      return NextResponse.json(
        { error: "Too many attempts for this email." },
        { status: 429 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);

    let uniqueSlug = slug;
    const existingSlug = await prisma.organization.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      uniqueSlug = `${slug}-${Date.now().toString(36)}`;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const org = await prisma.organization.create({
      data: {
        name: businessName,
        slug: uniqueSlug,
        email,
        onboardingCompleted: false,
        settings: {
          defaultReminderHours: [24, 2],
          cancellationPolicyHours: 24,
          aiPersonality: "friendly",
          autoConfirmBookings: true,
        },
      },
    });

    await prisma.user.create({
      data: {
        organizationId: org.id,
        email,
        name,
        role: "OWNER",
        emailVerified: new Date(),
        passwordHash,
      },
    });

    await prisma.subscription.create({
      data: {
        organizationId: org.id,
        pricingModel: "REVENUE_SHARE",
        tier: "FREE",
        status: "active",
        staffCount: 1,
      },
    });

    await prisma.bookingPage.create({
      data: {
        organizationId: org.id,
        slug: uniqueSlug,
        title: `Book with ${businessName}`,
        description: `Schedule your appointment with ${businessName}`,
        showStaffSelection: true,
        showPrices: true,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, slug: uniqueSlug });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
