"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Filter,
  Loader2,
  MessageSquare,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type StatusFilter =
  | "ALL"
  | "PENDING_APPROVAL"
  | "WAITING_CLIENT"
  | "APPROVED"
  | "REJECTED";
type ChannelFilter = "ALL" | "EMAIL" | "SMS" | "WHATSAPP";

const STATUS_STYLES: Record<StatusFilter, string> = {
  ALL: "bg-muted text-muted-foreground",
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-700",
  WAITING_CLIENT: "bg-blue-500/10 text-blue-700",
  APPROVED: "bg-emerald-500/10 text-emerald-700",
  REJECTED: "bg-red-500/10 text-red-700",
};

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-700",
  high: "bg-orange-500/10 text-orange-700",
  medium: "bg-blue-500/10 text-blue-700",
  low: "bg-muted text-muted-foreground",
};

const REQUEST_LABELS: Record<string, string> = {
  create_appointment: "New booking",
  reschedule_appointment: "Reschedule request",
  cancel_appointment: "Cancellation request",
  confirm_appointment: "Confirmation request",
};

const POLICY_LABELS: Array<{
  key: "create_appointment" | "reschedule_appointment" | "cancel_appointment" | "confirm_appointment";
  label: string;
}> = [
  { key: "create_appointment", label: "New bookings from inbound chat" },
  { key: "reschedule_appointment", label: "Reschedules" },
  { key: "cancel_appointment", label: "Cancellations" },
  { key: "confirm_appointment", label: "Confirm attendance" },
];

