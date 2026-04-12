import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function setTime(date: Date, hours: number, minutes: number): Date {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding database...");

  const org = await prisma.organization.upsert({
    where: { slug: "demo-studio" },
    update: {},
    create: {
      name: "Demo Wellness Studio",
      slug: "demo-studio",
      timezone: "America/New_York",
      currency: "USD",
      email: "hello@demo-studio.com",
      phone: "+1234567890",
      address: "123 Main St, New York, NY 10001",
      category: "personal trainer",
      onboardingCompleted: true,
      settings: {
        defaultReminderHours: [24, 2],
        cancellationPolicyHours: 24,
        aiPersonality: "friendly",
        autoConfirmBookings: true,
      },
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo-studio.com" },
    update: {},
    create: {
      organizationId: org.id,
      email: "owner@demo-studio.com",
      name: "Alex Demo",
      role: "OWNER",
      emailVerified: new Date(),
      passwordHash: await bcrypt.hash("demo1234", 12),
    },
  });

  const staff = await prisma.staffMember.upsert({
    where: { userId: owner.id },
    update: {},
    create: {
      organizationId: org.id,
      userId: owner.id,
      displayName: "Alex Demo",
      bio: "Studio owner and lead practitioner",
      isActive: true,
    },
  });

  const services = await Promise.all([
    prisma.service.create({
      data: {
        organizationId: org.id,
        name: "1-on-1 Training Session",
        description: "Personalized fitness training session",
        category: "Training",
        durationMinutes: 60,
        bufferMinutes: 15,
        price: 85,
        color: "#3B82F6",
        sortOrder: 0,
      },
    }),
    prisma.service.create({
      data: {
        organizationId: org.id,
        name: "Group Fitness Class",
        description: "High-energy group workout",
        category: "Classes",
        durationMinutes: 45,
        bufferMinutes: 15,
        price: 30,
        color: "#10B981",
        maxCapacity: 12,
        sortOrder: 1,
      },
    }),
    prisma.service.create({
      data: {
        organizationId: org.id,
        name: "Yoga Session",
        description: "Relaxing yoga and mindfulness",
        category: "Wellness",
        durationMinutes: 60,
        bufferMinutes: 10,
        price: 45,
        color: "#8B5CF6",
        sortOrder: 2,
      },
    }),
    prisma.service.create({
      data: {
        organizationId: org.id,
        name: "Nutrition Consultation",
        description: "Personalized nutrition plan and review",
        category: "Wellness",
        durationMinutes: 30,
        bufferMinutes: 5,
        price: 60,
        color: "#F59E0B",
        sortOrder: 3,
      },
    }),
  ]);

  for (const service of services) {
    await prisma.staffService.create({
      data: { staffMemberId: staff.id, serviceId: service.id },
    });
  }

  // Mon-Fri 8am-6pm, Sat 9am-2pm
  for (const day of [1, 2, 3, 4, 5]) {
    await prisma.staffSchedule.create({
      data: {
        staffMemberId: staff.id,
        dayOfWeek: day,
        startTime: "08:00",
        endTime: "18:00",
        isAvailable: true,
      },
    });
  }
  await prisma.staffSchedule.create({
    data: {
      staffMemberId: staff.id,
      dayOfWeek: 6,
      startTime: "09:00",
      endTime: "14:00",
      isAvailable: true,
    },
  });

  // Create clients with realistic data
  const now = new Date();
  const clients = await Promise.all([
    prisma.client.create({
      data: {
        organizationId: org.id,
        firstName: "Sarah",
        lastName: "Johnson",
        email: "sarah@example.com",
        phone: "+1555000001",
        preferredChannel: "EMAIL",
        source: "MANUAL",
        tags: ["VIP", "Regular"],
        totalVisits: 12,
        totalSpent: 960,
        lastVisitAt: addDays(now, -3),
      },
    }),
    prisma.client.create({
      data: {
        organizationId: org.id,
        firstName: "Mike",
        lastName: "Chen",
        email: "mike@example.com",
        phone: "+1555000002",
        preferredChannel: "SMS",
        source: "BOOKING_PAGE",
        tags: ["Regular"],
        totalVisits: 8,
        totalSpent: 640,
        lastVisitAt: addDays(now, -5),
      },
    }),
    prisma.client.create({
      data: {
        organizationId: org.id,
        firstName: "Emma",
        lastName: "Williams",
        email: "emma@example.com",
        phone: "+1555000003",
        preferredChannel: "WHATSAPP",
        source: "AI",
        tags: ["New"],
        totalVisits: 3,
        totalSpent: 135,
        lastVisitAt: addDays(now, -10),
      },
    }),
    prisma.client.create({
      data: {
        organizationId: org.id,
        firstName: "David",
        lastName: "Brown",
        email: "david@example.com",
        phone: "+1555000004",
        preferredChannel: "EMAIL",
        source: "MANUAL",
        tags: ["Regular"],
        totalVisits: 6,
        totalSpent: 510,
        lastVisitAt: addDays(now, -25),
      },
    }),
    prisma.client.create({
      data: {
        organizationId: org.id,
        firstName: "Lisa",
        lastName: "Garcia",
        email: "lisa@example.com",
        phone: "+1555000005",
        preferredChannel: "SMS",
        source: "BOOKING_PAGE",
        tags: [],
        totalVisits: 4,
        totalSpent: 340,
        lastVisitAt: addDays(now, -30),
      },
    }),
    prisma.client.create({
      data: {
        organizationId: org.id,
        firstName: "James",
        lastName: "Wilson",
        email: "james@example.com",
        phone: "+1555000006",
        preferredChannel: "EMAIL",
        source: "MANUAL",
        tags: ["VIP"],
        totalVisits: 15,
        totalSpent: 1275,
        lastVisitAt: addDays(now, -35),
      },
    }),
  ]);

  // Generate appointments: past 30 days + upcoming week
  const appointmentData: Array<{
    clientIdx: number;
    serviceIdx: number;
    daysFromNow: number;
    hour: number;
    status: "COMPLETED" | "CONFIRMED" | "NO_SHOW" | "CANCELLED" | "PENDING";
  }> = [
    // Past completed
    { clientIdx: 0, serviceIdx: 0, daysFromNow: -28, hour: 9, status: "COMPLETED" },
    { clientIdx: 1, serviceIdx: 0, daysFromNow: -27, hour: 10, status: "COMPLETED" },
    { clientIdx: 2, serviceIdx: 2, daysFromNow: -26, hour: 11, status: "COMPLETED" },
    { clientIdx: 0, serviceIdx: 0, daysFromNow: -21, hour: 9, status: "COMPLETED" },
    { clientIdx: 3, serviceIdx: 0, daysFromNow: -21, hour: 14, status: "COMPLETED" },
    { clientIdx: 1, serviceIdx: 1, daysFromNow: -20, hour: 10, status: "COMPLETED" },
    { clientIdx: 4, serviceIdx: 0, daysFromNow: -19, hour: 15, status: "COMPLETED" },
    { clientIdx: 0, serviceIdx: 0, daysFromNow: -14, hour: 9, status: "COMPLETED" },
    { clientIdx: 2, serviceIdx: 2, daysFromNow: -14, hour: 11, status: "COMPLETED" },
    { clientIdx: 1, serviceIdx: 0, daysFromNow: -13, hour: 10, status: "COMPLETED" },
    { clientIdx: 5, serviceIdx: 0, daysFromNow: -12, hour: 14, status: "COMPLETED" },
    { clientIdx: 3, serviceIdx: 3, daysFromNow: -11, hour: 16, status: "NO_SHOW" },
    { clientIdx: 0, serviceIdx: 0, daysFromNow: -7, hour: 9, status: "COMPLETED" },
    { clientIdx: 1, serviceIdx: 0, daysFromNow: -6, hour: 10, status: "COMPLETED" },
    { clientIdx: 4, serviceIdx: 2, daysFromNow: -5, hour: 15, status: "COMPLETED" },
    { clientIdx: 0, serviceIdx: 0, daysFromNow: -3, hour: 9, status: "COMPLETED" },
    { clientIdx: 2, serviceIdx: 2, daysFromNow: -2, hour: 11, status: "COMPLETED" },
    { clientIdx: 1, serviceIdx: 1, daysFromNow: -1, hour: 10, status: "COMPLETED" },
    // Today
    { clientIdx: 0, serviceIdx: 0, daysFromNow: 0, hour: 14, status: "CONFIRMED" },
    { clientIdx: 3, serviceIdx: 0, daysFromNow: 0, hour: 16, status: "CONFIRMED" },
    // Upcoming
    { clientIdx: 1, serviceIdx: 0, daysFromNow: 1, hour: 9, status: "CONFIRMED" },
    { clientIdx: 2, serviceIdx: 2, daysFromNow: 1, hour: 11, status: "PENDING" },
    { clientIdx: 0, serviceIdx: 0, daysFromNow: 2, hour: 10, status: "CONFIRMED" },
    { clientIdx: 4, serviceIdx: 0, daysFromNow: 3, hour: 14, status: "CONFIRMED" },
    { clientIdx: 1, serviceIdx: 3, daysFromNow: 4, hour: 9, status: "PENDING" },
    { clientIdx: 0, serviceIdx: 0, daysFromNow: 5, hour: 9, status: "CONFIRMED" },
  ];

  for (const appt of appointmentData) {
    const client = clients[appt.clientIdx];
    const service = services[appt.serviceIdx];
    const startTime = setTime(addDays(now, appt.daysFromNow), appt.hour, 0);
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);

    await prisma.appointment.create({
      data: {
        organizationId: org.id,
        clientId: client.id,
        serviceId: service.id,
        staffMemberId: staff.id,
        startTime,
        endTime,
        status: appt.status,
        source: "MANUAL",
        paymentStatus: appt.status === "COMPLETED" ? "PAID" : "UNPAID",
      },
    });
  }

  // Booking page
  await prisma.bookingPage.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      slug: "demo-studio",
      title: "Book with Demo Wellness Studio",
      description: "Schedule your next session online",
      showStaffSelection: true,
      showPrices: true,
      isActive: true,
    },
  });

  // Subscription
  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      pricingModel: "REVENUE_SHARE",
      tier: "FREE",
      status: "active",
      staffCount: 1,
    },
  });

  console.log("Seed complete!");
  console.log(`  Organization: ${org.name} (${org.slug})`);
  console.log(`  Owner: ${owner.email}`);
  console.log(`  Services: ${services.length}`);
  console.log(`  Clients: ${clients.length}`);
  console.log(`  Appointments: ${appointmentData.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
