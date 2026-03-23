import { notFound } from "next/navigation";
import { prisma } from "@bookai/db";
import type { Metadata } from "next";
import { BookingFlow } from "./booking-flow";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { name: true },
  });

  if (!org) return { title: "Not Found" };

  return {
    title: `Book with ${org.name} | BookAI`,
    description: `Schedule an appointment with ${org.name}`,
  };
}

export default async function BookingPage({ params }: Props) {
  const { slug } = await params;

  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      timezone: true,
      address: true,
      phone: true,
      email: true,
    },
  });

  if (!organization) return notFound();

  const bookingPage = await prisma.bookingPage.findUnique({
    where: { organizationId: organization.id },
  });

  if (!bookingPage || !bookingPage.isActive) return notFound();

  const services = await prisma.service.findMany({
    where: { organizationId: organization.id, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      durationMinutes: true,
      price: true,
      color: true,
    },
  });

  const staffMembers = await prisma.staffMember.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
    },
  });

  const servicesByCategory = services.reduce<
    Record<string, typeof services>
  >((acc, service) => {
    const cat = service.category ?? "Services";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(service);
    return acc;
  }, {});

  const serializedServices = services.map((s) => ({
    ...s,
    price: Number(s.price),
  }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-6">
          {organization.logoUrl ? (
            <img
              src={organization.logoUrl}
              alt={organization.name}
              className="h-12 w-12 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-foreground">
              {organization.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {bookingPage.title || organization.name}
            </h1>
            {bookingPage.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {bookingPage.description}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <BookingFlow
          organization={organization}
          bookingPage={{
            title: bookingPage.title,
            description: bookingPage.description,
            showStaffSelection: bookingPage.showStaffSelection,
            showPrices: bookingPage.showPrices,
          }}
          services={serializedServices}
          servicesByCategory={Object.fromEntries(
            Object.entries(servicesByCategory).map(([cat, svcs]) => [
              cat,
              svcs.map((s) => ({ ...s, price: Number(s.price) })),
            ])
          )}
          staffMembers={staffMembers}
        />
      </main>

      <footer className="border-t border-border py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by{" "}
          <span className="font-semibold text-foreground">BookAI</span>
        </p>
      </footer>
    </div>
  );
}
