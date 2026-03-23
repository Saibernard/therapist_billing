import { NextRequest, NextResponse } from "next/server";
import { handleStripeWebhook } from "@bookai/communications/src/payments";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    const sig = req.headers.get("stripe-signature");
    const body = await req.text();

    let event: Stripe.Event;

    if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    } else {
      event = JSON.parse(body);
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.warn("[STRIPE WEBHOOK] No STRIPE_WEBHOOK_SECRET set - skipping signature verification");
      }
    }

    await handleStripeWebhook(event);

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[STRIPE WEBHOOK ERROR]", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }
}
