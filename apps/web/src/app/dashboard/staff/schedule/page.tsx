"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Calendar,
  Save,
  Loader2,
  Check,
  Users,
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

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    if (h === 22 && m === 30) break;
    TIME_OPTIONS.push(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    );
  }
}

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

function formatTimeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function StaffSchedulePage() {
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<DaySchedule[]>(defaultSchedules());
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const utils = trpc.useUtils();
  const { data: staffList, isLoading: staffLoading } =
    trpc.staff.list.useQuery();

  const { data: staffDetail, isLoading: detailLoading } =
    trpc.staff.getById.useQuery(
      { id: selectedStaffId! },
      { enabled: !!selectedStaffId }
    );

  const updateScheduleMutation = trpc.staff.updateSchedule.useMutation({
    onSuccess: () => {
      utils.staff.getById.invalidate({ id: selectedStaffId! });
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const staff = staffList ?? [];

  const loadSchedulesFromStaff = useCallback(() => {
    if (!staffDetail) return;
    const loaded = defaultSchedules();
    if (staffDetail.schedules && staffDetail.schedules.length > 0) {
      for (const sched of staffDetail.schedules) {
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
    }
    setSchedules(loaded);
    setHasChanges(false);
    setSaveSuccess(false);
  }, [staffDetail]);

  useEffect(() => {
    loadSchedulesFromStaff();
  }, [loadSchedulesFromStaff]);

  useEffect(() => {
    if (staff.length > 0 && !selectedStaffId) {
      setSelectedStaffId(staff[0]!.id);
    }
  }, [staff, selectedStaffId]);

  function updateDaySchedule(dayOfWeek: number, patch: Partial<DaySchedule>) {
    setSchedules((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d))
    );
    setHasChanges(true);
    setSaveSuccess(false);
  }

  function handleSave() {
    if (!selectedStaffId) return;
    updateScheduleMutation.mutate({
      staffMemberId: selectedStaffId,
      schedules: schedules.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.isAvailable ? s.startTime : "09:00",
        endTime: s.isAvailable ? s.endTime : "17:00",
        isAvailable: s.isAvailable,
      })),
    });
  }

  function handleSelectStaff(id: string) {
    setSelectedStaffId(id);
    setHasChanges(false);
    setSaveSuccess(false);
  }

  const selectedMember = staff.find((s) => s.id === selectedStaffId);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold">
            <Calendar className="h-6 w-6 text-accent" />
            Staff Schedules
          </h1>
          <p className="mt-1 text-muted-foreground">
            Set weekly working hours for each staff member.
          </p>
        </div>
      </div>

      {staffLoading ? (
        <div className="mt-16 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Loading staff…
          </p>
        </div>
      ) : staff.length === 0 ? (
        <div className="mt-8 flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
          <Users className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">No staff members yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add staff members first, then configure their schedules here.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Staff Selector */}
          <div className="flex flex-wrap gap-2">
            {staff.map((member) => {
              const initials = member.displayName
                .split(" ")
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
              const isActive = member.id === selectedStaffId;

              return (
                <button
                  key={member.id}
                  onClick={() => handleSelectStaff(member.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "border-accent bg-accent/10 text-foreground shadow-sm"
                      : "border-border text-muted-foreground hover:border-accent/50 hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {initials}
                  </span>
                  {member.displayName}
                </button>
              );
            })}
          </div>

          {/* Schedule Grid */}
          {selectedStaffId && (
            <div className="rounded-xl border border-border bg-card">
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h2 className="font-semibold text-foreground">
                      Weekly Schedule
                    </h2>
                    {selectedMember && (
                      <p className="text-sm text-muted-foreground">
                        {selectedMember.displayName}&apos;s availability
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={
                    updateScheduleMutation.isPending || !hasChanges
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                    hasChanges
                      ? "bg-accent text-accent-foreground hover:opacity-90"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {updateScheduleMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saveSuccess ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saveSuccess ? "Saved!" : "Save Schedule"}
                </button>
              </div>

              {/* Day Rows */}
              {detailLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {schedules.map((day) => (
                    <div
                      key={day.dayOfWeek}
                      className={cn(
                        "flex items-center gap-4 px-6 py-3.5 transition-colors sm:gap-6",
                        day.isAvailable ? "bg-card" : "bg-muted/30"
                      )}
                    >
                      {/* Day Name */}
                      <span
                        className={cn(
                          "w-28 shrink-0 text-sm font-medium",
                          day.isAvailable
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {DAYS[day.dayOfWeek]}
                      </span>

                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() =>
                          updateDaySchedule(day.dayOfWeek, {
                            isAvailable: !day.isAvailable,
                          })
                        }
                        className={cn(
                          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                          day.isAvailable ? "bg-green-500" : "bg-muted-foreground/30"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                            day.isAvailable && "translate-x-5"
                          )}
                        />
                      </button>

                      {/* Time Selectors */}
                      {day.isAvailable ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={day.startTime}
                            onChange={(e) =>
                              updateDaySchedule(day.dayOfWeek, {
                                startTime: e.target.value,
                              })
                            }
                            className="rounded-lg border border-border bg-muted px-3 py-1.5 text-sm outline-none focus:border-accent"
                          >
                            {TIME_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {formatTimeLabel(t)}
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-muted-foreground">
                            to
                          </span>
                          <select
                            value={day.endTime}
                            onChange={(e) =>
                              updateDaySchedule(day.dayOfWeek, {
                                endTime: e.target.value,
                              })
                            }
                            className="rounded-lg border border-border bg-muted px-3 py-1.5 text-sm outline-none focus:border-accent"
                          >
                            {TIME_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {formatTimeLabel(t)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span className="text-sm italic text-muted-foreground">
                          Day off
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Footer Messages */}
              {updateScheduleMutation.isError && (
                <div className="border-t border-border px-6 py-3">
                  <p className="text-sm text-red-500">
                    {updateScheduleMutation.error.message}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
