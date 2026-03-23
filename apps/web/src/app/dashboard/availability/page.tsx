"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  X,
  Eye,
  Clock,
  Ban,
  CalendarPlus,
  Save,
  Coffee,
  Unlock,
  Trash2,
  CalendarCheck,
  ArrowRightLeft,
  StickyNote,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { sendToAiChat } from "@/components/dashboard/ai-chat-panel";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type SlotStatus = "available" | "booked" | "blocked" | "outside" | "extra";

interface GridSlot {
  time: string;
  status: SlotStatus;
  appointmentId?: string;
  clientName?: string;
  serviceName?: string;
  overrideId?: string;
  reason?: string;
}

interface GridDay {
  date: string;
  dayOfWeek: number;
  slots: GridSlot[];
}

interface SlotPopover {
  day: GridDay;
  slot: GridSlot;
  x: number;
  y: number;
}

export default function AvailabilityPage() {
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const [weekStart, setWeekStart] = useState(today);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [addStart, setAddStart] = useState("09:00");
  const [addEnd, setAddEnd] = useState("17:00");
  const [addReason, setAddReason] = useState("");
  const [blockMode, setBlockMode] = useState<"block" | "extra">("extra");
  const [popover, setPopover] = useState<SlotPopover | null>(null);
  const [blockReasonInput, setBlockReasonInput] = useState("");
  const [showReasonPrompt, setShowReasonPrompt] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 13), [weekStart]);
  const utils = trpc.useUtils();

  const { data: staffList, isLoading: staffLoading } = trpc.staff.list.useQuery();
  const { data: orgData } = trpc.organization.getCurrent.useQuery(undefined, {
    retry: false,
  });
  const staff = staffList ?? [];
  const orgSlug = orgData?.slug ?? "";

  if (!selectedStaffId && staff.length > 0) {
    setSelectedStaffId(staff[0]!.id);
  }

  const { data: gridData, isLoading: gridLoading } =
    trpc.staff.getAvailabilityGrid.useQuery(
      {
        staffMemberId: selectedStaffId!,
        startDate: fmt(weekStart),
        endDate: fmt(weekEnd),
      },
      { enabled: !!selectedStaffId }
    );

  const createOverride = trpc.staff.createOverride.useMutation({
    onSuccess: () => utils.staff.getAvailabilityGrid.invalidate(),
  });

  const deleteOverride = trpc.staff.deleteOverride.useMutation({
    onSuccess: () => utils.staff.getAvailabilityGrid.invalidate(),
  });

  const deleteOverrideByDate = trpc.staff.deleteOverrideByDate.useMutation({
    onSuccess: () => utils.staff.getAvailabilityGrid.invalidate(),
  });

  const cancelMutation = trpc.appointment.cancel.useMutation({
    onSuccess: () => {
      utils.staff.getAvailabilityGrid.invalidate();
      setPopover(null);
    },
  });

  const days: GridDay[] = gridData?.days ?? [];

  const visibleTimeRange = useMemo(() => {
    let earliest = 9 * 60;
    let latest = 17 * 60;

    for (const day of days) {
      for (const slot of day.slots) {
        if (slot.status !== "outside") {
          const [h, m] = slot.time.split(":").map(Number);
          const min = h * 60 + m;
          if (min < earliest) earliest = min;
          if (min + 30 > latest) latest = min + 30;
        }
      }
    }

    earliest = Math.max(earliest - 60, 6 * 60);
    latest = Math.min(latest + 60, 22 * 60);

    const times: string[] = [];
    for (let m = earliest; m < latest; m += 30) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      times.push(`${hh}:${mm}`);
    }
    return times;
  }, [days]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
        setShowReasonPrompt(false);
      }
    }
    if (popover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [popover]);

  const handleSlotClick = useCallback(
    (e: React.MouseEvent, day: GridDay, slot: GridSlot) => {
      if (slot.status === "outside") return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPopover({
        day,
        slot,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      setShowReasonPrompt(false);
      setBlockReasonInput("");
    },
    []
  );

  const doBlock = useCallback(
    (day: GridDay, slot: GridSlot, reason?: string) => {
      if (!selectedStaffId) return;
      const [h, m] = slot.time.split(":").map(Number);
      const endMin = h * 60 + m + 30;
      const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      createOverride.mutate({
        staffMemberId: selectedStaffId,
        date: day.date,
        startTime: slot.time,
        endTime,
        isAvailable: false,
        reason: reason || "Blocked",
      });
      setPopover(null);
      setShowReasonPrompt(false);
    },
    [selectedStaffId, createOverride]
  );

  const doUnblock = useCallback(
    (day: GridDay, slot: GridSlot) => {
      if (!selectedStaffId) return;
      if (slot.overrideId) {
        deleteOverride.mutate({ overrideId: slot.overrideId });
      } else {
        deleteOverrideByDate.mutate({
          staffMemberId: selectedStaffId,
          date: day.date,
        });
      }
      setPopover(null);
    },
    [selectedStaffId, deleteOverride, deleteOverrideByDate]
  );

  const handleAddExtraOrBlock = useCallback(() => {
    if (!selectedStaffId || !addDate) return;
    createOverride.mutate(
      {
        staffMemberId: selectedStaffId,
        date: addDate,
        startTime: addStart,
        endTime: addEnd,
        isAvailable: blockMode === "extra",
        reason: addReason || undefined,
      },
      {
        onSuccess: () => {
          setShowAddModal(false);
          setAddDate("");
          setAddStart("09:00");
          setAddEnd("17:00");
          setAddReason("");
        },
      }
    );
  }, [selectedStaffId, addDate, addStart, addEnd, addReason, blockMode, createOverride]);

  const stats = useMemo(() => {
    let available = 0;
    let booked = 0;
    let blocked = 0;
    for (const day of days) {
      for (const slot of day.slots) {
        if (slot.status === "available" || slot.status === "extra") available++;
        else if (slot.status === "booked") booked++;
        else if (slot.status === "blocked") blocked++;
      }
    }
    return { available, booked, blocked };
  }, [days]);

  const isMutating =
    createOverride.isPending ||
    deleteOverride.isPending ||
    deleteOverrideByDate.isPending ||
    cancelMutation.isPending;

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold">
            <Clock className="h-6 w-6 text-accent" />
            Bookable Hours
          </h1>
          <p className="mt-1 text-muted-foreground">
            Set when customers can and cannot book: working hours, breaks, leave, and extra time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/book/${encodeURIComponent(orgSlug)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Eye className="h-4 w-4" />
            Preview as Customer
          </a>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Add Hours / Block Time
          </button>
        </div>
      </div>

      {staffLoading ? (
        <div className="mt-16 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Staff Selector */}
          <div className="mt-6 flex flex-wrap gap-2">
            {staff.map((member) => {
              const initials = member.displayName
                .split(" ")
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              return (
                <button
                  key={member.id}
                  onClick={() => setSelectedStaffId(member.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all",
                    member.id === selectedStaffId
                      ? "border-accent bg-accent/10 text-foreground shadow-sm"
                      : "border-border text-muted-foreground hover:border-accent/50 hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                      member.id === selectedStaffId
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

          {/* Stats bar */}
          <div className="mt-4 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-green-500" />
              <span className="text-muted-foreground">Available: {stats.available}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-blue-500" />
              <span className="text-muted-foreground">Booked: {stats.booked}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-red-400" />
              <span className="text-muted-foreground">Blocked: {stats.blocked}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-emerald-300" />
              <span className="text-muted-foreground">Extra hours</span>
            </div>
          </div>

          {/* Week Navigation */}
          <div className="mt-5 flex items-center justify-between">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev Week
            </button>
            <h3 className="font-semibold text-foreground">
              {formatDateShort(fmt(weekStart))} — {formatDateShort(fmt(weekEnd))}
              {isMutating && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
            </h3>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Next Week
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Grid */}
          {gridLoading ? (
            <div className="mt-8 flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-16 bg-card border-b border-r border-border p-2 text-left text-muted-foreground font-medium">
                      Time
                    </th>
                    {days.map((day) => {
                      const isToday = day.date === fmt(today);
                      return (
                        <th
                          key={day.date}
                          className={cn(
                            "border-b border-r border-border p-2 text-center font-medium min-w-[80px]",
                            isToday ? "bg-accent/10 text-accent" : "bg-card text-muted-foreground"
                          )}
                        >
                          <div>{DAY_NAMES[day.dayOfWeek]}</div>
                          <div className={cn("text-[11px]", isToday ? "font-bold" : "font-normal")}>
                            {formatDateShort(day.date)}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleTimeRange.map((time) => (
                    <tr key={time}>
                      <td className="sticky left-0 z-10 bg-card border-r border-b border-border px-2 py-1 text-muted-foreground font-mono whitespace-nowrap">
                        {formatTimeLabel(time)}
                      </td>
                      {days.map((day) => {
                        const slot = day.slots.find((s) => s.time === time);
                        if (!slot) return <td key={day.date} className="border-r border-b border-border" />;

                        const isPopoverTarget =
                          popover?.day.date === day.date && popover?.slot.time === time;

                        return (
                          <td
                            key={day.date}
                            onClick={(e) => handleSlotClick(e, day, slot)}
                            className={cn(
                              "border-r border-b border-border relative transition-all cursor-pointer",
                              slot.status === "available" &&
                                "bg-green-500/15 hover:bg-green-500/30",
                              slot.status === "extra" &&
                                "bg-emerald-300/25 hover:bg-emerald-400/40",
                              slot.status === "booked" &&
                                "bg-blue-500/20 hover:bg-blue-500/30",
                              slot.status === "blocked" &&
                                "bg-red-400/20 hover:bg-red-400/30",
                              slot.status === "outside" &&
                                "bg-muted/30 cursor-default",
                              isPopoverTarget && "ring-2 ring-inset ring-accent"
                            )}
                          >
                            {slot.status === "booked" && (
                              <div className="px-1 py-0.5 truncate text-[10px] text-blue-700 font-medium">
                                {slot.serviceName || slot.clientName || "Booked"}
                              </div>
                            )}
                            {slot.status === "blocked" && (
                              <div className="px-1 py-0.5 truncate text-[10px] text-red-500">
                                <Ban className="inline h-2.5 w-2.5 mr-0.5" />
                                {slot.reason || "Blocked"}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Contextual Popover — Smart Suggestions */}
      {popover && (
        <div
          ref={popoverRef}
          className="fixed z-50 animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: Math.min(Math.max(popover.x - 110, 10), window.innerWidth - 240),
            top: Math.max(popover.y - 10, 60),
          }}
        >
          <div className="w-56 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            {/* Header */}
            <div className="border-b border-border px-3 py-2">
              <p className="text-xs font-semibold text-foreground">
                {DAY_NAMES[popover.day.dayOfWeek]} {formatDateShort(popover.day.date)}, {formatTimeLabel(popover.slot.time)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {selectedStaff?.displayName ?? "Staff"} ·{" "}
                <span className={cn(
                  "font-medium",
                  popover.slot.status === "available" && "text-green-600",
                  popover.slot.status === "extra" && "text-emerald-600",
                  popover.slot.status === "booked" && "text-blue-600",
                  popover.slot.status === "blocked" && "text-red-500",
                )}>
                  {popover.slot.status === "extra" ? "Extra hours" : popover.slot.status.charAt(0).toUpperCase() + popover.slot.status.slice(1)}
                </span>
              </p>
            </div>

            {/* Actions based on slot status */}
            <div className="py-1">
              {popover.slot.status === "available" && (
                <>
                  <PopoverBtn
                    icon={<Ban className="h-3.5 w-3.5" />}
                    label="Block This Slot"
                    onClick={() => {
                      if (!showReasonPrompt) {
                        setShowReasonPrompt(true);
                      } else {
                        doBlock(popover.day, popover.slot, blockReasonInput || undefined);
                      }
                    }}
                  />
                  {showReasonPrompt && (
                    <div className="px-3 pb-2">
                      <input
                        type="text"
                        autoFocus
                        value={blockReasonInput}
                        onChange={(e) => setBlockReasonInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            doBlock(popover.day, popover.slot, blockReasonInput || undefined);
                          }
                        }}
                        placeholder="Reason (optional)... press Enter"
                        className="w-full rounded-md border border-border bg-muted px-2 py-1 text-xs outline-none focus:border-accent"
                      />
                    </div>
                  )}
                  <PopoverBtn
                    icon={<Coffee className="h-3.5 w-3.5" />}
                    label="Set as Break"
                    onClick={() => doBlock(popover.day, popover.slot, "Break")}
                  />
                  <PopoverBtn
                    icon={<CalendarCheck className="h-3.5 w-3.5" />}
                    label="Book Appointment Here"
                    onClick={() => {
                      const dateLabel = new Date(popover.day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
                      const staffName = selectedStaff?.displayName ?? "";
                      sendToAiChat(`I want to book a client in for ${dateLabel} at ${formatTimeLabel(popover.slot.time)}${staffName ? ` with ${staffName}` : ""}. Which service should it be?`);
                      setPopover(null);
                    }}
                  />
                </>
              )}

              {popover.slot.status === "extra" && (
                <>
                  <PopoverBtn
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label="Remove Extra Hours"
                    danger
                    onClick={() => doUnblock(popover.day, popover.slot)}
                  />
                  <PopoverBtn
                    icon={<Ban className="h-3.5 w-3.5" />}
                    label="Block Instead"
                    onClick={() => doBlock(popover.day, popover.slot, "Blocked")}
                  />
                </>
              )}

              {popover.slot.status === "booked" && (
                <>
                  <div className="px-3 py-1.5">
                    <p className="text-[11px] font-medium text-foreground">
                      {popover.slot.clientName || "Client"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {popover.slot.serviceName || "Service"}
                    </p>
                  </div>
                  <div className="border-t border-border" />
                  <PopoverBtn
                    icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                    label="Reschedule"
                    onClick={() => {
                      const clientName = popover.slot.clientName ?? "the client";
                      const serviceName = popover.slot.serviceName ?? "appointment";
                      sendToAiChat(`Reschedule ${clientName}'s ${serviceName} to a different time`);
                      setPopover(null);
                    }}
                  />
                  <PopoverBtn
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label="Cancel Appointment"
                    danger
                    onClick={() => {
                      if (popover.slot.appointmentId) {
                        cancelMutation.mutate({ id: popover.slot.appointmentId });
                      }
                    }}
                  />
                  <PopoverBtn
                    icon={<Eye className="h-3.5 w-3.5" />}
                    label="View in Calendar"
                    onClick={() => setPopover(null)}
                    href="/dashboard/calendar"
                  />
                </>
              )}

              {popover.slot.status === "blocked" && (
                <>
                  {popover.slot.reason && (
                    <div className="px-3 py-1.5">
                      <p className="text-[10px] text-red-500">
                        <Ban className="inline h-2.5 w-2.5 mr-0.5" />
                        {popover.slot.reason}
                      </p>
                    </div>
                  )}
                  <PopoverBtn
                    icon={<Unlock className="h-3.5 w-3.5" />}
                    label="Unblock This Slot"
                    onClick={() => doUnblock(popover.day, popover.slot)}
                  />
                  <PopoverBtn
                    icon={<CalendarPlus className="h-3.5 w-3.5" />}
                    label="Make Available Instead"
                    onClick={() => {
                      doUnblock(popover.day, popover.slot);
                    }}
                  />
                </>
              )}
            </div>

            {/* Dismiss */}
            <div className="border-t border-border">
              <button
                onClick={() => {
                  setPopover(null);
                  setShowReasonPrompt(false);
                }}
                className="flex w-full items-center justify-center gap-1 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Hours / Block Time Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">
                {blockMode === "extra" ? "Add Extra Hours" : "Block Time"}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setBlockMode("extra")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    blockMode === "extra"
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CalendarPlus className="h-4 w-4" />
                  Add Extra Hours
                </button>
                <button
                  onClick={() => setBlockMode("block")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    blockMode === "block"
                      ? "bg-red-500 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Ban className="h-4 w-4" />
                  Block Time Off
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Date</label>
                <input
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  min={fmt(today)}
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>

              {blockMode === "extra" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Start Time</label>
                    <input
                      type="time"
                      value={addStart}
                      onChange={(e) => setAddStart(e.target.value)}
                      className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">End Time</label>
                    <input
                      type="time"
                      value={addEnd}
                      onChange={(e) => setAddEnd(e.target.value)}
                      className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={addReason}
                  onChange={(e) => setAddReason(e.target.value)}
                  placeholder={
                    blockMode === "extra"
                      ? "e.g. Covering for Alex"
                      : "e.g. Dentist appointment"
                  }
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>

              <button
                onClick={handleAddExtraOrBlock}
                disabled={!addDate || createOverride.isPending}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50",
                  blockMode === "extra"
                    ? "bg-accent text-accent-foreground hover:opacity-90"
                    : "bg-red-500 text-white hover:bg-red-600"
                )}
              >
                {createOverride.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : blockMode === "extra" ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                {blockMode === "extra" ? "Add Extra Availability" : "Block This Day"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PopoverBtn({
  icon,
  label,
  onClick,
  danger,
  subtitle,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  subtitle?: string;
  href?: string;
}) {
  const classes = cn(
    "flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors text-left",
    danger
      ? "text-red-600 hover:bg-red-50"
      : "text-foreground hover:bg-muted"
  );

  const content = (
    <>
      {icon}
      <div>
        <span>{label}</span>
        {subtitle && (
          <span className="block text-[10px] font-normal text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={classes}>
      {content}
    </button>
  );
}
