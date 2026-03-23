"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Clock,
  Ban,
  CalendarPlus,
  X,
  GripVertical,
  Coffee,
  StickyNote,
  ArrowRightLeft,
  Trash2,
  Check,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { sendToAiChat } from "@/components/dashboard/ai-chat-panel";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6am–8pm
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STAFF_COLORS = [
  { bg: "bg-blue-500/90", border: "border-blue-600", text: "text-white", light: "bg-blue-100 text-blue-800" },
  { bg: "bg-violet-500/90", border: "border-violet-600", text: "text-white", light: "bg-violet-100 text-violet-800" },
  { bg: "bg-teal-500/90", border: "border-teal-600", text: "text-white", light: "bg-teal-100 text-teal-800" },
  { bg: "bg-amber-500/90", border: "border-amber-600", text: "text-white", light: "bg-amber-100 text-amber-800" },
  { bg: "bg-rose-500/90", border: "border-rose-600", text: "text-white", light: "bg-rose-100 text-rose-800" },
  { bg: "bg-cyan-500/90", border: "border-cyan-600", text: "text-white", light: "bg-cyan-100 text-cyan-800" },
  { bg: "bg-emerald-500/90", border: "border-emerald-600", text: "text-white", light: "bg-emerald-100 text-emerald-800" },
  { bg: "bg-orange-500/90", border: "border-orange-600", text: "text-white", light: "bg-orange-100 text-orange-800" },
];

const STATUS_BADGE: Record<string, string> = {
  CONFIRMED: "bg-blue-100 text-blue-700",
  PENDING: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-orange-100 text-orange-700",
};

interface SlotPopover {
  dayIdx: number;
  hour: number;
  x: number;
  y: number;
  appointment?: AppointmentData;
}

type AppointmentData = {
  id: string;
  startTime: string | Date;
  endTime: string | Date;
  status: string;
  notes?: string | null;
  client: { firstName: string; lastName?: string | null; email?: string | null };
  service: { name: string; durationMinutes: number; price: number | string; color: string };
  staffMember: { id: string; displayName: string };
};

interface DragState {
  appointmentId: string;
  originalDay: Date;
  originalHour: number;
  currentDay: Date;
  currentHour: number;
}

