"use client";

import {
  Calendar,
  Users,
  TrendingUp,
  Clock,
  ArrowRight,
  Sparkles,
  Loader2,
  Sun,
  AlertTriangle,
  DollarSign,
  UserX,
  ListChecks,
  Zap,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const quickActions = [
  { name: "Set up your services", description: "Define what you offer", href: "/dashboard/services" },
  { name: "Add staff members", description: "Set up your team", href: "/dashboard/staff" },
  { name: "Customize booking page", description: "Let clients book online", href: "/dashboard/settings" },
  { name: "Connect messaging", description: "SMS, email & WhatsApp", href: "/dashboard/settings" },
];

function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(date: string | Date) {
  const d = new Date(date);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const { data: stats, isLoading } = trpc.organization.dashboardStats.useQuery();
  const { data: org } = trpc.organization.getCurrent.useQuery();
  const { data: briefing } = trpc.organization.morningBriefing.useQuery();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  const statCards = [
    {
      name: "Today's Appointments",
      value: String(stats?.todayAppointments ?? 0),
      icon: Calendar,
    },
    {
      name: "Total Clients",
      value: String(stats?.totalClients ?? 0),
      icon: Users,
    },
    {
      name: "This Month",
      value: String(stats?.monthBookings ?? 0),
      icon: TrendingUp,
    },
    {
      name: "No-Show Rate",
      value: `${stats?.noShowRate ?? 0}%`,
      icon: Clock,
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          {org ? `Welcome back, ${org.name.split(" ")[0]}` : "Welcome to BookAI"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your AI-powered scheduling assistant. Here&apos;s what&apos;s happening today.
        </p>
      </div>

      {/* AI Morning Briefing */}
      {briefing && (
        <div className="mb-8 rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 shadow-sm">
              <Sun className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-amber-900">
                  {briefing.greeting}!
                </h2>
                <span className="rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-semibold text-amber-800 uppercase tracking-wider">
                  Daily Briefing
                </span>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-amber-900/80">
                You have <span className="font-bold text-amber-900">{briefing.todayCount} session{briefing.todayCount !== 1 ? "s" : ""}</span> today
                {briefing.firstAppt && (
                  <>, starting at <span className="font-semibold">{formatTime(briefing.firstAppt.time)}</span> with {briefing.firstAppt.clientName}</>
                )}
                {briefing.lastAppt && (
                  <>, wrapping up by <span className="font-semibold">{formatTime(briefing.lastAppt.time)}</span></>
                )}.
                {briefing.tomorrowCount > 0 && (
                  <> Tomorrow has {briefing.tomorrowCount} booked.</>
                )}
                {briefing.weekCount > 0 && (
                  <> This week: <span className="font-semibold">{briefing.weekCount} total</span>.</>
                )}
              </p>

              {/* Quick insights grid */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {briefing.todayRevenue > 0 && (
                  <BriefingChip
                    icon={<DollarSign className="h-3.5 w-3.5" />}
                    label="Today's revenue"
                    value={`$${briefing.todayRevenue.toFixed(0)}`}
                    color="emerald"
                  />
                )}
                {briefing.pendingCount > 0 && (
                  <BriefingChip
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Need confirmation"
                    value={String(briefing.pendingCount)}
                    color="amber"
                  />
                )}
                {briefing.waitlistCount > 0 && (
                  <BriefingChip
                    icon={<ListChecks className="h-3.5 w-3.5" />}
                    label="On waitlist"
                    value={String(briefing.waitlistCount)}
                    color="blue"
                  />
                )}
                {briefing.gaps.length > 0 && (
                  <BriefingChip
                    icon={<Zap className="h-3.5 w-3.5" />}
                    label="Open gaps"
                    value={String(briefing.gaps.length)}
                    color="violet"
                  />
                )}
              </div>

              {/* Alerts */}
              <div className="mt-3 space-y-1.5">
                {briefing.recentCancellations.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50/80 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    <p className="text-xs text-red-800">
                      <span className="font-semibold">{briefing.recentCancellations.length} cancellation{briefing.recentCancellations.length > 1 ? "s" : ""}</span> in the last 24h
                      {briefing.recentCancellations.length <= 2 && (
                        <>: {briefing.recentCancellations.map((c) => c.clientName).join(", ")}</>
                      )}
                      {briefing.waitlistCount > 0 && (
                        <> — <span className="font-medium">{briefing.waitlistCount} people on waitlist</span> could fill the gap.</>
                      )}
                    </p>
                  </div>
                )}
                {briefing.staffOnLeave.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg bg-orange-50/80 px-3 py-2">
                    <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                    <p className="text-xs text-orange-800">
                      <span className="font-semibold">{briefing.staffOnLeave.join(", ")}</span> {briefing.staffOnLeave.length === 1 ? "is" : "are"} off today.
                    </p>
                  </div>
                )}
                {briefing.gaps.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg bg-violet-50/80 px-3 py-2">
                    <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                    <p className="text-xs text-violet-800">
                      Open gaps: {briefing.gaps.slice(0, 3).map((g) => `${g.staffName} at ${g.time}`).join(", ")}
                      {briefing.gaps.length > 3 && ` +${briefing.gaps.length - 3} more`}.
                      {briefing.waitlistCount > 0 && " Want me to text the waitlist?"}
                    </p>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/dashboard/calendar"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900/10 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-900/20"
                >
                  <Calendar className="h-3.5 w-3.5" /> View Calendar <ChevronRight className="h-3 w-3" />
                </Link>
                <Link
                  href="/dashboard/availability"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900/10 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-900/20"
                >
                  <Clock className="h-3.5 w-3.5" /> Manage Availability <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="rounded-xl border border-border bg-card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <stat.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground">{stat.name}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {stats?.upcomingAppointments && stats.upcomingAppointments.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Upcoming Appointments
          </h2>
          <div className="space-y-2">
            {stats.upcomingAppointments.map((appt) => (
              <div
                key={appt.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                    {appt.client.firstName[0]}
                    {appt.client.lastName?.[0] || ""}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {appt.client.firstName} {appt.client.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {appt.service.name}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">
                    {formatTime(appt.startTime)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(appt.startTime)}
                  </p>
                </div>
                <span
                  className={`ml-4 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    appt.status === "CONFIRMED"
                      ? "bg-green-50 text-green-700"
                      : "bg-yellow-50 text-yellow-700"
                  }`}
                >
                  {appt.status.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8 rounded-xl border border-accent/20 bg-accent/5 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            <Sparkles className="h-5 w-5 text-accent-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">
              Get started with AI
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try saying{" "}
              <span className="font-medium text-accent">
                &quot;Set up my business&quot;
              </span>{" "}
              in the AI chat panel. Your assistant will walk you through
              configuring services, hours, and staff -- all through conversation.
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Quick Setup
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {quickActions.map((action) => (
            <Link
              key={action.name}
              href={action.href}
              className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/50 hover:bg-accent/5"
            >
              <div>
                <p className="font-medium text-foreground">{action.name}</p>
                <p className="text-sm text-muted-foreground">
                  {action.description}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

const CHIP_COLORS = {
  emerald: "bg-emerald-100/80 text-emerald-800",
  amber: "bg-amber-200/60 text-amber-800",
  blue: "bg-blue-100/80 text-blue-800",
  violet: "bg-violet-100/80 text-violet-800",
} as const;

function BriefingChip({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: keyof typeof CHIP_COLORS;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5", CHIP_COLORS[color])}>
      {icon}
      <div>
        <p className="text-xs font-bold leading-none">{value}</p>
        <p className="text-[10px] opacity-70">{label}</p>
      </div>
    </div>
  );
}
