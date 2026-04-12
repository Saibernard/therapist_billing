import { prisma } from "@bookai/db";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

interface CreateCheckoutParams {
  organizationId: string;
  appointmentId: string;
  clientId: string;
  amount: number;
  currency: string;
  serviceName: string;
  successUrl: string;
  cancelUrl: string;
}

interface StripeResponse {
  url?: string;
  id?: string;
  error?: string;
}

async function stripeRequest(
  endpoint: string,
  body: Record<string, string>
): Promise<StripeResponse> {
  if (!STRIPE_SECRET) {
    console.log(`[STRIPE STUB] ${endpoint}`, body);
    return { url: body.success_url ?? "#", id: `stub-${Date.now()}` };
  }

  const response = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  return response.json();
}

export async function createCheckoutSession(
  params: CreateCheckoutParams
): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
  });

  const sub = await prisma.subscription.findUnique({
    where: { organizationId: params.organizationId },
  });

  const revenueSharePct = sub?.pricingModel === "REVENUE_SHARE"
    ? Number(sub.revenueSharePct ?? 4)
    : 0;
  const platformFee = Math.round(params.amount * (revenueSharePct / 100));
  const amountCents = Math.round(params.amount * 100);

  const sessionBody: Record<string, string> = {
    "mode": "payment",
    "line_items[0][price_data][currency]": params.currency.toLowerCase(),
    "line_items[0][price_data][product_data][name]": params.serviceName,
    "line_items[0][price_data][unit_amount]": amountCents.toString(),
    "line_items[0][quantity]": "1",
    "success_url": params.successUrl,
    "cancel_url": params.cancelUrl,
    "metadata[organizationId]": params.organizationId,
    "metadata[appointmentId]": params.appointmentId,
    "metadata[clientId]": params.clientId,
  };

  if (org?.stripeConnectId && platformFee > 0) {
    sessionBody["payment_intent_data[application_fee_amount]"] = platformFee.toString();
    sessionBody["payment_intent_data[transfer_data][destination]"] = org.stripeConnectId;
  }

  const session = await stripeRequest("/checkout/sessions", sessionBody);

  if (session.url) {
    await prisma.payment.create({
      data: {
        organizationId: params.organizationId,
        appointmentId: params.appointmentId,
        clientId: params.clientId,
        amount: params.amount,
        currency: params.currency,
        platformFee: platformFee / 100,
        netAmount: params.amount - platformFee / 100,
        status: "pending",
        stripePaymentIntentId: session.id,
      },
    });
  }

  return session.url ?? null;
}

export async function handleStripeWebhook(event: {
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const metadata = session.metadata as Record<string, string> | undefined;
      if (!metadata?.appointmentId) break;

      await prisma.appointment.update({
        where: { id: metadata.appointmentId },
        data: { paymentStatus: "PAID" },
      });

      await prisma.payment.updateMany({
        where: { appointmentId: metadata.appointmentId, status: "pending" },
        data: { status: "succeeded" },
      });
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent as string;
      if (paymentIntentId) {
        await prisma.payment.updateMany({
          where: { stripePaymentIntentId: paymentIntentId },
          data: { status: "refunded" },
        });
      }
      break;
    }
  }
}

export async function createSubscriptionCheckout(
  organizationId: string,
  tier: "PRO" | "BUSINESS",
  successUrl: string,
  cancelUrl: string
): Promise<string | null> {
  const priceMap: Record<string, string> = {
    PRO: process.env.STRIPE_PRO_PRICE_ID ?? "price_pro_placeholder",
    BUSINESS: process.env.STRIPE_BUSINESS_PRICE_ID ?? "price_business_placeholder",
  };

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });

  let customerId = org.stripeCustomerId;

  if (!customerId && STRIPE_SECRET) {
    const customer = await stripeRequest("/customers", {
      name: org.name,
      email: org.email ?? "",
      "metadata[organizationId]": organizationId,
    });
    customerId = customer.id ?? null;

    if (customerId) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { stripeCustomerId: customerId },
      });
    }
  }

  const body: Record<string, string> = {
    "mode": "subscription",
    "line_items[0][price]": priceMap[tier],
    "line_items[0][quantity]": "1",
    "success_url": successUrl,
    "cancel_url": cancelUrl,
    "metadata[organizationId]": organizationId,
    "metadata[tier]": tier,
  };

  if (customerId) body.customer = customerId;

  const session = await stripeRequest("/checkout/sessions", body);
  return session.url ?? null;
}

// -------------------------------------------------------------------
// Deposits & No-Show Fees
// -------------------------------------------------------------------

