"use client";

import { useState } from "react";
import {
  DollarSign,
  Clock,
  Users,
  Calendar,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

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
      return {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
      };
    }
    case "last_month": {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
      };
    }
    case "this_month":
    default: {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
      };
    }
  }
}

export default function PayrollPage() {
  const [period, setPeriod] = useState("this_month");
  const { start, end } = getDateRange(period);

  const { data: earnings, isLoading } = trpc.payroll.getStaffEarnings.useQuery({
    startDate: start,
    endDate: end,
  });

  const { data: report } = trpc.payroll.generateReport.useQuery({
    startDate: start,
    endDate: end,
  });

  const totalEarnings = earnings?.reduce((sum, e) => sum + e.totalEarnings, 0) ?? 0;
  const totalRevenue = report?.totalRevenue ?? 0;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Payroll</h1>
          <p className="mt-1 text-muted-foreground">
            Track staff earnings, commissions, and hourly pay.
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
        </select>
      </div>

      {/* Summary Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-input bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            Total Revenue
          </div>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-xl border border-input bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Staff Payouts
          </div>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(totalEarnings)}</p>
        </div>
        <div className="rounded-xl border border-input bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Appointments
          </div>
          <p className="mt-1 text-2xl font-bold">{report?.totalAppointments ?? 0}</p>
        </div>
        <div className="rounded-xl border border-input bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            Active Staff
          </div>
          <p className="mt-1 text-2xl font-bold">{report?.staffCount ?? 0}</p>
        </div>
      </div>

      {/* Staff Earnings Table */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Staff Earnings Breakdown</h2>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !earnings?.length ? (
          <div className="rounded-xl border border-dashed border-input py-12 text-center">
            <p className="text-muted-foreground">No completed appointments in this period.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-input">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Staff Member</th>
                  <th className="px-4 py-3 text-right font-medium">Appointments</th>
                  <th className="px-4 py-3 text-right font-medium">Hours</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  <th className="px-4 py-3 text-right font-medium">Commission</th>
                  <th className="px-4 py-3 text-right font-medium">Hourly Pay</th>
                  <th className="px-4 py-3 text-right font-medium">Total Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-input">
                {earnings.map((e) => (
                  <tr key={e.staffMemberId} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{e.displayName}</td>
                    <td className="px-4 py-3 text-right">{e.appointments}</td>
                    <td className="px-4 py-3 text-right">{e.totalHours}h</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(e.totalRevenue)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(e.commission)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(e.hourlyEarnings)}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCurrency(e.totalEarnings)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/50">
                <tr>
                  <td className="px-4 py-3 font-semibold">Total</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {earnings.reduce((s, e) => s + e.appointments, 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {earnings.reduce((s, e) => s + e.totalHours, 0)}h
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatCurrency(earnings.reduce((s, e) => s + e.totalRevenue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatCurrency(earnings.reduce((s, e) => s + e.commission, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatCurrency(earnings.reduce((s, e) => s + e.hourlyEarnings, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold">
                    {formatCurrency(totalEarnings)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
