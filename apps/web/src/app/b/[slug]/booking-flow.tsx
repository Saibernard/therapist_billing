"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Clock,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  User,
  Mail,
  Phone,
  Check,
  Loader2,
  CalendarDays,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  durationMinutes: number;
  price: number;
  color: string;
}

interface StaffMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  staffMemberId: string;
  staffName: string;
  available: boolean;
}

interface ClientInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface BookingFlowProps {
  organization: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    timezone: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  bookingPage: {
    title: string;
    description: string | null;
    showStaffSelection: boolean;
    showPrices: boolean;
  };
  services: Service[];
  servicesByCategory: Record<string, Service[]>;
  staffMembers: StaffMember[];
}

type BookingResult = {
  id: string;
  startTime: string;
  endTime: string;
  service: { name: string; durationMinutes: number };
  staffMember: { displayName: string };
};

const STEPS = ["Service", "Date & Time", "Your Info", "Confirm"] as const;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
}

function getNext14Days(): { date: string; dayName: string; dayNum: number; monthName: string; isToday: boolean }[] {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push({
      date: d.toISOString().split("T")[0],
      dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: d.getDate(),
      monthName: d.toLocaleDateString("en-US", { month: "short" }),
      isToday: i === 0,
    });
  }
  return days;
}

function formatSlotTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const STORAGE_KEY = "bookai_client";