export async function createSetupIntent(
  organizationId: string,
  clientId: string
): Promise<{ clientSecret: string | null; customerId: string }> {
  const client = await prisma.client.findFirstOrThrow({
    where: { id: clientId, organizationId },
  });

  let customerId = client.stripeCustomerId;

  if (!customerId) {
    const customer = await stripeRequest("/customers", {
      name: `${client.firstName} ${client.lastName ?? ""}`.trim(),
      email: client.email ?? "",
      "metadata[organizationId]": organizationId,
      "metadata[clientId]": clientId,
    });
    customerId = customer.id ?? `stub-cus-${Date.now()}`;

    await prisma.client.update({
      where: { id: clientId },
      data: { stripeCustomerId: customerId },
    });
  }

  const setupIntent = await stripeRequest("/setup_intents", {
    customer: customerId,
    "payment_method_types[0]": "card",
    "metadata[organizationId]": organizationId,
    "metadata[clientId]": clientId,
  });

  return {
    clientSecret: (setupIntent as Record<string, unknown>).client_secret as string | null,
    customerId,
  };
}

export async function markCardOnFile(clientId: string): Promise<void> {
  await prisma.client.update({
    where: { id: clientId },
    data: { hasCardOnFile: true },
  });
}

export async function collectDeposit(
  organizationId: string,
  appointmentId: string,
  clientId: string,
  amount: number,
  currency: string
): Promise<string | null> {
  const client = await prisma.client.findFirstOrThrow({
    where: { id: clientId, organizationId },
  });

  if (!client.stripeCustomerId) {
    throw new Error("Client has no payment method on file");
  }

  // Create a payment intent using the customer's default payment method
  const paymentIntent = await stripeRequest("/payment_intents", {
    amount: Math.round(amount * 100).toString(),
    currency: currency.toLowerCase(),
    customer: client.stripeCustomerId,
    confirm: "true",
    off_session: "true",
    "metadata[organizationId]": organizationId,
    "metadata[appointmentId]": appointmentId,
    "metadata[clientId]": clientId,
    "metadata[type]": "deposit",
  });

  if (paymentIntent.id) {
    await prisma.payment.create({
      data: {
        organizationId,
        appointmentId,
        clientId,
        amount,
        currency,
        platformFee: 0,
        netAmount: amount,
        status: "succeeded",
        stripePaymentIntentId: paymentIntent.id,
      },
    });

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { depositPaid: true, depositAmount: amount },
    });
  }

  return paymentIntent.id ?? null;
}

export async function chargeNoShowFee(
  organizationId: string,
  appointmentId: string,
  clientId: string,
  amount: number,
  currency: string
): Promise<string | null> {
  const client = await prisma.client.findFirstOrThrow({
    where: { id: clientId, organizationId },
  });

  if (!client.stripeCustomerId) {
    console.log(`[NO-SHOW FEE] Client ${clientId} has no card on file, cannot charge`);
    return null;
  }

  const paymentIntent = await stripeRequest("/payment_intents", {
    amount: Math.round(amount * 100).toString(),
    currency: currency.toLowerCase(),
    customer: client.stripeCustomerId,
    confirm: "true",
    off_session: "true",
    "metadata[organizationId]": organizationId,
    "metadata[appointmentId]": appointmentId,
    "metadata[clientId]": clientId,
    "metadata[type]": "no_show_fee",
  });

  if (paymentIntent.id) {
    await prisma.payment.create({
      data: {
        organizationId,
        appointmentId,
        clientId,
        amount,
        currency,
        platformFee: 0,
        netAmount: amount,
        status: "succeeded",
        stripePaymentIntentId: paymentIntent.id,
      },
    });
  }

  return paymentIntent.id ?? null;
}

export async function createMembershipSubscription(
  organizationId: string,
  clientId: string,
  packageId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string | null> {
  const client = await prisma.client.findFirstOrThrow({
    where: { id: clientId, organizationId },
  });

  let customerId = client.stripeCustomerId;
  if (!customerId) {
    const customer = await stripeRequest("/customers", {
      name: `${client.firstName} ${client.lastName ?? ""}`.trim(),
      email: client.email ?? "",
      "metadata[organizationId]": organizationId,
      "metadata[clientId]": clientId,
    });
    customerId = customer.id ?? null;
    if (customerId) {
      await prisma.client.update({
        where: { id: clientId },
        data: { stripeCustomerId: customerId },
      });
    }
  }

  const body: Record<string, string> = {
    "mode": "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "success_url": successUrl,
    "cancel_url": cancelUrl,
    "metadata[organizationId]": organizationId,
    "metadata[clientId]": clientId,
    "metadata[packageId]": packageId,
  };
  if (customerId) body.customer = customerId;

  const session = await stripeRequest("/checkout/sessions", body);
  return session.url ?? null;
}
