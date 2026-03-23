"use client";

import { useState } from "react";
import {
  CreditCard,
  Check,
  Zap,
  Building2,
  Sparkles,
  ArrowRight,
  Loader2,
  Receipt,
  Percent,
  Users,
  Calendar,
  Mail,
  MessageSquare,
  BarChart3,
  MapPin,
  Code,
  Paintbrush,
  Bot,
  Smartphone,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface PlanFeature {
  label: string;
  icon: React.ReactNode;
  included: boolean;
}

interface PlanTier {
  name: string;
  price: string;
  priceSuffix: string;
  description: string;
  icon: React.ReactNode;
  features: PlanFeature[];
  highlight?: boolean;
}

const PLANS: PlanTier[] = [
  {
    name: "Free",
    price: "$0",
    priceSuffix: "/mo",
    description: "Get started with the basics",
    icon: <Sparkles className="h-5 w-5" />,
    features: [
      { label: "1 staff member", icon: <Users className="h-3.5 w-3.5" />, included: true },
      { label: "50 appointments/mo", icon: <Calendar className="h-3.5 w-3.5" />, included: true },
      { label: "Email reminders", icon: <Mail className="h-3.5 w-3.5" />, included: true },
      { label: "AI chat assistant", icon: <Bot className="h-3.5 w-3.5" />, included: true },
      { label: "SMS / WhatsApp", icon: <Smartphone className="h-3.5 w-3.5" />, included: false },
      { label: "Payment processing", icon: <CreditCard className="h-3.5 w-3.5" />, included: false },
      { label: "Analytics", icon: <BarChart3 className="h-3.5 w-3.5" />, included: false },
      { label: "Multi-location", icon: <MapPin className="h-3.5 w-3.5" />, included: false },
    ],
  },
  {
    name: "Pro",
    price: "$9",
    priceSuffix: "/mo per staff",
    description: "Everything you need to grow",
    icon: <Zap className="h-5 w-5" />,
    highlight: true,
    features: [
      { label: "Unlimited staff", icon: <Users className="h-3.5 w-3.5" />, included: true },
      { label: "Unlimited appointments", icon: <Calendar className="h-3.5 w-3.5" />, included: true },
      { label: "SMS / WhatsApp", icon: <Smartphone className="h-3.5 w-3.5" />, included: true },
      { label: "Full AI features", icon: <Bot className="h-3.5 w-3.5" />, included: true },
      { label: "Payment processing", icon: <CreditCard className="h-3.5 w-3.5" />, included: true },
      { label: "Email + SMS reminders", icon: <MessageSquare className="h-3.5 w-3.5" />, included: true },
      { label: "Analytics", icon: <BarChart3 className="h-3.5 w-3.5" />, included: false },
      { label: "Multi-location", icon: <MapPin className="h-3.5 w-3.5" />, included: false },
    ],
  },
  {
    name: "Business",
    price: "$29",
    priceSuffix: "/mo per staff",
    description: "For scaling operations",
    icon: <Building2 className="h-5 w-5" />,
    features: [
      { label: "Unlimited staff", icon: <Users className="h-3.5 w-3.5" />, included: true },
      { label: "Unlimited appointments", icon: <Calendar className="h-3.5 w-3.5" />, included: true },
      { label: "SMS / WhatsApp", icon: <Smartphone className="h-3.5 w-3.5" />, included: true },
      { label: "Full AI features", icon: <Bot className="h-3.5 w-3.5" />, included: true },
      { label: "Advanced analytics", icon: <BarChart3 className="h-3.5 w-3.5" />, included: true },
      { label: "Multi-location", icon: <MapPin className="h-3.5 w-3.5" />, included: true },
      { label: "API access", icon: <Code className="h-3.5 w-3.5" />, included: true },
      { label: "White-label", icon: <Paintbrush className="h-3.5 w-3.5" />, included: true },
    ],
  },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-500/10 text-green-600",
  succeeded: "bg-green-500/10 text-green-600",
  paid: "bg-green-500/10 text-green-600",
  pending: "bg-yellow-500/10 text-yellow-600",
  processing: "bg-yellow-500/10 text-yellow-600",
  failed: "bg-red-500/10 text-red-500",
  refunded: "bg-muted text-muted-foreground",
};

export default function BillingPage() {
  const [switchingPlan, setSwitchingPlan] = useState<string | null>(null);

  const { data: subscription, isLoading: subLoading } =
    trpc.payment.getSubscription.useQuery();
  const { data: payments, isLoading: paymentsLoading } =
    trpc.payment.recentPayments.useQuery({ limit: 10 });

  const utils = trpc.useUtils();

  const subscribeMutation = trpc.payment.subscribe.useMutation({
    onSuccess: () => {
      utils.payment.getSubscription.invalidate();
      setSwitchingPlan(null);
    },
    onError: () => setSwitchingPlan(null),
  });

  const revShareMutation = trpc.payment.switchToRevenueShare.useMutation({
    onSuccess: () => {
      utils.payment.getSubscription.invalidate();
    },
  });

  const currentPlan = subscription?.plan ?? "Free";
  const pricingModel = subscription?.pricingModel ?? "subscription";

  function handleUpgrade(plan: string) {
    setSwitchingPlan(plan);
    subscribeMutation.mutate({ plan });
  }

  const planOrder = ["Free", "Pro", "Business"];
  const currentIdx = planOrder.indexOf(currentPlan);

  if (subLoading) {
    return (
      <div className="flex h-96 items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div>
        <h1 className="text-2xl font-bold">Billing & Subscription</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your plan, billing, and payment history.
        </p>
      </div>

      {/* ── Current Plan ── */}
      <section className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2.5">
          <CreditCard className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold">Current Plan</h2>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">
            {currentPlan === "Free" && <Sparkles className="h-4 w-4" />}
            {currentPlan === "Pro" && <Zap className="h-4 w-4" />}
            {currentPlan === "Business" && <Building2 className="h-4 w-4" />}
            {currentPlan} Plan
          </span>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {pricingModel === "revenue_share" ? "Revenue Share (4%)" : "Subscription"}
          </span>
          {subscription?.renewsAt && (
            <span className="text-xs text-muted-foreground">
              Renews {formatDate(subscription.renewsAt)}
            </span>
          )}
        </div>
      </section>

      {/* ── Plan Comparison ── */}
      <section className="mt-8">
        <h2 className="mb-5 text-lg font-semibold">Choose Your Plan</h2>
        <div className="grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const planIdx = planOrder.indexOf(plan.name);
            const isCurrent = plan.name === currentPlan;
            const isDowngrade = planIdx < currentIdx;
            const isUpgrade = planIdx > currentIdx;

            return (
              <div
                key={plan.name}
                className={cn(
                  "relative flex flex-col rounded-xl border p-6 transition-shadow",
                  isCurrent
                    ? "border-accent bg-accent/5 shadow-md"
                    : "border-border bg-card hover:shadow-md",
                  plan.highlight && !isCurrent && "border-accent/40"
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-accent-foreground">
                    Popular
                  </span>
                )}

                <div className="mb-4 flex items-center gap-2.5">
                  <span className={cn("text-muted-foreground", isCurrent && "text-accent")}>
                    {plan.icon}
                  </span>
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                </div>

                <div className="mb-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.priceSuffix}</span>
                </div>
                <p className="mb-5 text-sm text-muted-foreground">{plan.description}</p>

                <ul className="mb-6 flex-1 space-y-2.5">
                  {plan.features.map((feat) => (
                    <li
                      key={feat.label}
                      className={cn(
                        "flex items-center gap-2.5 text-sm",
                        feat.included ? "text-foreground" : "text-muted-foreground/50"
                      )}
                    >
                      {feat.included ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                      ) : (
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-xs">
                          —
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        {feat.icon}
                        {feat.label}
                      </span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-accent bg-accent/10 py-2.5 text-sm font-medium text-accent">
                    <Check className="h-4 w-4" />
                    Current Plan
                  </div>
                ) : isUpgrade ? (
                  <button
                    onClick={() => handleUpgrade(plan.name)}
                    disabled={switchingPlan === plan.name}
                    className="flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {switchingPlan === plan.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Upgrade to {plan.name}
                  </button>
                ) : (
                  <button
                    disabled
                    className="flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground opacity-50"
                  >
                    Downgrade
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Revenue Share Option ── */}
      <section className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-accent/10 p-2.5">
            <Percent className="h-6 w-6 text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Revenue Share Model</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use BookAI <strong>free forever</strong> — we only take a{" "}
              <strong>4% fee on payments</strong> processed through the platform. No monthly
              subscription, no upfront cost. Perfect if you&apos;re just getting started or
              prefer pay-as-you-go.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {pricingModel === "revenue_share" ? (
                <span className="flex items-center gap-2 rounded-lg border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
                  <Check className="h-4 w-4" />
                  Currently on Revenue Share
                </span>
              ) : (
                <button
                  onClick={() => revShareMutation.mutate()}
                  disabled={revShareMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {revShareMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Switch to Revenue Share
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Recent Payments ── */}
      <section className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <Receipt className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold">Recent Payments</h2>
        </div>

        {paymentsLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !payments?.length ? (
          <div className="flex h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border">
            <Receipt className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No payments yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Service</th>
                  <th className="pb-3 pr-4">Client</th>
                  <th className="pb-3 pr-4 text-right">Amount</th>
                  <th className="pb-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((payment) => (
                  <tr key={payment.id} className="group">
                    <td className="py-3 pr-4 text-muted-foreground">
                      {formatDate(payment.date)}
                    </td>
                    <td className="py-3 pr-4 font-medium">
                      {payment.service}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {payment.client}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium tabular-nums">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          STATUS_STYLES[payment.status] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {payment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