function getSavedClient(orgId: string): ClientInfo | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${orgId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.firstName && (parsed.email || parsed.phone)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveClient(orgId: string, info: ClientInfo) {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${orgId}`, JSON.stringify(info));
  } catch {}
}

export function BookingFlow({
  organization,
  bookingPage,
  services,
  servicesByCategory,
  staffMembers,
}: BookingFlowProps) {
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [isReturningClient, setIsReturningClient] = useState(false);
  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const dateScrollRef = useRef<HTMLDivElement>(null);
  const days = getNext14Days();

  useEffect(() => {
    const saved = getSavedClient(organization.id);
    if (saved) {
      setClientInfo(saved);
      setIsReturningClient(true);
    }
  }, [organization.id]);

  const fetchSlots = useCallback(
    async (date: string) => {
      if (!selectedService) return;
      setLoadingSlots(true);
      setSlots([]);
      try {
        const input = JSON.stringify({
          organizationId: organization.id,
          serviceId: selectedService.id,
          date,
          timezone: organization.timezone,
        });
        const res = await fetch(
          `/api/trpc/availability.getSlots?input=${encodeURIComponent(input)}`
        );
        const json = await res.json();
        setSlots(json?.result?.data ?? []);
      } catch {
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    },
    [selectedService, organization.id, organization.timezone]
  );

  useEffect(() => {
    if (selectedDate && step === 2) {
      fetchSlots(selectedDate);
    }
  }, [selectedDate, step, fetchSlots]);

  function handleServiceSelect(service: Service) {
    setSelectedService(service);
    setSelectedDate(null);
    setSelectedSlot(null);
    setStep(2);
  }

  function handleSlotSelect(slot: TimeSlot) {
    setSelectedSlot(slot);
    if (isReturningClient && clientInfo.firstName && (clientInfo.email || clientInfo.phone)) {
      setStep(4);
    } else {
      setStep(3);
    }
  }

  function handleClientInfoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep(4);
  }

  async function handleConfirm() {
    if (!selectedService || !selectedSlot || !selectedDate) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const startTime = new Date(`${selectedDate}T${selectedSlot.startTime}:00`);
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: organization.id,
          serviceId: selectedService.id,
          staffMemberId: selectedSlot.staffMemberId,
          startTime: startTime.toISOString(),
          firstName: clientInfo.firstName,
          lastName: clientInfo.lastName || undefined,
          email: clientInfo.email || undefined,
          phone: clientInfo.phone || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Booking failed. Please try again.");
      }

      const data = await res.json();
      saveClient(organization.id, clientInfo);

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      setBookingResult(data.appointment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function goBack() {
    if (step === 4 && isReturningClient && clientInfo.firstName && (clientInfo.email || clientInfo.phone)) {
      setStep(2);
    } else if (step > 1) {
      setStep(step - 1);
    }
  }

  const slotsByStaff = slots.reduce<Record<string, { name: string; slots: TimeSlot[] }>>(
    (acc, slot) => {
      if (!acc[slot.staffMemberId]) {
        acc[slot.staffMemberId] = { name: slot.staffName, slots: [] };
      }
      acc[slot.staffMemberId].slots.push(slot);
      return acc;
    },
    {}
  );

  if (bookingResult) {
    return <SuccessScreen result={bookingResult} organization={organization} />;
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => {
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const skippedInfoStep = isReturningClient && stepNum === 3 && step === 4;
            const isComplete = step > stepNum || skippedInfoStep;
            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={cn(
                      "h-px w-6 sm:w-10",
                      isComplete ? "bg-accent" : "bg-border"
                    )}
                  />
                )}
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      isActive && "bg-accent text-accent-foreground",
                      isComplete && "bg-accent/20 text-accent",
                      !isActive && !isComplete && "bg-muted text-muted-foreground"
                    )}
                  >
                    {isComplete ? <Check className="h-3.5 w-3.5" /> : stepNum}
                  </div>
                  <span
                    className={cn(
                      "hidden text-sm font-medium sm:inline",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Back button */}
      {step > 1 && (
        <button
          onClick={goBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      )}

      {/* Step 1: Service Selection */}
      {step === 1 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-foreground">
            Choose a service
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Select the service you&apos;d like to book.
          </p>
          {Object.entries(servicesByCategory).map(([category, catServices]) => (
            <div key={category} className="mb-8">
              {Object.keys(servicesByCategory).length > 1 && (
                <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {category}
                </h3>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {catServices.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => handleServiceSelect(service)}
                    className={cn(
                      "group relative rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-accent/50 hover:shadow-md",
                      selectedService?.id === service.id &&
                        "border-accent ring-2 ring-accent/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: service.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-foreground">
                          {service.name}
                        </h4>
                        {service.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {service.description}
                          </p>
                        )}
                        <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDuration(service.durationMinutes)}
                          </span>
                          {bookingPage.showPrices && (
                            <span className="flex items-center gap-1 font-medium text-foreground">
                              <DollarSign className="h-3.5 w-3.5" />
                              {formatPrice(service.price)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 2: Date & Time Selection */}
      {step === 2 && selectedService && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-foreground">
            Pick a date & time
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {selectedService.name} &middot;{" "}
            {formatDuration(selectedService.durationMinutes)}
          </p>

          {/* Date pills */}
          <div className="relative mb-6">
            <button
              onClick={() =>
                dateScrollRef.current?.scrollBy({ left: -200, behavior: "smooth" })
              }
              className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card shadow-md border border-border text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div
              ref={dateScrollRef}
              className="scrollbar-hide flex gap-2 overflow-x-auto px-6 py-1"
            >
              {days.map((day) => (
                <button
                  key={day.date}
                  onClick={() => {
                    setSelectedDate(day.date);
                    setSelectedSlot(null);
                  }}
                  className={cn(
                    "flex shrink-0 flex-col items-center rounded-xl border px-4 py-3 transition-all",
                    selectedDate === day.date
                      ? "border-accent bg-accent text-accent-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:border-accent/40"
                  )}
                >
                  <span className="text-[11px] font-medium uppercase tracking-wide opacity-70">
                    {day.dayName}
                  </span>
                  <span className="text-lg font-bold leading-tight">
                    {day.dayNum}
                  </span>
                  <span className="text-[11px] opacity-70">{day.monthName}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() =>
                dateScrollRef.current?.scrollBy({ left: 200, behavior: "smooth" })
              }
              className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card shadow-md border border-border text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Time slots */}
          {!selectedDate && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16">
              <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium text-muted-foreground">
                Select a date to see available times
              </p>
            </div>
          )}

          {selectedDate && loadingSlots && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">
                Finding available times…
              </p>
            </div>
          )}

          {selectedDate && !loadingSlots && slots.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16">
              <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium text-foreground">No availability</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try picking a different date.
              </p>
            </div>
          )}

          {selectedDate && !loadingSlots && slots.length > 0 && (
            <div className="space-y-6">
              {Object.entries(slotsByStaff).map(([staffId, { name, slots: staffSlots }]) => (
                <div key={staffId}>
                  {bookingPage.showStaffSelection &&
                    Object.keys(slotsByStaff).length > 1 && (
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {name}
                        </span>
                      </div>
                    )}
                  <div className="flex flex-wrap gap-2">
                    {staffSlots.map((slot) => {
                      const isSelected =
                        selectedSlot?.startTime === slot.startTime &&
                        selectedSlot?.staffMemberId === slot.staffMemberId;
                      return (
                        <button
                          key={`${slot.staffMemberId}-${slot.startTime}`}
                          onClick={() => handleSlotSelect(slot)}
                          className={cn(
                            "rounded-lg border px-4 py-2.5 text-sm font-medium transition-all",
                            isSelected
                              ? "border-accent bg-accent text-accent-foreground shadow-sm"
                              : "border-border bg-card text-foreground hover:border-accent/40 hover:shadow-sm"
                          )}
                        >
                          {formatSlotTime(slot.startTime)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Client Info */}
      {step === 3 && (
        <div>
          {isReturningClient ? (
            <>
              <h2 className="mb-1 text-lg font-semibold text-foreground">
                Welcome back, {clientInfo.firstName}!
              </h2>
              <p className="mb-6 text-sm text-muted-foreground">
                We remembered you. Update anything below, or just continue.
              </p>
            </>
          ) : (
            <>
              <h2 className="mb-1 text-lg font-semibold text-foreground">
                Almost there
              </h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Just your name and how to reach you. No account needed.
              </p>
            </>
          )}

          <form onSubmit={handleClientInfoSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Your name <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  required
                  maxLength={50}
                  value={clientInfo.firstName}
                  onChange={(e) =>
                    setClientInfo((c) => ({ ...c, firstName: e.target.value }))
                  }
                  placeholder="Jane"
                  className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Email or phone <span className="text-destructive">*</span>
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                For your booking confirmation. Pick whichever you prefer.
              </p>
              <div className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    maxLength={100}
                    value={clientInfo.email}
                    onChange={(e) =>
                      setClientInfo((c) => ({ ...c, email: e.target.value }))
                    }
                    placeholder="jane@example.com"
                    className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="tel"
                    maxLength={20}
                    value={clientInfo.phone}
                    onChange={(e) =>
                      setClientInfo((c) => ({ ...c, phone: e.target.value }))
                    }
                    placeholder="(555) 123-4567"
                    className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={
                !clientInfo.firstName.trim() ||
                (!clientInfo.email.trim() && !clientInfo.phone.trim())
              }
              className="mt-2 w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isReturningClient ? "Looks good" : "Continue"}
            </button>

            {isReturningClient && (
              <button
                type="button"
                onClick={() => {
                  setIsReturningClient(false);
                  setClientInfo({ firstName: "", lastName: "", email: "", phone: "" });
                  try {
                    localStorage.removeItem(`${STORAGE_KEY}_${organization.id}`);
                  } catch {}
                }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Not {clientInfo.firstName}? Start fresh
              </button>
            )}
          </form>
        </div>
      )}

      {/* Step 4: Confirmation */}
      {step === 4 && selectedService && selectedSlot && selectedDate && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-foreground">
            {isReturningClient ? `Confirm, ${clientInfo.firstName}` : "Confirm your booking"}
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Review the details below, then confirm.
          </p>

          <div className="mb-6 rounded-xl border border-border bg-card p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedService.color }}
                />
                <div>
                  <p className="font-semibold text-foreground">
                    {selectedService.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDuration(selectedService.durationMinutes)}
                    {bookingPage.showPrices &&
                      ` · ${formatPrice(selectedService.price)}`}
                  </p>
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">
                    {formatDateDisplay(selectedDate)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatSlotTime(selectedSlot.startTime)} –{" "}
                    {formatSlotTime(selectedSlot.endTime)}
                  </p>
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">
                    with {selectedSlot.staffName}
                  </p>
                  {organization.address && (
                    <p className="text-sm text-muted-foreground">
                      {organization.address}
                    </p>
                  )}
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="flex items-start gap-3">
                {clientInfo.email ? (
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                ) : (
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium text-foreground">
                    {clientInfo.firstName} {clientInfo.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {clientInfo.email || clientInfo.phone}
                    {clientInfo.email && clientInfo.phone && ` · ${clientInfo.phone}`}
                  </p>
                  {isReturningClient && (
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="mt-1 text-xs text-accent hover:underline"
                    >
                      Edit info
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Booking…
              </>
            ) : (
              "Confirm Booking"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function SuccessScreen({
  result,
  organization,
}: {
  result: BookingResult;
  organization: { name: string; address: string | null; phone: string | null };
}) {
  const startDate = new Date(result.startTime);

  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
        <Check className="h-8 w-8 text-green-600" />
      </div>

      <h2 className="mb-2 text-2xl font-bold text-foreground">
        You&apos;re booked!
      </h2>
      <p className="mb-8 text-muted-foreground">
        Your appointment with {organization.name} is confirmed.
      </p>

      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-left">
        <div className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Service</p>
            <p className="font-semibold text-foreground">
              {result.service.name}
            </p>
          </div>
          <div className="h-px bg-border" />
          <div>
            <p className="text-sm text-muted-foreground">Date & Time</p>
            <p className="font-semibold text-foreground">
              {startDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {startDate.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              · {result.service.durationMinutes} min
            </p>
          </div>
          <div className="h-px bg-border" />
          <div>
            <p className="text-sm text-muted-foreground">Staff</p>
            <p className="font-semibold text-foreground">
              {result.staffMember.displayName}
            </p>
          </div>
          {organization.address && (
            <>
              <div className="h-px bg-border" />
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-semibold text-foreground">
                  {organization.address}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-8 flex items-start gap-2 rounded-xl bg-accent/5 border border-accent/20 px-5 py-4 text-left">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <p className="text-sm text-muted-foreground">
          You&apos;ll receive a confirmation shortly. Need to reschedule
          or cancel?{" "}
          <span className="font-medium text-foreground">
            Just reply to the message
          </span>{" "}
          and our AI assistant will take care of it.
        </p>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Next time you book, we&apos;ll remember you — no forms needed.
      </p>
    </div>
  );
}
