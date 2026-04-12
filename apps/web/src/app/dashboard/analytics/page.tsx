"use client";

import { useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  Users,
  UserPlus,
  AlertTriangle,
  Percent,
  Clock,
  User,
  Scissors,
  Download,
  Loader2,
  BarChart3,
  TrendingUp,
  Sparkles,
  RefreshCw,
  Target,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  colorClass: string;
  iconBgClass: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  CONFIRMED: {
    label: "Confirmed",
    className: "bg-green-500/10 text-green-600",
  },
  PENDING: {
    label: "Pending",
    className: "bg-yellow-500/10 text-yellow-600",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-red-500/10 text-red-500",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-blue-500/10 text-blue-600",
  },
  NO_SHOW: {
    label: "No Show",
    className: "bg-orange-500/10 text-orange-600",
  },
};

function KpiCard({ icon: Icon, label, value, colorClass, iconBgClass }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className={cn("mt-2 text-3xl font-bold tracking-tight", colorClass)}>
            {value}
          </p>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconBgClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        <TrendingUp className="h-3 w-3" />
        <span>vs. last period</span>
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="mt-3 h-3 w-20 animate-pulse rounded bg-muted" />
    </div>
  );
}

function AppointmentRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="h-10 w-16 animate-pulse rounded-lg bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
    </div>
  );
}

