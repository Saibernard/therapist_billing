"use client";

import { useState, useMemo } from "react";
import {
  Calendar,
  Plus,
  X,
  Loader2,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Eye,
  RotateCcw,
  ChevronDown,
  User,
  Scissors,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type DateRange = "today" | "week" | "month" | "custom";
type AppointmentStatus =
  | "all"
  | "CONFIRMED"
  | "PENDING"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; dotColor: string }
> = {
  CONFIRMED: {
    label: "Confirmed",
    color: "bg-green-500/10 text-green-600",
    dotColor: "bg-green-500",
  },
  PENDING: {
    label: "Pending",
    color: "bg-yellow-500/10 text-yellow-600",
    dotColor: "bg-yellow-500",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "bg-red-500/10 text-red-500",
    dotColor: "bg-red-500",
  },
  COMPLETED: {
    label: "Completed",
    color: "bg-blue-500/10 text-blue-600",
    dotColor: "bg-blue-500",
  },
  NO_SHOW: {
    label: "No Show",
    color: "bg-orange-500/10 text-orange-600",
    dotColor: "bg-orange-500",
  },
};

const SOURCE_STYLES: Record<string, string> = {
  MANUAL: "bg-muted text-muted-foreground",
  BOOKING_PAGE: "bg-indigo-500/10 text-indigo-600",
  AI_AGENT: "bg-violet-500/10 text-violet-600",
};

interface AppointmentFormData {
  clientId: string;
  serviceId: string;
  staffMemberId: string;
  date: string;
  time: string;
}

const emptyForm: AppointmentFormData = {
  clientId: "",
  serviceId: "",
  staffMemberId: "",
  date: "",
  time: "",
};

function getDateRange(range: DateRange, customStart?: string, customEnd?: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (range) {
    case "today":
      return {
        startDate: startOfDay.toISOString(),
        endDate: new Date(startOfDay.getTime() + 86400000).toISOString(),
      };
    case "week": {
      const dayOfWeek = startOfDay.getDay();
      const weekStart = new Date(startOfDay.getTime() - dayOfWeek * 86400000);
      return {
        startDate: weekStart.toISOString(),
        endDate: new Date(weekStart.getTime() + 7 * 86400000).toISOString(),
      };
    }
    case "month": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return {
        startDate: monthStart.toISOString(),
        endDate: monthEnd.toISOString(),
      };
    }
    case "custom":
      return {
        startDate: customStart
          ? new Date(customStart).toISOString()
          : startOfDay.toISOString(),
        endDate: customEnd
          ? new Date(customEnd + "T23:59:59").toISOString()
          : new Date(startOfDay.getTime() + 86400000).toISOString(),
      };
  }
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

function formatFullDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export default function AppointmentsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AppointmentFormData>(emptyForm);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  const utils = trpc.useUtils();
  const { startDate, endDate } = getDateRange(dateRange, customStart, customEnd);

  const { data, isLoading } = trpc.appointment.list.useQuery({
    startDate,
    endDate,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
  });

  const { data: clients } = trpc.client.list.useQuery({
    search: clientSearch || undefined,
    limit: 20,
  });

  const { data: services } = trpc.service.list.useQuery();
  const { data: staff } = trpc.staff.list.useQuery();

  const createMutation = trpc.appointment.create.useMutation({
    onSuccess: () => {
      utils.appointment.list.invalidate();
      closeForm();
    },
  });

  const cancelMutation = trpc.appointment.cancel.useMutation({
    onSuccess: () => {
      utils.appointment.list.invalidate();
      setCancellingId(null);
      setCancelReason("");
    },
  });

  const completeMutation = trpc.appointment.update.useMutation({
    onSuccess: () => {
      utils.appointment.list.invalidate();
    },
  });

  const appointments = data ?? [];

  const filteredClients = useMemo(() => {
    return clients?.clients ?? [];
  }, [clients]);

  const selectedService = useMemo(() => {
    return services?.find((s) => s.id === form.serviceId);
  }, [services, form.serviceId]);

  function closeForm() {
    setShowForm(false);
    setForm(emptyForm);
    setClientSearch("");
    setShowClientDropdown(false);
  }

  function openCreate() {
    setForm({
      ...emptyForm,
      date: new Date().toISOString().split("T")[0]!,
    });
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientId || !form.serviceId || !form.staffMemberId || !form.date || !form.time)
      return;

    const startTime = new Date(`${form.date}T${form.time}`).toISOString();
    const durationMinutes = selectedService?.durationMinutes ?? 30;
    const endTime = new Date(
      new Date(startTime).getTime() + durationMinutes * 60000
    ).toISOString();

    createMutation.mutate({
      clientId: form.clientId,
      serviceId: form.serviceId,
      staffMemberId: form.staffMemberId,
      startTime,
      endTime,
      source: "MANUAL",
    });
  }

  function handleMarkComplete(id: string) {
    completeMutation.mutate({ id, data: { status: "COMPLETED" } });
  }

  function handleMarkNoShow(id: string) {
    completeMutation.mutate({ id, data: { status: "NO_SHOW" } });
  }

  function handleCancelConfirm() {
    if (!cancellingId) return;
    cancelMutation.mutate({ id: cancellingId, reason: cancelReason || undefined });
  }

  function handleRescheduleConfirm() {
    if (!reschedulingId || !rescheduleDate || !rescheduleTime) return;
    const startTime = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
    completeMutation.mutate(
      { id: reschedulingId, data: { startTime } },
      {
        onSuccess: () => {
          setReschedulingId(null);
          setRescheduleDate("");
          setRescheduleTime("");
        },
      }
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="mt-1 text-muted-foreground">
            Manage all your bookings in one place.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New Appointment
        </button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1">
          {(["today", "week", "month", "custom"] as DateRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                dateRange === range
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {range === "today"
                ? "Today"
                : range === "week"
                  ? "This Week"
                  : range === "month"
                    ? "This Month"
                    : "Custom"}
            </button>
          ))}
        </div>

        {dateRange === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="all">All Statuses</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PENDING">Pending</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="COMPLETED">Completed</option>
            <option value="NO_SHOW">No Show</option>
          </select>
        </div>

        {appointments.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {appointments.length} appointment{appointments.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* New Appointment Form */}
      {showForm && (
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">New Appointment</h2>
            <button
              onClick={closeForm}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Client Search */}
            <div className="relative">
              <label className="mb-1.5 block text-sm font-medium">Client *</label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setShowClientDropdown(true);
                    if (!e.target.value) setForm((f) => ({ ...f, clientId: "" }));
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  placeholder="Search clients by name..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {form.clientId && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
              </div>
              {showClientDropdown && filteredClients.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                  {filteredClients.map((client) => {
                    const name = [client.firstName, client.lastName]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setForm((f) => ({ ...f, clientId: client.id }));
                          setClientSearch(name);
                          setShowClientDropdown(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted",
                          form.clientId === client.id && "bg-muted"
                        )}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                          {client.firstName[0]}
                          {client.lastName?.[0] ?? ""}
                        </div>
                        <div>
                          <p className="font-medium">{name}</p>
                          {client.email && (
                            <p className="text-xs text-muted-foreground">
                              {client.email}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Service */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">Service *</label>
                <select
                  required
                  value={form.serviceId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, serviceId: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">Select a service</option>
                  {services
                    ?.filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.durationMinutes}min)
                      </option>
                    ))}
                </select>
              </div>

              {/* Staff */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">Staff *</label>
                <select
                  required
                  value={form.staffMemberId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, staffMemberId: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">Select staff</option>
                  {staff?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Date */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">Date *</label>
                <input
                  required
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>

              {/* Time */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">Time *</label>
                <input
                  required
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            </div>

            {selectedService && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Duration: {selectedService.durationMinutes} minutes
                {selectedService.bufferMinutes > 0 &&
                  ` (+${selectedService.bufferMinutes}min buffer)`}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  !form.clientId ||
                  !form.serviceId ||
                  !form.staffMemberId ||
                  !form.date ||
                  !form.time
                }
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {createMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Book Appointment
              </button>
            </div>

            {createMutation.isError && (
              <p className="text-sm text-red-500">
                {createMutation.error.message}
              </p>
            )}
          </form>
        </div>
      )}

      {/* Appointments List */}
      {isLoading ? (
        <div className="mt-12 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Loading appointments…
          </p>
        </div>
      ) : appointments.length === 0 ? (
        <div className="mt-8 flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
          <Calendar className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">No appointments found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusFilter !== "all"
              ? "Try changing the status filter or date range."
              : "Book your first appointment or ask the AI assistant to help."}
          </p>
          {statusFilter === "all" && (
            <button
              onClick={openCreate}
              className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Book First Appointment
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {appointments.map((apt) => {
            const statusConf =
              STATUS_CONFIG[apt.status] ?? STATUS_CONFIG.PENDING;
            const clientName = apt.client
              ? [apt.client.firstName, apt.client.lastName]
                  .filter(Boolean)
                  .join(" ")
              : "Unknown Client";
            const staffName = apt.staffMember?.displayName ?? "Unassigned";
            const serviceName = apt.service?.name ?? "Unknown Service";
            const serviceColor = apt.service?.color ?? "#6B7280";
            const sourceLabel = (apt.source ?? "MANUAL")
              .toLowerCase()
              .replace("_", " ");
            const sourceStyle =
              SOURCE_STYLES[apt.source ?? "MANUAL"] ?? SOURCE_STYLES.MANUAL;
            const isActionable =
              apt.status === "CONFIRMED" || apt.status === "PENDING";
            const riskScore = (apt as Record<string, unknown>).noShowRisk as number | null;
            const isHighRisk = riskScore != null && riskScore >= 40;

            return (
              <div
                key={apt.id}
                className="group rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    {/* Time block */}
                    <div className="hidden shrink-0 flex-col items-center rounded-lg bg-muted px-3 py-2 sm:flex">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(apt.startTime)}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatTime(apt.startTime)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        – {formatTime(apt.endTime)}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: serviceColor }}
                        />
                        <p className="truncate text-sm font-semibold text-foreground">
                          {serviceName}
                        </p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                          {formatTime(apt.startTime)} – {formatTime(apt.endTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status + Source badges */}
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "hidden rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize lg:inline-flex",
                        sourceStyle
                      )}
                    >
                      {sourceLabel}
                    </span>
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
                    {isHighRisk && isActionable && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          riskScore! >= 70
                            ? "bg-red-500/10 text-red-600"
                            : "bg-orange-500/10 text-orange-600"
                        )}
                        title={`No-show risk: ${riskScore}%`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {riskScore! >= 70 ? "High Risk" : "At Risk"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {isActionable && (
                  <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
                    <button
                      onClick={() => handleMarkComplete(apt.id)}
                      disabled={completeMutation.isPending}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-green-500/10 hover:text-green-600"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Complete
                    </button>
                    <button
                      onClick={() => handleMarkNoShow(apt.id)}
                      disabled={completeMutation.isPending}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-orange-500/10 hover:text-orange-600"
                    >
                      <Eye className="h-3 w-3" />
                      No Show
                    </button>
                    <button
                      onClick={() => {
                        setReschedulingId(apt.id);
                        setRescheduleDate(
                          new Date(apt.startTime).toISOString().split("T")[0]!
                        );
                        setRescheduleTime(
                          new Date(apt.startTime).toTimeString().slice(0, 5)
                        );
                      }}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-blue-500/10 hover:text-blue-600"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reschedule
                    </button>
                    <button
                      onClick={() => setCancellingId(apt.id)}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10"
                    >
                      <XCircle className="h-3 w-3" />
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel Modal */}
      {cancellingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCancellingId(null);
              setCancelReason("");
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold">Cancel Appointment</h3>
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mb-5">
              <label className="mb-1.5 block text-sm font-medium">
                Reason (optional)
              </label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why is this appointment being cancelled?"
                className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setCancellingId(null);
                  setCancelReason("");
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Keep Appointment
              </button>
              <button
                onClick={handleCancelConfirm}
                disabled={cancelMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {cancelMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Cancel Appointment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setReschedulingId(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-semibold">Reschedule Appointment</h3>
              <button
                onClick={() => setReschedulingId(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  New Date
                </label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  New Time
                </label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setReschedulingId(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleRescheduleConfirm}
                disabled={
                  completeMutation.isPending || !rescheduleDate || !rescheduleTime
                }
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {completeMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Reschedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
