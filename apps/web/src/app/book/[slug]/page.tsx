"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Clock,
  MapPin,
  Phone,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Calendar,
  User,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceInfo {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  category: string | null;
}

interface StaffInfo {
  id: string;
  displayName: string;
  bio: string | null;
  photoUrl: string | null;
  serviceIds: string[];
  workingDays: number[];
}

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  timezone: string;
  address: string | null;
  phone: string | null;
}

interface BookingPageInfo {
  title: string;
  description: string | null;
  showStaffSelection: boolean;
  showPrices: boolean;
  requirePayment: boolean;
}

interface SlotInfo {
  startTime: string;
  endTime: string;
  staffMemberId: string;
  staffName: string;
  available: boolean;
}

type Step = "service" | "staff" | "date" | "info" | "done";

export default function PublicBookingPage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = params;
  const searchParams = useSearchParams();
  const rescheduleToken = (searchParams.get("rescheduleToken") || "").trim();
  const isRescheduleMode = rescheduleToken.length > 0;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [staff, setStaff] = useState<StaffInfo[]>([]);
  const [bookingPage, setBookingPage] = useState<BookingPageInfo | null>(null);

  const [step, setStep] = useState<Step>("service");
  const [selectedService, setSelectedService] = useState<ServiceInfo | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffInfo | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState<SlotInfo[]>([]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingRescheduleContext, setLoadingRescheduleContext] = useState(false);
  const [rescheduleContextLoaded, setRescheduleContextLoaded] = useState(false);
  const [bookingResult, setBookingResult] = useState<{
    id: string;
    startTime: string;
    endTime: string;
    serviceName: string;
    staffName: string;
    wasRescheduled?: boolean;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/booking/info?slug=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setOrg(data.organization);
          setServices(data.services);
          setStaff(data.staff);
          setBookingPage(data.bookingPage);
        }
      })
      .catch(() => setError("Failed to load booking page"))
      .finally(() => setLoading(false));
  }, [slug]);

  const availableStaff = useMemo(() => {
    if (!selectedService) return [];
    return staff.filter((s) => s.serviceIds.includes(selectedService.id));
  }, [selectedService, staff]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();

    const days: Array<{ date: Date; inMonth: boolean; dateStr: string }> = [];

    for (let i = startPad - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, inMonth: false, dateStr: fmt(d) });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({ date, inMonth: true, dateStr: fmt(date) });
    }

    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      days.push({ date, inMonth: false, dateStr: fmt(date) });
    }

    return days;
  }, [calendarMonth]);

  const today = useMemo(() => fmt(new Date()), []);
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return fmt(d);
  }, []);

  const fetchSlots = useCallback(
    async (date: string) => {
      if (!selectedService || !org) return;
      setSlotsLoading(true);
      setSlots([]);
      try {
        const staffParam = selectedStaff ? `&staffMemberId=${selectedStaff.id}` : "";
        const res = await fetch(
          `/api/booking/slots?slug=${slug}&serviceId=${selectedService.id}&date=${date}${staffParam}`
        );
        const data = await res.json();
        setSlots(data.slots ?? []);
      } catch {
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    },
    [selectedService, selectedStaff, slug, org]
  );

  useEffect(() => {
    if (selectedDate && step === "date") {
      fetchSlots(selectedDate);
    }
  }, [selectedDate, step, fetchSlots]);

  useEffect(() => {
    if (!isRescheduleMode || rescheduleContextLoaded || !org) return;
    let cancelled = false;

    setLoadingRescheduleContext(true);
    fetch(`/api/booking/reschedule-context?token=${encodeURIComponent(rescheduleToken)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(data?.error || "Failed to load reschedule details.");
        }
        return data as {
          appointment: {
            id: string;
            organizationId: string;
            serviceId: string;
            staffMemberId: string;
            startTime: string;
          };
          client: { firstName: string; lastName?: string | null; email?: string | null; phone?: string | null };
        };
      })
      .then((data) => {
        if (cancelled) return;
        if (data.appointment.organizationId !== org.id) {
          throw new Error("This reschedule link does not match this business.");
        }

        const service = services.find((s) => s.id === data.appointment.serviceId);
        if (!service) {
          throw new Error("Original service is no longer available for online rescheduling.");
        }

        const staffMatch = staff.find((s) => s.id === data.appointment.staffMemberId) ?? null;

        setSelectedService(service);
        setSelectedStaff(staffMatch);
        setSelectedDate(fmt(new Date(data.appointment.startTime)));
        setSelectedSlot(null);
        setFirstName(data.client.firstName || "");
        setLastName(data.client.lastName || "");
        setEmail(data.client.email || "");
        setPhone(data.client.phone || "");
        setStep("date");
        setError("");
        setRescheduleContextLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load reschedule details.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingRescheduleContext(false);
          setRescheduleContextLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isRescheduleMode, org, rescheduleContextLoaded, rescheduleToken, services, staff]);

  const handleServiceSelect = (service: ServiceInfo) => {
    setSelectedService(service);
    setSelectedStaff(null);
    setSelectedDate(null);
    setSelectedSlot(null);

    const available = staff.filter((s) => s.serviceIds.includes(service.id));
    if (!bookingPage?.showStaffSelection || available.length <= 1) {
      if (available.length === 1) setSelectedStaff(available[0]);
      setStep("date");
    } else {
      setStep("staff");
    }
  };

  const handleStaffSelect = (s: StaffInfo | null) => {
    setSelectedStaff(s);
    setSelectedDate(null);
    setSelectedSlot(null);
    setStep("date");
  };

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
  };

  const handleSlotSelect = (slot: SlotInfo) => {
    setSelectedSlot(slot);
    setStep("info");
  };

  const handleSubmit = async () => {
    if (!org || !selectedService || !selectedSlot || !firstName) return;
    if (!email && !phone) return;

    setSubmitting(true);
    try {
      const dateTimeStr = `${selectedDate}T${selectedSlot.startTime}:00`;
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org.id,
          serviceId: selectedService.id,
          staffMemberId: selectedSlot.staffMemberId,
          startTime: new Date(dateTimeStr).toISOString(),
          firstName,
          lastName,
          email: email || undefined,
          phone: phone || undefined,
          notes: notes || undefined,
          rescheduleToken: isRescheduleMode ? rescheduleToken : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Booking failed");
        setSubmitting(false);
        return;
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      setBookingResult({
        id: data.appointment?.id,
        startTime: data.appointment?.startTime,
        endTime: data.appointment?.endTime,
        serviceName: selectedService.name,
        staffName: selectedSlot.staffName,
        wasRescheduled: Boolean(data.appointment?.wasRescheduled),
      });
      setStep("done");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (step === "info") {
      setStep("date");
      setSelectedSlot(null);
    } else if (step === "date") {
      if (bookingPage?.showStaffSelection && availableStaff.length > 1) {
        setStep("staff");
      } else {
        setStep("service");
      }
      setSelectedDate(null);
      setSelectedSlot(null);
    } else if (step === "staff") {
      setStep("service");
      setSelectedService(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error && !org) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Booking Unavailable</h1>
          <p className="mt-2 text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-4">
          {org?.logoUrl ? (
            <img src={org.logoUrl} alt="" className="h-10 w-10 rounded-xl object-contain" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-gray-900">{org?.name}</h1>
            {org?.address && (
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3 w-3" />
                {org.address}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {isRescheduleMode && (
          <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {loadingRescheduleContext
              ? "Loading your appointment details..."
              : "Reschedule mode: pick a new time for your existing appointment."}
          </div>
        )}

        {/* Progress bar */}
        {step !== "done" && (
          <div className="mb-8">
            <div className="flex items-center gap-2">
              {["service", "staff", "date", "info"].filter((s) => {
                if (s === "staff" && (!bookingPage?.showStaffSelection || availableStaff.length <= 1)) return false;
                return true;
              }).map((s, i, arr) => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    getStepIndex(step, bookingPage?.showStaffSelection && availableStaff.length > 1) >= i
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  )}>
                    {i + 1}
                  </div>
                  {i < arr.length - 1 && (
                    <div className={cn(
                      "h-0.5 flex-1 rounded-full transition-colors",
                      getStepIndex(step, bookingPage?.showStaffSelection && availableStaff.length > 1) > i
                        ? "bg-blue-500"
                        : "bg-gray-200"
                    )} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back button */}
        {step !== "service" && step !== "done" && (
          <button
            onClick={goBack}
            className="mb-6 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        )}

        {error && step !== "done" && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-100">
            {error}
          </div>
        )}

        {/* Step 1: Service */}
        {step === "service" && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Choose a service</h2>
            <p className="text-gray-500 mb-6">Select the service you&apos;d like to book.</p>
            <div className="space-y-3">
              {services.map((service) => (
                <button
                  key={service.id}
                  onClick={() => handleServiceSelect(service)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left transition-all hover:border-blue-300 hover:shadow-md hover:shadow-blue-100/50 group"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{service.name}</div>
                    {service.description && (
                      <div className="text-sm text-gray-500 truncate">{service.description}</div>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {service.durationMinutes} min
                      </span>
                      {bookingPage?.showPrices && (
                        <span className="font-semibold text-gray-700">
                          ${service.price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Staff */}
        {step === "staff" && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Choose your provider</h2>
            <p className="text-gray-500 mb-6">Who would you like to see?</p>
            <div className="space-y-3">
              <button
                onClick={() => handleStaffSelect(null)}
                className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left transition-all hover:border-blue-300 hover:shadow-md hover:shadow-blue-100/50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Anyone Available</div>
                  <div className="text-sm text-gray-500">First available staff member</div>
                </div>
              </button>

              {availableStaff.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleStaffSelect(s)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left transition-all hover:border-blue-300 hover:shadow-md hover:shadow-blue-100/50 group"
                >
                  {s.photoUrl ? (
                    <img
                      src={s.photoUrl}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 font-bold text-lg">
                      {s.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{s.displayName}</div>
                    {s.bio && <div className="text-sm text-gray-500 line-clamp-1">{s.bio}</div>}
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Date & Time */}
        {step === "date" && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Pick a date & time</h2>
            <p className="text-gray-500 mb-6">
              {selectedService?.name}
              {selectedStaff ? ` with ${selectedStaff.displayName}` : ""}
            </p>

            {/* Calendar */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => {
                    const prev = new Date(calendarMonth);
                    prev.setMonth(prev.getMonth() - 1);
                    setCalendarMonth(prev);
                  }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-semibold text-gray-900">
                  {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
                <button
                  onClick={() => {
                    const next = new Date(calendarMonth);
                    next.setMonth(next.getMonth() + 1);
                    setCalendarMonth(next);
                  }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <div key={d} className="py-1.5 text-xs font-medium text-gray-400">{d}</div>
                ))}

                {calendarDays.map((day, i) => {
                  const isPast = day.dateStr < today;
                  const isBeyond = day.dateStr > maxDate;
                  const isDisabled = isPast || isBeyond || !day.inMonth;
                  const isSelected = day.dateStr === selectedDate;
                  const isToday = day.dateStr === today;

                  return (
                    <button
                      key={i}
                      onClick={() => !isDisabled && handleDateSelect(day.dateStr)}
                      disabled={isDisabled}
                      className={cn(
                        "relative flex h-10 w-full items-center justify-center rounded-lg text-sm transition-all",
                        isSelected
                          ? "bg-blue-500 text-white font-bold shadow-sm"
                          : isDisabled
                            ? "text-gray-300 cursor-not-allowed"
                            : "hover:bg-blue-50 hover:text-blue-600 cursor-pointer text-gray-700",
                        isToday && !isSelected && "ring-1 ring-blue-300 font-semibold"
                      )}
                    >
                      {day.date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="font-semibold text-gray-900 mb-3">
                  Available times for{" "}
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </h3>

                {slotsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                  </div>
                ) : slots.length === 0 ? (
                  <p className="py-6 text-center text-gray-400">No available slots on this day. Try another date.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((slot, i) => (
                      <button
                        key={i}
                        onClick={() => handleSlotSelect(slot)}
                        className={cn(
                          "rounded-xl px-3 py-3 text-sm font-medium transition-all text-center",
                          selectedSlot?.startTime === slot.startTime &&
                            selectedSlot?.staffMemberId === slot.staffMemberId
                            ? "bg-blue-500 text-white shadow-sm"
                            : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 hover:border-blue-200"
                        )}
                      >
                        <div>{slot.startTime}</div>
                        {!selectedStaff && (
                          <div className="text-[10px] mt-0.5 opacity-75">{slot.staffName}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Customer Info */}
        {step === "info" && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {isRescheduleMode ? "Confirm your reschedule" : "Your details"}
            </h2>
            <p className="text-gray-500 mb-6">Almost there! Just a few details to confirm your booking.</p>

            {/* Booking summary */}
            <div className="mb-6 rounded-2xl bg-blue-50 border border-blue-100 p-5">
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-gray-900">Booking Summary</span>
              </div>
              <div className="space-y-1.5 text-sm text-gray-700">
                <div>
                  <span className="text-gray-500">Service:</span> {selectedService?.name}
                </div>
                <div>
                  <span className="text-gray-500">With:</span> {selectedSlot?.staffName}
                </div>
                <div>
                  <span className="text-gray-500">Date:</span>{" "}
                  {selectedDate &&
                    new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                </div>
                <div>
                  <span className="text-gray-500">Time:</span> {selectedSlot?.startTime}
                  {selectedSlot?.endTime ? ` - ${selectedSlot.endTime}` : ""}
                </div>
                {bookingPage?.showPrices && selectedService && (
                  <div>
                    <span className="text-gray-500">Price:</span>{" "}
                    <span className="font-semibold">${selectedService.price.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              {!email && !phone && (
                <p className="text-xs text-amber-600">Please provide at least an email or phone number.</p>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Anything we should know?"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none transition-all"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!firstName || (!email && !phone) || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-6 py-3.5 text-sm font-bold text-white transition-all hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-200"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {submitting
                  ? isRescheduleMode
                    ? "Rescheduling..."
                    : "Booking..."
                  : isRescheduleMode
                    ? "Confirm Reschedule"
                    : "Confirm Booking"}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Done */}
        {step === "done" && bookingResult && (
          <div className="text-center py-8">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {bookingResult.wasRescheduled ? "Appointment Rescheduled!" : "Booking Confirmed!"}
            </h2>
            <p className="text-gray-500 mb-8">
              {bookingResult.wasRescheduled
                ? "You&apos;re all set. We&apos;ll send you an updated confirmation shortly."
                : "You&apos;re all set. We&apos;ll send you a confirmation shortly."}
            </p>

            <div className="mx-auto max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-left">
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <div>
                    <span className="font-medium">{bookingResult.serviceName}</span> with{" "}
                    {bookingResult.staffName}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <div>
                    {new Date(bookingResult.startTime).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}{" "}
                    at{" "}
                    {new Date(bookingResult.startTime).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                {org?.address && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <div>{org.address}</div>
                  </div>
                )}
                {org?.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <div>{org.phone}</div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                setStep("service");
                setSelectedService(null);
                setSelectedStaff(null);
                setSelectedDate(null);
                setSelectedSlot(null);
                setFirstName("");
                setLastName("");
                setEmail("");
                setPhone("");
                setNotes("");
                setBookingResult(null);
                setError("");
              }}
              className="mt-8 rounded-xl bg-gray-100 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Book Another Appointment
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/80 backdrop-blur-sm mt-16">
        <div className="mx-auto max-w-2xl px-6 py-4 text-center text-xs text-gray-400">
          Powered by <span className="font-semibold text-gray-500">BookAI</span>
        </div>
      </footer>
    </div>
  );
}

function fmt(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getStepIndex(step: Step, hasStaffStep?: boolean): number {
  const steps: Step[] = hasStaffStep
    ? ["service", "staff", "date", "info"]
    : ["service", "date", "info"];
  return steps.indexOf(step);
}