interface BlockedSlotEntry {
  overrideId: string;
  staffId: string;
  staffName: string;
  reason?: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedAppt, setSelectedAppt] = useState<string | null>(null);
  const [popover, setPopover] = useState<SlotPopover | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [showConfirmDrop, setShowConfirmDrop] = useState<{ apptId: string; newStart: Date } | null>(null);
  const [filterStaffId, setFilterStaffId] = useState<string | null>(null);
  const [popoverBlockStaffId, setPopoverBlockStaffId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const utils = trpc.useUtils();

  const { data: appointments, isLoading } = trpc.appointment.list.useQuery({
    startDate: weekStart.toISOString(),
    endDate: weekEnd.toISOString(),
    limit: 200,
  });

  const { data: staffList } = trpc.staff.list.useQuery();
  const staff = staffList ?? [];

  const { data: overridesData } = trpc.staff.getOverridesForRange.useQuery(
    {
      startDate: weekStart.toISOString().split("T")[0],
      endDate: weekEnd.toISOString().split("T")[0],
    },
    { enabled: staff.length > 0 }
  );

  const rescheduleMutation = trpc.appointment.reschedule.useMutation({
    onSuccess: () => {
      utils.appointment.list.invalidate();
      setShowConfirmDrop(null);
    },
  });

  const cancelMutation = trpc.appointment.cancel.useMutation({
    onSuccess: () => {
      utils.appointment.list.invalidate();
      setPopover(null);
      setSelectedAppt(null);
    },
  });

  const updateMutation = trpc.appointment.update.useMutation({
    onSuccess: () => {
      utils.appointment.list.invalidate();
      setPopover(null);
    },
  });

  const createOverride = trpc.staff.createOverride.useMutation({
    onSuccess: () => {
      utils.staff.getOverridesForRange.invalidate();
      utils.appointment.list.invalidate();
      setPopover(null);
    },
  });

  const deleteOverrideMut = trpc.staff.deleteOverride.useMutation({
    onSuccess: () => {
      utils.staff.getOverridesForRange.invalidate();
      setPopover(null);
    },
  });

  const staffColorMap = useMemo(() => {
    const map = new Map<string, (typeof STAFF_COLORS)[0]>();
    staff.forEach((s, i) => {
      map.set(s.id, STAFF_COLORS[i % STAFF_COLORS.length]);
    });
    return map;
  }, [staff]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const today = new Date();

  const prevWeek = () => setWeekStart((w) => addDays(w, -7));
  const nextWeek = () => setWeekStart((w) => addDays(w, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  const filteredAppointments = useMemo(() => {
    if (!appointments) return [];
    if (!filterStaffId) return appointments;
    return appointments.filter((a) => a.staffMember.id === filterStaffId);
  }, [appointments, filterStaffId]);

  const blockedSlots = useMemo(() => {
    const map = new Map<string, BlockedSlotEntry[]>();
    if (!overridesData) return map;

    const staffNameById = new Map<string, string>(
      staff.map((s) => [s.id, s.displayName])
    );

    for (const o of overridesData) {
      if (filterStaffId && o.staffMemberId !== filterStaffId) continue;
      const dateStr = new Date(o.date).toISOString().split("T")[0];
      const entry: BlockedSlotEntry = {
        overrideId: o.id,
        staffId: o.staffMemberId,
        staffName: staffNameById.get(o.staffMemberId) ?? "Staff",
        reason: o.reason ?? undefined,
        date: dateStr,
        startTime: o.startTime ?? null,
        endTime: o.endTime ?? null,
      };

      const addHour = (hour: number) => {
        const key = `${dateStr}-${hour}`;
        const list = map.get(key) ?? [];
        list.push(entry);
        map.set(key, list);
      };

      if (o.startTime && o.endTime) {
        const startMin = timeToMinutes(o.startTime);
        const endMin = timeToMinutes(o.endTime);
        const firstHour = Math.floor(startMin / 60);
        const lastHour = Math.ceil(endMin / 60) - 1;
        for (let h = firstHour; h <= lastHour; h++) {
          addHour(h);
        }
      } else {
        for (let h = 0; h < 24; h++) {
          addHour(h);
        }
      }
    }
    return map;
  }, [overridesData, filterStaffId, staff]);

  const getBlockedEntries = useCallback(
    (dayIdx: number, hour: number): BlockedSlotEntry[] => {
      const day = weekDays[dayIdx];
      if (!day) return [];
      const dayStr = day.toISOString().split("T")[0];
      return blockedSlots.get(`${dayStr}-${hour}`) ?? [];
    },
    [blockedSlots, weekDays]
  );

  const selectedAppointment = useMemo(
    () => appointments?.find((a) => a.id === selectedAppt),
    [appointments, selectedAppt]
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
        setPopoverBlockStaffId(null);
      }
    }
    if (popover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [popover]);

  const handleCellClick = useCallback(
    (e: React.MouseEvent, dayIdx: number, hour: number, appt?: AppointmentData) => {
      if (dragState) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPopover({
        dayIdx,
        hour,
        x: rect.left + rect.width / 2,
        y: rect.top,
        appointment: appt as AppointmentData,
      });
      if (appt) setSelectedAppt(appt.id);
    },
    [dragState]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, appt: AppointmentData, day: Date, hour: number) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", appt.id);
      setDragState({
        appointmentId: appt.id,
        originalDay: day,
        originalHour: hour,
        currentDay: day,
        currentHour: hour,
      });
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, day: Date, hour: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragState((prev) =>
        prev ? { ...prev, currentDay: day, currentHour: hour } : null
      );
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, day: Date, hour: number) => {
      e.preventDefault();
      if (!dragState) return;
      const newStart = new Date(day);
      newStart.setHours(hour, 0, 0, 0);
      if (
        !isSameDay(dragState.originalDay, day) ||
        dragState.originalHour !== hour
      ) {
        setShowConfirmDrop({ apptId: dragState.appointmentId, newStart });
      }
      setDragState(null);
    },
    [dragState]
  );

  const confirmReschedule = useCallback(() => {
    if (!showConfirmDrop) return;
    rescheduleMutation.mutate({
      id: showConfirmDrop.apptId,
      newStartTime: showConfirmDrop.newStart.toISOString(),
    });
  }, [showConfirmDrop, rescheduleMutation]);

  const droppedAppt = useMemo(
    () => appointments?.find((a) => a.id === showConfirmDrop?.apptId),
    [appointments, showConfirmDrop]
  );

  const popoverBlockedEntries = useMemo(() => {
    if (!popover || popover.appointment) return [];
    return getBlockedEntries(popover.dayIdx, popover.hour);
  }, [popover, getBlockedEntries]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold">Bookings Calendar</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            View and manage booked appointments, reschedules, and day-to-day operations.
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDateShort(weekStart)} – {formatDateShort(addDays(weekStart, 6))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Staff filter chips */}
          <div className="mr-2 flex items-center gap-1">
            <button
              onClick={() => setFilterStaffId(null)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                !filterStaffId
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              All Staff
            </button>
            {staff.map((s) => {
              const color = staffColorMap.get(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setFilterStaffId(filterStaffId === s.id ? null : s.id)
                  }
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    filterStaffId === s.id
                      ? color?.light
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s.displayName.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <button
            onClick={goToday}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Today
          </button>
          <button
            onClick={prevWeek}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={nextWeek}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Calendar grid */}
          <div ref={gridRef} className="flex-1 overflow-auto relative">
            {/* Day headers */}
            <div className="sticky top-0 z-10 grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-card">
              <div className="border-r border-border" />
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, today);
                return (
                  <div
                    key={i}
                    className={cn(
                      "border-r border-border px-2 py-2.5 text-center last:border-r-0",
                      isToday && "bg-accent/5"
                    )}
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {DAYS[day.getDay()]}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-lg font-bold",
                        isToday ? "text-accent" : "text-foreground"
                      )}
                    >
                      {day.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Time grid */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)]">
              {HOURS.map((hour) => (
                <div key={hour} className="contents">
                  <div className="relative border-r border-border pr-2 pt-0">
                    <span className="absolute -top-2.5 right-2 text-[10px] font-medium text-muted-foreground">
                      {formatHour(hour)}
                    </span>
                  </div>
                  {weekDays.map((day, dayIdx) => {
                    const cellAppts = filteredAppointments.filter((a) => {
                      const s = new Date(a.startTime);
                      return s.getHours() === hour && isSameDay(s, day);
                    });
                    const isToday = isSameDay(day, today);
                    const isDragTarget =
                      dragState &&
                      isSameDay(dragState.currentDay, day) &&
                      dragState.currentHour === hour;
                    const blockedEntries = getBlockedEntries(dayIdx, hour);
                    const blockedPrimary = blockedEntries[0];
                    const blockedTooltip = blockedEntries
                      .map((b) => {
                        const who = b.staffName;
                        const what = b.reason || "Blocked";
                        const range =
                          b.startTime && b.endTime
                            ? ` (${formatTimeRangeLabel(b.startTime, b.endTime)})`
                            : "";
                        return `${who}: ${what}${range}`;
                      })
                      .join("\n");

                    return (
                      <div
                        key={dayIdx}
                        className={cn(
                          "relative min-h-[56px] border-b border-r border-border last:border-r-0 transition-colors",
                          isToday && "bg-accent/[0.03]",
                          isDragTarget && "bg-accent/10 ring-1 ring-inset ring-accent/50",
                          blockedEntries.length > 0 && !cellAppts.length && "bg-red-500/10"
                        )}
                        onClick={(e) => {
                          if (cellAppts.length === 0) handleCellClick(e, dayIdx, hour);
                        }}
                        onDragOver={(e) => handleDragOver(e, day, hour)}
                        onDrop={(e) => handleDrop(e, day, hour)}
                      >
                        {blockedEntries.length > 0 && cellAppts.length === 0 && (
                          <div
                            className="absolute inset-0 flex items-center justify-center px-1 text-center"
                            title={blockedTooltip}
                          >
                            <span className="flex items-center gap-1 text-[10px] text-red-600 font-medium">
                              <Ban className="h-3 w-3" />
                              {blockedEntries.length === 1
                                ? `${blockedPrimary?.reason || "Blocked"} · ${shortStaffName(
                                    blockedPrimary?.staffName
                                  )}`
                                : `${blockedEntries.length} blocked entries`}
                            </span>
                          </div>
                        )}
                        {cellAppts.map((appt) => {
                          const start = new Date(appt.startTime);
                          const mins = start.getMinutes();
                          const duration = appt.service.durationMinutes;
                          const topPct = (mins / 60) * 100;
                          const heightPx = Math.max((duration / 60) * 56, 24);
                          const color = staffColorMap.get(appt.staffMember.id) ?? STAFF_COLORS[0];

                          return (
                            <div
                              key={appt.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, appt as AppointmentData, day, hour)}
                              onDragEnd={() => setDragState(null)}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCellClick(e, dayIdx, hour, appt as AppointmentData);
                              }}
                              className={cn(
                                "absolute inset-x-0.5 z-[1] cursor-grab overflow-hidden rounded border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-opacity hover:opacity-90 active:cursor-grabbing",
                                color.bg,
                                color.border,
                                color.text,
                                selectedAppt === appt.id && "ring-2 ring-foreground/30",
                                appt.status === "CANCELLED" && "opacity-40 line-through"
                              )}
                              style={{
                                top: `${topPct}%`,
                                height: `${heightPx}px`,
                              }}
                            >
                              <div className="flex items-center gap-0.5">
                                <GripVertical className="h-3 w-3 opacity-50 shrink-0" />
                                <p className="truncate font-semibold">
                                  {appt.client.firstName} {appt.client.lastName?.[0]}.
                                </p>
                              </div>
                              <p className="truncate opacity-80">
                                {appt.service.name} · {appt.staffMember.displayName.split(" ")[0]}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Detail sidebar */}
          {selectedAppointment && !popover && (
            <div className="w-72 shrink-0 border-l border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Details</h3>
                <button
                  onClick={() => setSelectedAppt(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Client</p>
                  <p className="mt-0.5 font-medium text-foreground">
                    {selectedAppointment.client.firstName}{" "}
                    {selectedAppointment.client.lastName}
                  </p>
                  {selectedAppointment.client.email && (
                    <p className="text-xs text-muted-foreground">
                      {selectedAppointment.client.email}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Service</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: selectedAppointment.service.color }}
                    />
                    <p className="font-medium text-foreground">
                      {selectedAppointment.service.name}
                    </p>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {selectedAppointment.service.durationMinutes} min
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Time</p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {formatTime(new Date(selectedAppointment.startTime))} –{" "}
                    {formatTime(new Date(selectedAppointment.endTime))}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Staff</p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {selectedAppointment.staffMember.displayName}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Status</p>
                  <span
                    className={cn(
                      "mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                      STATUS_BADGE[selectedAppointment.status]
                    )}
                  >
                    {selectedAppointment.status.charAt(0) +
                      selectedAppointment.status.slice(1).toLowerCase().replace("_", " ")}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Price</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    ${Number(selectedAppointment.service.price).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Contextual Popover — Smart Suggestions */}
      {popover && (
        <div
          ref={popoverRef}
          className="fixed z-50 animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: Math.min(popover.x - 100, window.innerWidth - 220),
            top: Math.max(popover.y - 10, 60),
          }}
        >
          <div className="w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            {popover.appointment ? (
              <>
                <div className="border-b border-border px-3 py-2">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {popover.appointment.client.firstName} {popover.appointment.client.lastName}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {popover.appointment.service.name} · {formatTime(new Date(popover.appointment.startTime))}
                  </p>
                </div>
                <div className="py-1">
                  <PopoverBtn
                    icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                    label="Reschedule"
                    onClick={() => {
                      const appt = popover.appointment!;
                      sendToAiChat(`Reschedule ${appt.client.firstName} ${appt.client.lastName ?? ""}'s ${appt.service.name} to a different time`);
                      setPopover(null);
                    }}
                  />
                  <PopoverBtn
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label="Cancel Appointment"
                    danger
                    onClick={() => {
                      cancelMutation.mutate({ id: popover.appointment!.id });
                    }}
                  />
                  <PopoverBtn
                    icon={<StickyNote className="h-3.5 w-3.5" />}
                    label="Add Note"
                    onClick={() => {
                      const note = window.prompt("Add a note:");
                      if (note) {
                        updateMutation.mutate({
                          id: popover.appointment!.id,
                          data: { notes: note },
                        });
                      }
                      setPopover(null);
                    }}
                  />
                  <PopoverBtn
                    icon={<Check className="h-3.5 w-3.5" />}
                    label={popover.appointment.status === "CONFIRMED" ? "Mark No-Show" : "Confirm"}
                    onClick={() => {
                      updateMutation.mutate({
                        id: popover.appointment!.id,
                        data: {
                          status: popover.appointment!.status === "CONFIRMED" ? "NO_SHOW" : "CONFIRMED",
                        },
                      });
                      setPopover(null);
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-border px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">
                    {DAYS[weekDays[popover.dayIdx].getDay()]}{" "}
                    {formatDateShort(weekDays[popover.dayIdx])}, {formatHour(popover.hour)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {popoverBlockedEntries.length > 0
                      ? popoverBlockedEntries.length === 1
                        ? `${popoverBlockedEntries[0]?.reason || "Blocked"} · ${popoverBlockedEntries[0]?.staffName ?? "Staff"}`
                        : `${popoverBlockedEntries.length} blocked entries`
                      : "Quick actions"}
                  </p>
                </div>
                <div className="py-1">
                  {popoverBlockedEntries.length > 0 && (
                    <div className="space-y-1.5 px-3 py-1.5">
                      <p className="text-[10px] font-medium text-muted-foreground">Blocked details</p>
                      {popoverBlockedEntries.map((entry) => (
                        <div
                          key={entry.overrideId}
                          className="rounded-md border border-border bg-muted/40 px-2 py-1.5"
                        >
                          <p className="text-[11px] font-medium text-foreground">
                            {entry.reason || "Blocked"} · {entry.staffName}
                          </p>
                          {(entry.startTime && entry.endTime) && (
                            <p className="text-[10px] text-muted-foreground">
                              {formatTimeRangeLabel(entry.startTime, entry.endTime)}
                            </p>
                          )}
                          <button
                            onClick={() => {
                              deleteOverrideMut.mutate({ overrideId: entry.overrideId });
                              setPopoverBlockStaffId(null);
                            }}
                            className="mt-1 text-[10px] font-medium text-accent hover:underline"
                          >
                            Unblock this entry
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Staff picker for block/break — only if multiple staff and no filter */}
                  {popoverBlockedEntries.length === 0 && staff.length > 1 && !filterStaffId && !popoverBlockStaffId && (
                    <div className="px-3 py-1.5 space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground">Block for which staff?</p>
                      {staff.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setPopoverBlockStaffId(s.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-muted text-foreground"
                        >
                          <span className={cn("h-2.5 w-2.5 rounded-full", staffColorMap.get(s.id)?.bg)} />
                          {s.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                  {popoverBlockedEntries.length === 0 && (staff.length <= 1 || filterStaffId || popoverBlockStaffId) && (
                    <>
                      <PopoverBtn
                        icon={<CalendarPlus className="h-3.5 w-3.5" />}
                        label="Book Appointment"
                        onClick={() => {
                          const day = weekDays[popover.dayIdx];
                          const dayLabel = day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
                          sendToAiChat(`I want to book a client in on ${dayLabel} at ${formatHour(popover.hour)}. Which service and client?`);
                          setPopover(null);
                          setPopoverBlockStaffId(null);
                        }}
                      />
                      <PopoverBtn
                        icon={<Ban className="h-3.5 w-3.5" />}
                        label="Block This Slot"
                        onClick={() => {
                          const sid = popoverBlockStaffId || filterStaffId || staff[0]?.id;
                          if (!sid) return;
                          const day = weekDays[popover.dayIdx];
                          const dateStr = day.toISOString().split("T")[0];
                          const startTime = `${String(popover.hour).padStart(2, "0")}:00`;
                          const endH = popover.hour + 1;
                          const endTime = `${String(endH).padStart(2, "0")}:00`;
                          createOverride.mutate({
                            staffMemberId: sid,
                            date: dateStr,
                            startTime,
                            endTime,
                            isAvailable: false,
                            reason: "Blocked",
                          });
                          setPopoverBlockStaffId(null);
                        }}
                      />
                      <PopoverBtn
                        icon={<Coffee className="h-3.5 w-3.5" />}
                        label="Set as Break"
                        onClick={() => {
                          const sid = popoverBlockStaffId || filterStaffId || staff[0]?.id;
                          if (!sid) return;
                          const day = weekDays[popover.dayIdx];
                          const dateStr = day.toISOString().split("T")[0];
                          const startTime = `${String(popover.hour).padStart(2, "0")}:00`;
                          const endH = popover.hour + 1;
                          const endTime = `${String(endH).padStart(2, "0")}:00`;
                          createOverride.mutate({
                            staffMemberId: sid,
                            date: dateStr,
                            startTime,
                            endTime,
                            isAvailable: false,
                            reason: "Break",
                          });
                          setPopoverBlockStaffId(null);
                        }}
                      />
                    </>
                  )}
                </div>
              </>
            )}
            <div className="border-t border-border">
              <button
                onClick={() => setPopover(null)}
                className="flex w-full items-center justify-center gap-1 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag-and-drop Confirmation Modal */}
      {showConfirmDrop && droppedAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">Confirm Reschedule</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Move <span className="font-medium text-foreground">{droppedAppt.client.firstName} {droppedAppt.client.lastName}</span>&apos;s{" "}
                <span className="font-medium text-foreground">{droppedAppt.service.name}</span>?
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="font-medium">{formatTime(new Date(droppedAppt.startTime))}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(droppedAppt.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                </div>
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="font-medium">{formatTime(showConfirmDrop.newStart)}</p>
                  <p className="text-xs text-muted-foreground">
                    {showConfirmDrop.newStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The client will be notified automatically.
              </p>
            </div>
            <div className="flex gap-2 border-t border-border px-5 py-3">
              <button
                onClick={() => setShowConfirmDrop(null)}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmReschedule}
                disabled={rescheduleMutation.isPending}
                className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {rescheduleMutation.isPending ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff color legend */}
      {staff.length > 1 && (
        <div className="flex items-center gap-3 border-t border-border px-6 py-2 text-xs">
          {staff.map((s) => {
            const color = staffColorMap.get(s.id);
            return (
              <span key={s.id} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", color?.bg)} />
                <span className="text-muted-foreground">{s.displayName}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function shortStaffName(name?: string): string {
  if (!name) return "Staff";
  return name.trim().split(" ")[0] || name;
}

function formatClockLabel(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatTimeRangeLabel(start: string, end: string): string {
  return `${formatClockLabel(start)} - ${formatClockLabel(end)}`;
}

function PopoverBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors",
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-foreground hover:bg-muted"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
