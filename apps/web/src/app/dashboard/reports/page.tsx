"use client";

import { useState } from "react";
import {
  BarChart3,
  DollarSign,
  Users,
  Calendar,
  TrendingUp,
  TrendingDown,
  Loader2,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function getDateRange(period: string): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "this_week": {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
    }
    case "last_month": {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
    }
    case "this_quarter": {
      const qStart = new Date(year, Math.floor(month / 3) * 3, 1);
      const qEnd = new Date(year, Math.floor(month / 3) * 3 + 3, 0);
      return { start: qStart.toISOString().split("T")[0], end: qEnd.toISOString().split("T")[0] };
    }
    case "this_month":
    default: {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
    }
  }
}

type Tab = "overview" | "services" | "staff" | "retention";

export default function ReportsPage() {
  const [period, setPeriod] = useState("this_month");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { start, end } = getDateRange(period);

  const { data: summary, isLoading: summaryLoading } = trpc.reports.summary.useQuery({
    startDate: start,
    endDate: end,
  });

  const { data: serviceRevenue } = trpc.reports.revenueByService.useQuery(
    { startDate: start, endDate: end },
    { enabled: activeTab === "services" || activeTab === "overview" }
  );

  const { data: staffPerf } = trpc.reports.staffPerformance.useQuery(
    { startDate: start, endDate: end },
    { enabled: activeTab === "staff" }
  );

  const { data: retention } = trpc.reports.retentionCohorts.useQuery(
    { months: 6 },
    { enabled: activeTab === "retention" }
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "services", label: "Services" },
    { id: "staff", label: "Staff" },
    { id: "retention", label: "Retention" },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-muted-foreground">
            Business performance analytics and insights.
          </p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="this_week">This Week</option>
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="this_quarter">This Quarter</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-input">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === "overview" && (
        <div className="mt-6">
          {summaryLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : summary ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={<DollarSign className="h-5 w-5" />}
                  label="Revenue"
                  value={formatCurrency(summary.revenue)}
                  color="text-green-600"
                />
                <StatCard
                  icon={<Calendar className="h-5 w-5" />}
                  label="Appointments"
                  value={summary.totalAppointments.toString()}
                  sub={`${summary.completed} completed`}
                />
                <StatCard
                  icon={<UserPlus className="h-5 w-5" />}
                  label="New Clients"
                  value={summary.newClients.toString()}
                />
                <StatCard
                  icon={<AlertTriangle className="h-5 w-5" />}
                  label="No-Show Rate"
                  value={`${summary.noShowRate}%`}
                  color={summary.noShowRate > 10 ? "text-red-500" : "text-green-600"}
                  sub={`${summary.noShows} no-shows`}
                />
              </div>

              {/* Top Services */}
              {serviceRevenue && serviceRevenue.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Top Services by Revenue
                  </h3>
                  <div className="space-y-2">
                    {serviceRevenue.slice(0, 5).map((s) => {
                      const maxRevenue = serviceRevenue[0].revenue;
                      const pct = maxRevenue > 0 ? (s.revenue / maxRevenue) * 100 : 0;
                      return (
                        <div key={s.serviceId} className="flex items-center gap-3">
                          <span className="w-32 truncate text-sm font-medium">{s.name}</span>
                          <div className="flex-1">
                            <div className="h-6 w-full rounded-full bg-muted">
                              <div
                                className="h-6 rounded-full bg-accent/70"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <span className="w-24 text-right text-sm font-medium">
                            {formatCurrency(s.revenue)}
                          </span>
                          <span className="w-12 text-right text-xs text-muted-foreground">
                            {s.count}x
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Services Tab */}
      {activeTab === "services" && serviceRevenue && (
        <div className="mt-6">
          <div className="overflow-hidden rounded-xl border border-input">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Service</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Bookings</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  <th className="px-4 py-3 text-right font-medium">Avg Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-input">
                {serviceRevenue.map((s) => (
                  <tr key={s.serviceId} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.category ?? "-"}</td>
                    <td className="px-4 py-3 text-right">{s.count}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.revenue)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.avgRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Staff Tab */}
      {activeTab === "staff" && staffPerf && (
        <div className="mt-6">
          <div className="overflow-hidden rounded-xl border border-input">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Staff</th>
                  <th className="px-4 py-3 text-right font-medium">Appointments</th>
                  <th className="px-4 py-3 text-right font-medium">Completed</th>
                  <th className="px-4 py-3 text-right font-medium">No-Shows</th>
                  <th className="px-4 py-3 text-right font-medium">Completion %</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  <th className="px-4 py-3 text-right font-medium">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-input">
                {staffPerf.map((s) => (
                  <tr key={s.staffMemberId} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{s.displayName}</td>
                    <td className="px-4 py-3 text-right">{s.totalAppointments}</td>
                    <td className="px-4 py-3 text-right">{s.completed}</td>
                    <td className="px-4 py-3 text-right">{s.noShows}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "font-medium",
                          s.completionRate >= 90
                            ? "text-green-600"
                            : s.completionRate >= 70
                              ? "text-yellow-600"
                              : "text-red-500"
                        )}
                      >
                        {s.completionRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.revenue)}</td>
                    <td className="px-4 py-3 text-right">{s.utilization}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Retention Tab */}
      {activeTab === "retention" && retention && (
        <div className="mt-6">
          <p className="mb-4 text-sm text-muted-foreground">
            What percentage of new clients from each month came back the following month?
          </p>
          <div className="overflow-hidden rounded-xl border border-input">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Cohort Month</th>
                  <th className="px-4 py-3 text-right font-medium">New Clients</th>
                  <th className="px-4 py-3 text-right font-medium">Returned Next Month</th>
                  <th className="px-4 py-3 text-right font-medium">Retention Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-input">
                {retention.map((c) => (
                  <tr key={c.month} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{c.month}</td>
                    <td className="px-4 py-3 text-right">{c.newClients}</td>
                    <td className="px-4 py-3 text-right">{c.returnedNext}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-16 rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-2 rounded-full",
                              c.retentionRate >= 50
                                ? "bg-green-500"
                                : c.retentionRate >= 25
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                            )}
                            style={{ width: `${c.retentionRate}%` }}
                          />
                        </div>
                        <span className="font-medium">{c.retentionRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-input bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={cn("mt-1 text-2xl font-bold", color)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