function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export default function AnalyticsPage() {
  const today = new Date().toISOString().split("T")[0]!;
  const [riskDate, setRiskDate] = useState(today);

  const { data: dashboard, isLoading: dashLoading } =
    trpc.analytics.dashboard.useQuery();

  const { data: upcoming, isLoading: upcomingLoading } =
    trpc.analytics.upcomingAppointments.useQuery({ limit: 5 });

  const { data: noShowRisks } = trpc.analytics.noShowRisk.useQuery({
    date: riskDate,
    threshold: 30,
  });

  const { data: optimizationReport } = trpc.analytics.optimizationReport.useQuery({
    date: riskDate,
  });

  const scoreMutation = trpc.analytics.scoreNoShowRisk.useMutation();

  const kpiCards: (KpiCardProps & { key: string })[] = dashboard
    ? [
        {
          key: "today",
          icon: CalendarCheck,
          label: "Today's Appointments",
          value: dashboard.todayAppointments,
          colorClass: "text-blue-600",
          iconBgClass: "bg-blue-500/10 text-blue-600",
        },
        {
          key: "monthly",
          icon: CalendarDays,
          label: "Monthly Bookings",
          value: dashboard.monthlyAppointments,
          colorClass: "text-blue-600",
          iconBgClass: "bg-blue-500/10 text-blue-600",
        },
        {
          key: "totalClients",
          icon: Users,
          label: "Total Clients",
          value: dashboard.totalClients,
          colorClass: "text-green-600",
          iconBgClass: "bg-green-500/10 text-green-600",
        },
        {
          key: "newClients",
          icon: UserPlus,
          label: "New Clients (30d)",
          value: dashboard.newClientsLast30Days,
          colorClass: "text-green-600",
          iconBgClass: "bg-green-500/10 text-green-600",
        },
        {
          key: "noShows",
          icon: AlertTriangle,
          label: "No-Shows (30d)",
          value: dashboard.noShowsLast30Days,
          colorClass: "text-orange-500",
          iconBgClass: "bg-orange-500/10 text-orange-600",
        },
        {
          key: "noShowRate",
          icon: Percent,
          label: "No-Show Rate",
          value: `${dashboard.noShowRate}%`,
          colorClass: dashboard.noShowRate > 15 ? "text-red-500" : "text-orange-500",
          iconBgClass:
            dashboard.noShowRate > 15
              ? "bg-red-500/10 text-red-500"
              : "bg-orange-500/10 text-orange-600",
        },
      ]
    : [];

  function handleExportCsv() {
    if (!dashboard) return;

    const rows = [
      ["Metric", "Value"],
      ["Today's Appointments", String(dashboard.todayAppointments)],
      ["Monthly Bookings", String(dashboard.monthlyAppointments)],
      ["Total Clients", String(dashboard.totalClients)],
      ["New Clients (Last 30 Days)", String(dashboard.newClientsLast30Days)],
      ["No-Shows (Last 30 Days)", String(dashboard.noShowsLast30Days)],
      ["No-Show Rate (%)", String(dashboard.noShowRate)],
    ];

    if (upcoming && upcoming.length > 0) {
      rows.push([]);
      rows.push(["Upcoming Appointments", "", "", "", ""]);
      rows.push(["Date", "Time", "Client", "Service", "Staff"]);
      for (const apt of upcoming) {
        const clientName = apt.client
          ? [apt.client.firstName, apt.client.lastName].filter(Boolean).join(" ")
          : "Unknown";
        rows.push([
          formatDate(apt.startTime),
          formatTime(apt.startTime),
          clientName,
          apt.service?.name ?? "N/A",
          apt.staffMember?.displayName ?? "N/A",
        ]);
      }
    }

    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `analytics-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            Business insights, booking trends, and client metrics.
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={!dashboard}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Download CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {dashLoading
          ? Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpiCards.map((card) => <KpiCard key={card.key} {...card} />)}

        {!dashLoading && !dashboard && (
          <div className="col-span-full flex h-40 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
            <BarChart3 className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No analytics data yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Start booking appointments to see your dashboard come alive.
            </p>
          </div>
        )}
      </div>

      {/* Upcoming Appointments */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Upcoming Appointments</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your next 5 scheduled bookings
        </p>

        <div className="mt-4 space-y-2">
          {upcomingLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <AppointmentRowSkeleton key={i} />
            ))
          ) : !upcoming || upcoming.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
              <CalendarCheck className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                No upcoming appointments
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                New bookings will appear here automatically.
              </p>
            </div>
          ) : (
            upcoming.map((apt) => {
              const clientName = apt.client
                ? [apt.client.firstName, apt.client.lastName]
                    .filter(Boolean)
                    .join(" ")
                : "Unknown Client";
              const staffName = apt.staffMember?.displayName ?? "Unassigned";
              const serviceName = apt.service?.name ?? "Unknown Service";
              const serviceColor = apt.service?.color ?? "#6B7280";
              const badge = STATUS_BADGE[apt.status] ?? STATUS_BADGE.PENDING;

              return (
                <div
                  key={apt.id}
                  className="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 transition-shadow hover:shadow-md"
                >
                  {/* Time block */}
                  <div className="hidden shrink-0 flex-col items-center rounded-lg bg-muted px-3 py-2 sm:flex">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {formatDate(apt.startTime)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatTime(apt.startTime)}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: serviceColor }}
                      />
                      <p className="truncate text-sm font-semibold text-foreground">
                        {serviceName}
                      </p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {clientName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Scissors className="h-3 w-3" />
                        {staffName}
                      </span>
                      <span className="flex items-center gap-1 sm:hidden">
                        <Clock className="h-3 w-3" />
                        {formatTime(apt.startTime)}
                      </span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      badge.className
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-500/10">
            <TrendingUp className="h-6 w-6 text-violet-500" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-foreground">
            Busiest Day
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Add more data to see trends
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10">
            <Sparkles className="h-6 w-6 text-amber-500" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-foreground">
            Top Service
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Book more appointments to see insights
          </p>
        </div>
      </div>

      {/* AI Optimization Section */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">AI Schedule Optimization</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              No-show risk predictions and utilization analysis
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={riskDate}
              onChange={(e) => setRiskDate(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
            <button
              onClick={() => scoreMutation.mutate({ date: riskDate, daysAhead: 3 })}
              disabled={scoreMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {scoreMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Score Risk
            </button>
          </div>
        </div>

        {scoreMutation.isSuccess && (
          <div className="mt-3 rounded-lg bg-green-500/10 px-4 py-2 text-xs text-green-700">
            Scored {scoreMutation.data.total} appointments — {scoreMutation.data.highRisk} flagged as high risk.
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* No-Show Risk */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              No-Show Risk
            </h3>
            {noShowRisks && noShowRisks.length > 0 ? (
              <div className="space-y-2">
                {noShowRisks.slice(0, 5).map((r) => (
                  <div
                    key={r.appointmentId}
                    className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{r.clientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.serviceName} at{" "}
                        {new Date(r.startTime).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-bold",
                        r.risk >= 70
                          ? "text-red-500"
                          : r.risk >= 50
                            ? "text-orange-500"
                            : "text-yellow-600"
                      )}
                    >
                      {r.risk}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No high-risk appointments for this date.
              </p>
            )}
          </div>

          {/* Optimization Suggestions */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4 text-violet-500" />
              Optimization Suggestions
            </h3>
            {optimizationReport && optimizationReport.suggestions.length > 0 ? (
              <div className="space-y-2">
                {optimizationReport.suggestions.map((s, i) => (
                  <div key={i} className="rounded-lg bg-muted/50 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                          s.priority === "high"
                            ? "bg-red-500/10 text-red-600"
                            : s.priority === "medium"
                              ? "bg-yellow-500/10 text-yellow-600"
                              : "bg-blue-500/10 text-blue-600"
                        )}
                      >
                        {s.priority}
                      </span>
                      <p className="text-xs leading-relaxed">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {optimizationReport
                  ? "No optimization suggestions — schedule looks good!"
                  : "Loading..."}
              </p>
            )}
          </div>
        </div>

        {/* Staff Utilization */}
        {optimizationReport && optimizationReport.staffGaps.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-green-500" />
              Staff Utilization — {riskDate}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                Avg: {optimizationReport.averageUtilization}%
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {optimizationReport.staffGaps.map((g) => (
                <div key={g.staffMemberId} className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{g.staffName}</span>
                    <span
                      className={cn(
                        "text-xs font-bold",
                        g.utilizationPercent >= 70
                          ? "text-green-600"
                          : g.utilizationPercent >= 40
                            ? "text-yellow-600"
                            : "text-red-500"
                      )}
                    >
                      {g.utilizationPercent}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-1.5 rounded-full",
                        g.utilizationPercent >= 70
                          ? "bg-green-500"
                          : g.utilizationPercent >= 40
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      )}
                      style={{ width: `${g.utilizationPercent}%` }}
                    />
                  </div>
                  {g.totalGapMinutes > 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {g.gaps.length} gap{g.gaps.length !== 1 ? "s" : ""} ({g.totalGapMinutes}min idle)
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
