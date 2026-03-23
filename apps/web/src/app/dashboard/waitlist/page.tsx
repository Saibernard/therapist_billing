"use client";

import { useState } from "react";
import {
  Clock,
  Users,
  Bell,
  Check,
  Trash2,
  Calendar,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; dotColor: string }
> = {
  WAITING: {
    label: "Waiting",
    color: "bg-blue-500/10 text-blue-600",
    dotColor: "bg-blue-500",
  },
  NOTIFIED: {
    label: "Notified",
    color: "bg-yellow-500/10 text-yellow-600",
    dotColor: "bg-yellow-500",
  },
  BOOKED: {
    label: "Booked",
    color: "bg-green-500/10 text-green-600",
    dotColor: "bg-green-500",
  },
  EXPIRED: {
    label: "Expired",
    color: "bg-gray-500/10 text-gray-500",
    dotColor: "bg-gray-400",
  },
};

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export default function WaitlistPage() {
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: entries, isLoading } = trpc.waitlist.list.useQuery();

  const updateStatusMutation = trpc.waitlist.updateStatus.useMutation({
    onSuccess: () => {
      utils.waitlist.list.invalidate();
      setActionLoadingId(null);
    },
    onError: () => setActionLoadingId(null),
  });

  const removeMutation = trpc.waitlist.remove.useMutation({
    onSuccess: () => {
      utils.waitlist.list.invalidate();
      setActionLoadingId(null);
    },
    onError: () => setActionLoadingId(null),
  });

  const waitlist = entries ?? [];

  function handleNotify(id: string) {
    setActionLoadingId(id);
    updateStatusMutation.mutate({ id, status: "NOTIFIED" });
  }

  function handleMarkBooked(id: string) {
    setActionLoadingId(id);
    updateStatusMutation.mutate({ id, status: "BOOKED" });
  }

  function handleRemove(id: string) {
    setActionLoadingId(id);
    removeMutation.mutate({ id });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Waitlist</h1>
          {waitlist.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
              {waitlist.length}
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">
        Manage clients waiting for available appointment slots.
      </p>

      {isLoading ? (
        <div className="mt-12 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Loading waitlist…
          </p>
        </div>
      ) : waitlist.length === 0 ? (
        <div className="mt-8 flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
          <Users className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">No one on the waitlist</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When clients request unavailable slots, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Client
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground md:table-cell">
                  Service
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground lg:table-cell">
                  Preferred Date
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground lg:table-cell">
                  Preferred Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {waitlist.map((entry) => {
                const statusConf =
                  STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.WAITING;
                const isLoading = actionLoadingId === entry.id;
                const isActionable =
                  entry.status === "WAITING" || entry.status === "NOTIFIED";

                return (
                  <tr
                    key={entry.id}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                          {entry.client?.firstName?.[0] ?? "?"}
                          {entry.client?.lastName?.[0] ?? ""}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {[entry.client?.firstName, entry.client?.lastName]
                              .filter(Boolean)
                              .join(" ") || "Unknown Client"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground md:hidden">
                            {entry.service?.name ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="text-sm text-foreground">
                        {entry.service?.name ?? "—"}
                      </span>
                    </td>

                    <td className="hidden px-4 py-3 lg:table-cell">
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {entry.preferredDate
                          ? formatDate(entry.preferredDate)
                          : "—"}
                      </span>
                    </td>

                    <td className="hidden px-4 py-3 lg:table-cell">
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {entry.preferredTime
                          ? formatTime(
                              new Date(`1970-01-01T${entry.preferredTime}`)
                            )
                          : "—"}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                          statusConf.color
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            statusConf.dotColor
                          )}
                        />
                        {statusConf.label}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : isActionable ? (
                          <>
                            {entry.status === "WAITING" && (
                              <button
                                onClick={() => handleNotify(entry.id)}
                                title="Notify"
                                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-yellow-500/10 hover:text-yellow-600"
                              >
                                <Bell className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Notify</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleMarkBooked(entry.id)}
                              title="Mark Booked"
                              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-green-500/10 hover:text-green-600"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Booked</span>
                            </button>
                            <button
                              onClick={() => handleRemove(entry.id)}
                              title="Remove"
                              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Remove</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleRemove(entry.id)}
                            title="Remove"
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Remove</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
