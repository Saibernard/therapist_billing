"use client";

import { useState, useMemo, useEffect } from "react";
import {
  UserCircle,
  Plus,
  X,
  Loader2,
  Clock,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Scissors,
  Mail,
  Save,
  Check,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface StaffFormData {
  displayName: string;
  bio: string;
  serviceIds: string[];
}

const emptyForm: StaffFormData = {
  displayName: "",
  bio: "",
  serviceIds: [],
};

interface DaySchedule {
  dayOfWeek: number;
  isAvailable: boolean;
  startTime: string;
  endTime: string;
}

function defaultSchedules(): DaySchedule[] {
  return DAYS.map((_, i) => ({
    dayOfWeek: i,
    isAvailable: i >= 1 && i <= 5,
    startTime: "09:00",
    endTime: "17:00",
  }));
}

function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export default function StaffPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<StaffFormData>(emptyForm);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "schedule">("details");
  const [schedules, setSchedules] = useState<DaySchedule[]>(defaultSchedules());
  const [scheduleChanged, setScheduleChanged] = useState(false);

  const utils = trpc.useUtils();

  const { data: staffList, isLoading } = trpc.staff.list.useQuery();
  const { data: services } = trpc.service.list.useQuery();

  const createMutation = trpc.staff.create.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      closeForm();
    },
  });

  const updateScheduleMutation = trpc.staff.updateSchedule.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      setScheduleChanged(false);
    },
  });

  const staff = staffList ?? [];
  const activeServices = useMemo(
    () => services?.filter((s) => s.isActive) ?? [],
    [services]
  );

  const selectedStaff = useMemo(
    () => staff.find((s) => s.id === selectedStaffId) ?? null,
    [staff, selectedStaffId]
  );

  function closeForm() {
    setShowForm(false);
    setForm(emptyForm);
  }

  function openCreate() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.displayName.trim()) return;
    createMutation.mutate({
      displayName: form.displayName,
      bio: form.bio || undefined,
      serviceIds: form.serviceIds,
    });
  }

  function toggleServiceId(id: string) {
    setForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(id)
        ? f.serviceIds.filter((s) => s !== id)
        : [...f.serviceIds, id],
    }));
  }

  function openStaffDetail(staffId: string) {
    setSelectedStaffId(staffId);
    setActiveTab("details");
    setScheduleChanged(false);
    const member = staff.find((s) => s.id === staffId);
    if (member?.schedules && member.schedules.length > 0) {
      const loaded = defaultSchedules();
      for (const sched of member.schedules) {
        const idx = loaded.findIndex((d) => d.dayOfWeek === sched.dayOfWeek);
        if (idx >= 0) {
          loaded[idx] = {
            dayOfWeek: sched.dayOfWeek,
            isAvailable: sched.isAvailable,
            startTime: sched.startTime ?? "09:00",
            endTime: sched.endTime ?? "17:00",
          };
        }
      }
      setSchedules(loaded);
    } else {
      setSchedules(defaultSchedules());
    }
  }

  function closeDetail() {
    setSelectedStaffId(null);
    setScheduleChanged(false);
  }

  function updateDaySchedule(dayOfWeek: number, patch: Partial<DaySchedule>) {
    setSchedules((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d))
    );
    setScheduleChanged(true);
  }

  function handleSaveSchedule() {
    if (!selectedStaffId) return;
    updateScheduleMutation.mutate({
      staffMemberId: selectedStaffId,
      schedules: schedules.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        isAvailable: s.isAvailable,
        startTime: s.isAvailable ? s.startTime : null,
        endTime: s.isAvailable ? s.endTime : null,
      })),
    });
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your team members and their schedules.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Staff
        </button>
      </div>

      {/* Add Staff Form */}
      {showForm && (
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">New Staff Member</h2>
            <button
              onClick={closeForm}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Display Name *
              </label>
              <input
                required
                maxLength={100}
                value={form.displayName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayName: e.target.value }))
                }
                placeholder="e.g. Jane Smith"
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Bio</label>
              <textarea
                maxLength={500}
                rows={2}
                value={form.bio}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bio: e.target.value }))
                }
                placeholder="Short bio or specialization..."
                className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
              />
            </div>

            {/* Service Multi-select */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Services
              </label>
              {activeServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No services available. Create services first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeServices.map((service) => {
                    const isSelected = form.serviceIds.includes(service.id);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => toggleServiceId(service.id)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                          isSelected
                            ? "border-accent bg-accent/10 text-accent-foreground"
                            : "border-border text-muted-foreground hover:border-accent hover:text-foreground"
                        )}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: service.color }}
                        />
                        {service.name}
                        {isSelected && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

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
                disabled={createMutation.isPending || !form.displayName.trim()}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {createMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Add Staff Member
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

      {/* Staff List */}
      {isLoading ? (
        <div className="mt-12 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Loading staff…</p>
        </div>
      ) : staff.length === 0 ? (
        <div className="mt-8 flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
          <UserCircle className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">No staff members yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add yourself first, then invite your team.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Add First Staff Member
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {staff.map((member) => {
            const serviceCount = member.staffServices?.length ?? 0;
            const initials = member.displayName
              .split(" ")
              .map((w) => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <button
                key={member.id}
                onClick={() => openStaffDetail(member.id)}
                className={cn(
                  "group relative rounded-xl border border-border bg-card p-5 text-left transition-shadow hover:shadow-md",
                  selectedStaffId === member.id && "ring-2 ring-accent"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {member.displayName}
                    </p>
                    {member.user?.email && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        {member.user.email}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>

                {member.bio && (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {member.bio}
                  </p>
                )}

                {serviceCount > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {member.staffServices!.slice(0, 3).map((ss) => (
                      <span
                        key={ss.service?.id ?? ss.serviceId}
                        className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor: ss.service?.color ?? "#6B7280",
                          }}
                        />
                        {ss.service?.name ?? "Service"}
                      </span>
                    ))}
                    {serviceCount > 3 && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        +{serviceCount - 3} more
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Staff Detail Panel */}
      {selectedStaff && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh]"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDetail();
          }}
        >
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
                  {selectedStaff.displayName
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {selectedStaff.displayName}
                  </h2>
                  {selectedStaff.user?.email && (
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      {selectedStaff.user.email}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={closeDetail}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab("details")}
                className={cn(
                  "px-6 py-3 text-sm font-medium transition-colors",
                  activeTab === "details"
                    ? "border-b-2 border-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab("schedule")}
                className={cn(
                  "px-6 py-3 text-sm font-medium transition-colors",
                  activeTab === "schedule"
                    ? "border-b-2 border-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Schedule
              </button>
            </div>

            {/* Details Tab */}
            {activeTab === "details" && (
              <div className="p-6">
                {/* Bio */}
                {selectedStaff.bio && (
                  <div className="mb-6">
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                      Bio
                    </h3>
                    <p className="text-sm text-foreground">
                      {selectedStaff.bio}
                    </p>
                  </div>
                )}

                {/* Services — Editable */}
                <StaffServiceEditor
                  staffId={selectedStaff.id}
                  currentServiceIds={
                    selectedStaff.staffServices?.map(
                      (ss) => ss.service?.id ?? ss.serviceId
                    ) ?? []
                  }
                  allServices={activeServices}
                />

                {/* Upcoming Appointments */}
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Calendar className="h-4 w-4" />
                    Upcoming Appointments
                  </h3>
                  <StaffAppointments staffId={selectedStaff.id} />
                </div>
              </div>
            )}

            {/* Schedule Tab */}
            {activeTab === "schedule" && (
              <div className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Set weekly availability for {selectedStaff.displayName}
                  </p>
                  <button
                    onClick={handleSaveSchedule}
                    disabled={
                      updateScheduleMutation.isPending || !scheduleChanged
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                      scheduleChanged
                        ? "bg-accent text-accent-foreground hover:opacity-90"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {updateScheduleMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save Schedule
                  </button>
                </div>

                <div className="space-y-2">
                  {schedules.map((day) => (
                    <div
                      key={day.dayOfWeek}
                      className={cn(
                        "flex items-center gap-4 rounded-lg border border-border p-3 transition-colors",
                        day.isAvailable ? "bg-card" : "bg-muted/50"
                      )}
                    >
                      {/* Day toggle */}
                      <button
                        type="button"
                        onClick={() =>
                          updateDaySchedule(day.dayOfWeek, {
                            isAvailable: !day.isAvailable,
                          })
                        }
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                          day.isAvailable
                            ? "bg-green-500/10 text-green-600"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {DAY_ABBR[day.dayOfWeek]![0]}
                      </button>

                      {/* Day name */}
                      <span
                        className={cn(
                          "w-24 text-sm font-medium",
                          day.isAvailable
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {DAYS[day.dayOfWeek]}
                      </span>

                      {day.isAvailable ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={day.startTime}
                            onChange={(e) =>
                              updateDaySchedule(day.dayOfWeek, {
                                startTime: e.target.value,
                              })
                            }
                            className="rounded-md border border-border bg-muted px-2 py-1 text-sm outline-none focus:border-accent"
                          />
                          <span className="text-xs text-muted-foreground">
                            to
                          </span>
                          <input
                            type="time"
                            value={day.endTime}
                            onChange={(e) =>
                              updateDaySchedule(day.dayOfWeek, {
                                endTime: e.target.value,
                              })
                            }
                            className="rounded-md border border-border bg-muted px-2 py-1 text-sm outline-none focus:border-accent"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Unavailable
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {updateScheduleMutation.isError && (
                  <p className="mt-3 text-sm text-red-500">
                    {updateScheduleMutation.error.message}
                  </p>
                )}

                {updateScheduleMutation.isSuccess && !scheduleChanged && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-green-600">
                    <Check className="h-3.5 w-3.5" />
                    Schedule saved successfully
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StaffServiceEditor({
  staffId,
  currentServiceIds,
  allServices,
}: {
  staffId: string;
  currentServiceIds: string[];
  allServices: Array<{ id: string; name: string; durationMinutes: number; color: string | null }>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(currentServiceIds);
  const [hasChanges, setHasChanges] = useState(false);
  const utils = trpc.useUtils();

  const updateMutation = trpc.staff.updateServices.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      setHasChanges(false);
    },
  });

  useEffect(() => {
    setSelectedIds(currentServiceIds);
    setHasChanges(false);
  }, [staffId, currentServiceIds.join(",")]);

  function toggleService(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
    setHasChanges(true);
  }

  function handleSave() {
    updateMutation.mutate({ staffMemberId: staffId, serviceIds: selectedIds });
  }

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Scissors className="h-4 w-4" />
          Services ({selectedIds.length})
        </h3>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Toggle services this staff member can perform. Customers will only see available slots for assigned services.
      </p>
      {allServices.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">No services available. Create services first.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allServices.map((service) => {
            const isSelected = selectedIds.includes(service.id);
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => toggleService(service.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  isSelected
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-accent/50 hover:text-foreground"
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: service.color ?? "#6B7280" }}
                />
                {service.name}
                <span className="text-xs text-muted-foreground">{service.durationMinutes}min</span>
                {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
      {updateMutation.isSuccess && !hasChanges && (
        <p className="mt-2 flex items-center gap-1 text-xs text-green-600">
          <Check className="h-3 w-3" /> Services updated
        </p>
      )}
    </div>
  );
}

function StaffAppointments({ staffId }: { staffId: string }) {
  const now = new Date();
  const { data, isLoading } = trpc.appointment.list.useQuery({
    staffMemberId: staffId,
    startDate: now.toISOString(),
    endDate: new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate()
    ).toISOString(),
    limit: 10,
  });

  const STATUS_CONFIG: Record<string, string> = {
    CONFIRMED: "bg-green-500/10 text-green-600",
    PENDING: "bg-yellow-500/10 text-yellow-600",
    CANCELLED: "bg-red-500/10 text-red-500",
    COMPLETED: "bg-blue-500/10 text-blue-600",
    NO_SHOW: "bg-orange-500/10 text-orange-600",
  };

  if (isLoading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const appointments = data ?? [];

  if (appointments.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          No upcoming appointments
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {appointments.map((apt) => {
        const clientName = apt.client
          ? [apt.client.firstName, apt.client.lastName]
              .filter(Boolean)
              .join(" ")
          : "Unknown Client";
        const statusStyle =
          STATUS_CONFIG[apt.status] ?? "bg-muted text-muted-foreground";

        return (
          <div
            key={apt.id}
            className="flex items-center justify-between rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {apt.service?.name ?? "Service"} — {clientName}
              </p>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(apt.startTime)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(apt.startTime)} – {formatTime(apt.endTime)}
                </span>
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                statusStyle
              )}
            >
              {apt.status.charAt(0) +
                apt.status.slice(1).toLowerCase().replace("_", " ")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