function formatAgo(date: string | Date) {
  const ts = new Date(date).getTime();
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateTime(iso?: string) {
  if (!iso) return "Not specified";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseActionPayload(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function looksLikeInternalId(value: string): boolean {
  return /^cm[a-z0-9]{8,}$/i.test(value);
}

export default function RequestCentrePage() {
  const [status, setStatus] = useState<StatusFilter>("PENDING_APPROVAL");
  const [channel, setChannel] = useState<ChannelFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownerMessage, setOwnerMessage] = useState("");

  const utils = trpc.useUtils();

  const queueQuery = trpc.ai.getRequestQueue.useQuery({
    status,
    channel,
    search: search.trim() || undefined,
    limit: 120,
  });
  const statsQuery = trpc.ai.getRequestQueueStats.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const policyQuery = trpc.ai.getRequestAutomationPolicy.useQuery();

  const resolveMut = trpc.ai.resolvePendingApproval.useMutation({
    onSuccess: () => {
      setOwnerMessage("");
      void utils.ai.getRequestQueue.invalidate();
      void utils.ai.getRequestQueueStats.invalidate();
      void utils.ai.getNotificationCount.invalidate();
      void utils.ai.getPendingApprovals.invalidate();
      void utils.ai.getConversations.invalidate();
    },
  });

  const updateItemMut = trpc.ai.updateRequestItem.useMutation({
    onSuccess: () => void utils.ai.getRequestQueue.invalidate(),
  });

  const setPolicyMut = trpc.ai.setRequestAutomationPolicy.useMutation({
    onSuccess: () => {
      void utils.ai.getRequestAutomationPolicy.invalidate();
    },
  });

  const items = queueQuery.data ?? [];

  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
      return;
    }
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );
  const selectedPayload = useMemo(
    () => parseActionPayload(selectedItem?.functionArgs),
    [selectedItem?.functionArgs]
  );

  const stats = statsQuery.data ?? {
    pending: 0,
    waitingClient: 0,
    approved: 0,
    rejected: 0,
    overdue: 0,
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Request Centre</h1>
        <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          {stats.pending} pending
        </span>
        <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
          {stats.waitingClient} waiting on client
        </span>
        {stats.overdue > 0 && (
          <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-700">
            {stats.overdue} overdue
          </span>
        )}
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          {stats.approved} approved
        </span>
        <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-700">
          {stats.rejected} rejected
        </span>
      </div>

      <p className="mb-5 text-sm text-muted-foreground">
        Handle all customer requests in one place: approve, reject, or tune automation rules per request type.
      </p>

      <div className="mb-5 rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-accent" />
          Automation policy
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {POLICY_LABELS.map((policyItem) => {
            const mode =
              policyQuery.data?.[policyItem.key] ?? "require_approval";
            const pending = setPolicyMut.isPending;
            return (
              <div
                key={policyItem.key}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{policyItem.label}</p>
                  <p className="text-xs text-muted-foreground">{policyItem.key}</p>
                </div>
                <div className="flex items-center gap-1 rounded-md bg-muted p-1">
                  <button
                    disabled={pending || mode === "require_approval"}
                    onClick={() =>
                      setPolicyMut.mutate({ [policyItem.key]: "require_approval" })
                    }
                    className={cn(
                      "rounded px-2 py-1 text-xs font-medium transition-colors",
                      mode === "require_approval"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      pending && "opacity-50"
                    )}
                  >
                    Approve first
                  </button>
                  <button
                    disabled={pending || mode === "auto_execute"}
                    onClick={() =>
                      setPolicyMut.mutate({ [policyItem.key]: "auto_execute" })
                    }
                    className={cn(
                      "rounded px-2 py-1 text-xs font-medium transition-colors",
                      mode === "auto_execute"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      pending && "opacity-50"
                    )}
                  >
                    Auto execute
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(
            ["PENDING_APPROVAL", "WAITING_CLIENT", "APPROVED", "REJECTED", "ALL"] as const
          ).map(
            (s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  status === s
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {s === "PENDING_APPROVAL"
                  ? "Needs approval"
                  : s === "WAITING_CLIENT"
                    ? "Waiting client"
                  : s === "APPROVED"
                    ? "Approved"
                    : s === "REJECTED"
                      ? "Rejected"
                      : "All"}
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(["ALL", "EMAIL", "SMS", "WHATSAPP"] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                channel === ch
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {ch}
            </button>
          ))}
        </div>

        <div className="flex min-w-[260px] items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, request, or message..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="grid flex-1 gap-4 overflow-hidden xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            Queue
          </div>
          <div className="h-[calc(100%-49px)] overflow-y-auto">
            {queueQuery.isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <MessageSquare className="mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">No requests found</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try different filters or wait for new inbound messages.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      selectedId === item.id && "bg-accent/40"
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {item.clientName}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                          STATUS_STYLES[
                            (item.status as StatusFilter) ?? "PENDING_APPROVAL"
                          ]
                        )}
                      >
                        {item.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{REQUEST_LABELS[item.requestType] ?? item.requestType}</span>
                      <span>•</span>
                      <span>{item.channel}</span>
                      <span>•</span>
                      <span>{formatAgo(item.createdAt)}</span>
                    </div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {item.clientMessage || item.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            Request details
          </div>
          <div className="h-[calc(100%-49px)] overflow-y-auto p-4">
            {!selectedItem ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a request from the queue.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    {REQUEST_LABELS[selectedItem.requestType] ?? selectedItem.requestType}
                  </h2>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      PRIORITY_STYLES[selectedItem.priority] ?? PRIORITY_STYLES.low
                    )}
                  >
                    {selectedItem.priority}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {selectedItem.channel}
                  </span>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">{selectedItem.clientName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedItem.clientEmail || selectedItem.clientPhone || "No contact saved"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {formatAgo(selectedItem.createdAt)}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Client message
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {selectedItem.clientMessage || "No message captured."}
                  </p>
                </div>

                {selectedItem.functionArgs && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Proposed action
                    </p>
                    {selectedPayload ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Action</span>
                          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                            {REQUEST_LABELS[selectedItem.requestType] ?? selectedItem.requestType}
                          </span>
                        </div>

                        {"appointmentId" in selectedPayload && (
                          <div>
                            <p className="text-xs text-muted-foreground">Appointment reference</p>
                            <p className="font-medium">
                              {String(selectedPayload.appointmentId ?? "Unknown")}
                            </p>
                            {typeof selectedPayload.appointmentId === "string" &&
                              !looksLikeInternalId(selectedPayload.appointmentId) && (
                                <p className="mt-0.5 text-xs text-amber-700">
                                  This reference is ambiguous. Resolver will map to the most relevant appointment.
                                </p>
                              )}
                          </div>
                        )}

                        {"newDateTime" in selectedPayload && (
                          <div>
                            <p className="text-xs text-muted-foreground">Requested new time</p>
                            <p className="font-medium">
                              {formatDateTime(String(selectedPayload.newDateTime ?? ""))}
                            </p>
                          </div>
                        )}

                        <details className="rounded bg-muted p-2">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                            View raw payload
                          </summary>
                          <pre className="mt-2 overflow-x-auto text-xs text-foreground">
{selectedItem.functionArgs}
                          </pre>
                        </details>
                      </div>
                    ) : (
                      <pre className="overflow-x-auto rounded bg-muted p-2 text-xs text-foreground">
{selectedItem.functionArgs}
                      </pre>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Queue controls
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {(["urgent", "high", "medium", "low"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() =>
                          updateItemMut.mutate({
                            actionLogId: selectedItem.id,
                            priority: p,
                          })
                        }
                        className={cn(
                          "rounded px-2 py-1 text-xs font-medium transition-colors",
                          selectedItem.priority === p
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                          updateItemMut.isPending && "opacity-50"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        updateItemMut.mutate({
                          actionLogId: selectedItem.id,
                          snoozedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                        })
                      }
                      className="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Snooze 1h
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Response message (optional override)
                  </p>
                  <textarea
                    value={ownerMessage}
                    onChange={(e) => setOwnerMessage(e.target.value)}
                    placeholder="Optional custom message to customer…"
                    className="min-h-24 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>

                {selectedItem.status === "PENDING_APPROVAL" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() =>
                        resolveMut.mutate({
                          actionLogId: selectedItem.id,
                          decision: "APPROVE",
                          ownerMessage: ownerMessage.trim() || undefined,
                        })
                      }
                      disabled={resolveMut.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {resolveMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve & execute
                    </button>
                    <button
                      onClick={() =>
                        resolveMut.mutate({
                          actionLogId: selectedItem.id,
                          decision: "REJECT",
                          ownerMessage: ownerMessage.trim() || undefined,
                        })
                      }
                      disabled={resolveMut.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                    <div className="mb-1 flex items-center gap-1.5">
                      {selectedItem.status === "APPROVED" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : selectedItem.status === "REJECTED" ? (
                        <XCircle className="h-4 w-4 text-red-600" />
                      ) : (
                        <Clock3 className="h-4 w-4" />
                      )}
                      <span className="font-medium text-foreground">
                        {selectedItem.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    {selectedItem.executionResult ? (
                      <p>{selectedItem.executionResult}</p>
                    ) : (
                      <p>No execution details recorded.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

