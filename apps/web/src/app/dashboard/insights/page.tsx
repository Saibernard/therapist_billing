"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
  Clock,
  DollarSign,
  Zap,
  ChevronRight,
  Send,
  Loader2,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CalendarClock,
  UserMinus,
  Target,
  ShieldAlert,
  Lightbulb,
  BarChart3,
  MessageSquare,
} from "lucide-react";

// ── Priority badge colors ──────────────────────────────────────────

const PRIORITY_STYLES = {
  urgent: "bg-red-500/10 text-red-600 border-red-500/20",
  high: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  medium: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  low: "bg-green-500/10 text-green-600 border-green-500/20",
} as const;

const CATEGORY_ICONS = {
  revenue: DollarSign,
  retention: UserMinus,
  scheduling: CalendarClock,
  growth: Target,
  operations: ShieldAlert,
} as const;

// ── Main Page ──────────────────────────────────────────────────────

export default function InsightsPage() {
  const { data, isLoading, error } = trpc.insights.coach.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const [advisorQuestion, setAdvisorQuestion] = useState("");
  const [advisorHistory, setAdvisorHistory] = useState<
    Array<{ role: "user" | "advisor"; content: string }>
  >([]);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const executeAction = trpc.insights.executeAction.useMutation();
  const askAdvisor = trpc.insights.askAdvisor.useMutation();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [advisorHistory]);

  function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!advisorQuestion.trim() || askAdvisor.isPending) return;

    const question = advisorQuestion.trim();
    setAdvisorHistory((h) => [...h, { role: "user", content: question }]);
    setAdvisorQuestion("");

    askAdvisor.mutate(
      { question },
      {
        onSuccess: (res) => {
          setAdvisorHistory((h) => [
            ...h,
            { role: "advisor", content: res.answer },
          ]);
        },
        onError: () => {
          setAdvisorHistory((h) => [
            ...h,
            {
              role: "advisor",
              content: "Sorry, I couldn't process that right now. Try again.",
            },
          ]);
        },
      }
    );
  }

  function handleAction(
    insightId: string,
    actionType: string,
    payload?: Record<string, unknown>
  ) {
    executeAction.mutate(
      { insightId, actionType, payload },
      {
        onSuccess: (res) => {
          setAdvisorHistory((h) => [
            ...h,
            { role: "advisor", content: res.message },
          ]);
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Brain className="h-12 w-12 text-accent animate-pulse" />
            <Sparkles className="absolute -right-2 -top-2 h-5 w-5 text-amber-500 animate-bounce" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">
              Analyzing your business…
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crunching bookings, revenue, and client patterns
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <p className="font-medium text-foreground">
            Couldn&apos;t load insights
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message ?? "Please try again."}
          </p>
        </div>
      </div>
    );
  }

  const revTrend =
    data.revenue.lastWeek > 0
      ? Math.round(
          ((data.revenue.thisWeek - data.revenue.lastWeek) /
            data.revenue.lastWeek) *
            100
        )
      : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-8">
      {/* ── Header / Greeting ───────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent/60 shadow-lg shadow-accent/20">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Revenue Coach
            </h1>
            <p className="text-sm text-muted-foreground">
              Your AI business advisor
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 px-5 py-4">
          <p className="text-sm leading-relaxed text-foreground">
            {data.greeting}
          </p>
        </div>
      </div>

      {/* ── Revenue KPI Strip ───────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="This Week"
          value={`$${data.revenue.thisWeek.toLocaleString()}`}
          sub={`Projected: $${data.revenue.projected.toLocaleString()}`}
          trend={revTrend}
        />
        <KpiCard
          label="Monthly Revenue"
          value={`$${data.revenue.thisMonth.toLocaleString()}`}
          sub={`Last month: $${data.revenue.lastMonth.toLocaleString()}`}
          trend={
            data.revenue.lastMonth > 0
              ? Math.round(
                  ((data.revenue.thisMonth - data.revenue.lastMonth) /
                    data.revenue.lastMonth) *
                    100
                )
              : 0
          }
        />
        <KpiCard
          label="Utilization"
          value={`${data.weeklyUtilization}%`}
          sub={`${data.emptySlots.reduce((s, e) => s + e.openHours, 0)}h open this week`}
          trend={data.weeklyUtilization >= 70 ? 1 : -1}
          isMuted
        />
        <KpiCard
          label="Avg / Appointment"
          value={`$${data.revenue.perSlotAvg}`}
          sub={`${data.topServices[0]?.name ?? "—"} is #1`}
          trend={0}
          isMuted
        />
      </div>

      {/* ── Main 2-column layout ────────────────────────────────── */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* ── Left: Insights + Empty Slots + At-Risk ──────────── */}
        <div className="space-y-8 lg:col-span-2">
          {/* Actionable Insights */}
          {data.insights.length > 0 && (
            <section>
              <SectionHeader
                icon={Zap}
                title="Action Items"
                subtitle={`${data.insights.length} thing${data.insights.length > 1 ? "s" : ""} to act on`}
              />
              <div className="mt-4 space-y-3">
                {data.insights.map((insight) => {
                  const Icon =
                    CATEGORY_ICONS[insight.category] ?? Lightbulb;
                  const isExpanded = expandedInsight === insight.id;

                  return (
                    <div
                      key={insight.id}
                      className={cn(
                        "rounded-xl border transition-all",
                        isExpanded
                          ? "border-accent/30 bg-card shadow-sm"
                          : "border-border bg-card hover:border-border/80"
                      )}
                    >
                      <button
                        onClick={() =>
                          setExpandedInsight(
                            isExpanded ? null : insight.id
                          )
                        }
                        className="flex w-full items-start gap-4 p-4 text-left"
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                            PRIORITY_STYLES[insight.priority]
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-foreground">
                              {insight.title}
                            </h3>
                            {insight.metric && (
                              <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
                                {insight.metric.trend === "up" && (
                                  <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
                                )}
                                {insight.metric.trend === "down" && (
                                  <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                                )}
                                {insight.metric.trend === "flat" && (
                                  <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span className="text-foreground">
                                  {insight.metric.value}
                                </span>
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {insight.description}
                          </p>
                        </div>
                        <ChevronRight
                          className={cn(
                            "mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            isExpanded && "rotate-90"
                          )}
                        />
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm">
                              <TrendingUp className="h-3.5 w-3.5 text-accent" />
                              <span className="font-medium text-accent">
                                {insight.impact}
                              </span>
                            </div>
                            {insight.actionLabel && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAction(
                                    insight.id,
                                    insight.actionPayload?.type as string,
                                    insight.actionPayload
                                  );
                                }}
                                disabled={executeAction.isPending}
                                className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                              >
                                {executeAction.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Zap className="h-3.5 w-3.5" />
                                )}
                                {insight.actionLabel}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Empty Slots */}
          {data.emptySlots.length > 0 && (
            <section>
              <SectionHeader
                icon={Clock}
                title="Open Slots This Week"
                subtitle="These could be filled"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.emptySlots.map((slot, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                      <span className="text-[10px] font-bold uppercase leading-none">
                        {slot.dayName.slice(0, 3)}
                      </span>
                      <span className="text-lg font-bold leading-tight">
                        {slot.date.split("-")[2]}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {slot.staffName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {slot.openHours}h open · {slot.bookedHours}h booked
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{
                            width: `${Math.round((slot.bookedHours / (slot.openHours + slot.bookedHours)) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {Math.round(
                          (slot.bookedHours /
                            (slot.openHours + slot.bookedHours)) *
                            100
                        )}
                        % filled
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* At-Risk Clients */}
          {data.atRiskClients.length > 0 && (
            <section>
              <SectionHeader
                icon={Users}
                title="Clients Going Cold"
                subtitle="Haven't booked in 21+ days"
              />
              <div className="mt-4 rounded-xl border border-border bg-card">
                <div className="divide-y divide-border">
                  {data.atRiskClients.map((client) => (
                    <div
                      key={client.id}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-sm font-semibold text-red-600">
                        {client.firstName.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {client.firstName} {client.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last visit {client.daysSinceLastVisit} days ago
                          {client.preferredService &&
                            ` · ${client.preferredService}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          ${client.totalSpent.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {client.totalVisits} visits
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Peak Analysis */}
          <section>
            <SectionHeader
              icon={BarChart3}
              title="Peak Analysis"
              subtitle="When your business is busiest"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Busiest
                </p>
                <p className="mt-2 text-lg font-bold text-foreground">
                  {data.peakAnalysis.busiestDay}s
                </p>
                <p className="text-sm text-muted-foreground">
                  around {data.peakAnalysis.busiestHour}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Quietest
                </p>
                <p className="mt-2 text-lg font-bold text-foreground">
                  {data.peakAnalysis.quietestDay}s
                </p>
                <p className="text-sm text-muted-foreground">
                  around {data.peakAnalysis.quietestHour}
                </p>
              </div>
              {data.peakAnalysis.saturdayDemandMultiplier && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-medium text-amber-700">
                      Saturday demand is{" "}
                      {data.peakAnalysis.saturdayDemandMultiplier}x your
                      weekday average
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Top Services */}
          {data.topServices.length > 0 && (
            <section>
              <SectionHeader
                icon={TrendingUp}
                title="Top Services"
                subtitle="Last 30 days"
              />
              <div className="mt-4 rounded-xl border border-border bg-card">
                <div className="divide-y divide-border">
                  {data.topServices.map((svc, i) => (
                    <div
                      key={svc.name}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {svc.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {svc.bookings} bookings
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          ${svc.revenue.toLocaleString()}
                        </span>
                        {svc.trend === "up" && (
                          <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
                        )}
                        {svc.trend === "down" && (
                          <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {svc.trend === "flat" && (
                          <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ── Right: Business Advisor Chat ─────────────────────── */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  Business Advisor
                </h3>
                <p className="text-xs text-muted-foreground">
                  Ask anything about your business
                </p>
              </div>
            </div>

            <div className="h-[420px] overflow-y-auto px-4 py-4">
              {advisorHistory.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Brain className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Your $10K/month consultant
                  </p>
                  <p className="mt-1 max-w-[200px] text-xs text-muted-foreground/70">
                    Ask about pricing, scheduling, growth — get data-backed
                    answers instantly
                  </p>
                  <div className="mt-6 space-y-2">
                    {[
                      "Should I add Saturday slots?",
                      "Should I raise my prices?",
                      "How do I fill empty slots?",
                      "Which service should I promote?",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => {
                          setAdvisorQuestion(q);
                        }}
                        className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {advisorHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2.5",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "advisor" && (
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600">
                        <Brain className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
                        msg.role === "user"
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {askAdvisor.isPending && (
                  <div className="flex gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600">
                      <Brain className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="rounded-xl bg-muted px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Analyzing your data…
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            <form
              onSubmit={handleAsk}
              className="border-t border-border px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <input
                  value={advisorQuestion}
                  onChange={(e) => setAdvisorQuestion(e.target.value)}
                  placeholder="Should I raise my prices?"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!advisorQuestion.trim() || askAdvisor.isPending}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  trend,
  isMuted,
}: {
  label: string;
  value: string;
  sub: string;
  trend: number;
  isMuted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between">
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {!isMuted && trend !== 0 && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold",
              trend > 0
                ? "bg-green-500/10 text-green-600"
                : "bg-red-500/10 text-red-600"
            )}
          >
            {trend > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div>
        <h2 className="font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
