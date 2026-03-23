"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  Clock,
  Calendar,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Welcome", number: 1 },
  { label: "Services", number: 2 },
  { label: "Hours", number: 3 },
  { label: "Done", number: 4 },
] as const;

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

function formatTimeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

interface ServiceEntry {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
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

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 2: Services state
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState(30);
  const [servicePrice, setServicePrice] = useState(0);
  const [addingService, setAddingService] = useState(false);

  // Step 3: Hours state
  const [schedules, setSchedules] = useState<DaySchedule[]>(defaultSchedules());
  const [quickStart, setQuickStart] = useState("09:00");
  const [quickEnd, setQuickEnd] = useState("17:00");

  const { data: org } = trpc.organization.getCurrent.useQuery();
  const { data: staffList } = trpc.staff.list.useQuery();

  const createServiceMutation = trpc.service.create.useMutation();
  const updateScheduleMutation = trpc.staff.updateSchedule.useMutation();
  const completeOnboardingMutation =
    trpc.organization.completeOnboarding.useMutation({
      onSuccess: () => {
        router.push("/dashboard");
      },
    });

  const staffMember = staffList?.[0];

  function applyQuickHours() {
    setSchedules((prev) =>
      prev.map((d) => ({
        ...d,
        isAvailable: d.dayOfWeek >= 1 && d.dayOfWeek <= 5,
        startTime: quickStart,
        endTime: quickEnd,
      }))
    );
  }

  useEffect(() => {
    applyQuickHours();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddService() {
    if (!serviceName.trim()) return;
    setAddingService(true);
    try {
      await createServiceMutation.mutateAsync({
        name: serviceName.trim(),
        durationMinutes: serviceDuration,
        price: servicePrice,
      });
      setServices((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: serviceName.trim(),
          durationMinutes: serviceDuration,
          price: servicePrice,
        },
      ]);
      setServiceName("");
      setServiceDuration(30);
      setServicePrice(0);
    } finally {
      setAddingService(false);
    }
  }

  function removeService(id: string) {
    setServices((prev) => prev.filter((s) => s.id !== id));
  }

  function updateDay(dayOfWeek: number, patch: Partial<DaySchedule>) {
    setSchedules((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d))
    );
  }

  async function handleSaveSchedule() {
    if (!staffMember) return;
    await updateScheduleMutation.mutateAsync({
      staffMemberId: staffMember.id,
      schedules: schedules.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.isAvailable ? s.startTime : "09:00",
        endTime: s.isAvailable ? s.endTime : "17:00",
        isAvailable: s.isAvailable,
      })),
    });
  }

  async function handleFinish() {
    completeOnboardingMutation.mutate();
  }

  function nextStep() {
    if (step === 3 && staffMember) {
      handleSaveSchedule();
    }
    setStep((s) => Math.min(s + 1, 4));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 1));
  }

  const progressPercent = (step / 4) * 100;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Progress Bar */}
      <div className="border-b border-border bg-card px-8 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Step {step} of {STEPS.length}
            </span>
            <span>{STEPS[step - 1]?.label}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between">
            {STEPS.map((s) => (
              <div
                key={s.number}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium transition-colors",
                  step >= s.number
                    ? "text-accent"
                    : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                    step > s.number
                      ? "bg-accent text-accent-foreground"
                      : step === s.number
                        ? "bg-accent/20 text-accent"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {step > s.number ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    s.number
                  )}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-start justify-center px-8 py-12">
        <div className="w-full max-w-2xl">
          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
                <Sparkles className="h-8 w-8 text-accent" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">
                Welcome to BookAI!
              </h1>
              {org?.name && (
                <p className="mt-2 text-lg text-accent">
                  {org.name}
                </p>
              )}
              <p className="mt-4 max-w-md text-muted-foreground">
                Let&apos;s get your business set up in just a few steps.
                We&apos;ll help you add your services, set your working
                hours, and get ready to accept bookings.
              </p>
              <button
                onClick={nextStep}
                className="mt-8 flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-foreground hover:opacity-90"
              >
                Let&apos;s get set up
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2: Services */}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                What services do you offer?
              </h1>
              <p className="mt-1 text-muted-foreground">
                Add the services your clients can book. You can always add
                more later.
              </p>

              {/* Add service form */}
              <div className="mt-6 rounded-xl border border-border bg-card p-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">
                      Service Name
                    </label>
                    <input
                      value={serviceName}
                      onChange={(e) => setServiceName(e.target.value)}
                      placeholder="e.g. Haircut"
                      className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">
                      Duration (min)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={480}
                      value={serviceDuration}
                      onChange={(e) =>
                        setServiceDuration(Number(e.target.value))
                      }
                      className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">
                      Price ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={servicePrice}
                      onChange={(e) =>
                        setServicePrice(Number(e.target.value))
                      }
                      className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddService}
                  disabled={addingService || !serviceName.trim()}
                  className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {addingService ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Add Service
                </button>

                {createServiceMutation.isError && (
                  <p className="mt-2 text-sm text-red-500">
                    {createServiceMutation.error.message}
                  </p>
                )}
              </div>

              {/* Service list */}
              {services.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Added Services ({services.length})
                  </h3>
                  {services.map((svc) => (
                    <div
                      key={svc.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-foreground">
                          {svc.name}
                        </span>
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {svc.durationMinutes}min
                        </span>
                        <span className="text-sm text-muted-foreground">
                          ${svc.price.toFixed(2)}
                        </span>
                      </div>
                      <button
                        onClick={() => removeService(svc.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Navigation */}
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={prevStep}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={nextStep}
                  className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
                >
                  {services.length === 0 ? "Skip for now" : "Continue"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Staff & Hours */}
          {step === 3 && (
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground">
                <Calendar className="h-6 w-6 text-accent" />
                Set your working hours
              </h1>
              <p className="mt-1 text-muted-foreground">
                {staffMember
                  ? `Configure availability for ${staffMember.displayName}.`
                  : "Set your default weekly hours. You can adjust per staff member later."}
              </p>

              {/* Quick Setup */}
              <div className="mt-6 rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Quick Setup — Mon to Fri
                </h3>
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Start Time
                    </label>
                    <select
                      value={quickStart}
                      onChange={(e) => setQuickStart(e.target.value)}
                      className="rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {formatTimeLabel(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      End Time
                    </label>
                    <select
                      value={quickEnd}
                      onChange={(e) => setQuickEnd(e.target.value)}
                      className="rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {formatTimeLabel(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={applyQuickHours}
                    className="rounded-lg border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20"
                  >
                    Apply to Mon–Fri
                  </button>
                </div>
              </div>

              {/* Per-day schedule */}
              <div className="mt-4 rounded-xl border border-border bg-card">
                <div className="divide-y divide-border">
                  {schedules.map((day) => (
                    <div
                      key={day.dayOfWeek}
                      className={cn(
                        "flex items-center gap-4 px-5 py-3 transition-colors sm:gap-6",
                        day.isAvailable ? "bg-card" : "bg-muted/30"
                      )}
                    >
                      {/* Day Name */}
                      <span
                        className={cn(
                          "w-24 shrink-0 text-sm font-medium",
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
                          updateDay(day.dayOfWeek, {
                            isAvailable: !day.isAvailable,
                          })
                        }
                        className={cn(
                          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                          day.isAvailable
                            ? "bg-green-500"
                            : "bg-muted-foreground/30"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                            day.isAvailable && "translate-x-5"
                          )}
                        />
                      </button>

                      {/* Times */}
                      {day.isAvailable ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={day.startTime}
                            onChange={(e) =>
                              updateDay(day.dayOfWeek, {
                                startTime: e.target.value,
                              })
                            }
                            className="rounded-lg border border-border bg-muted px-2 py-1.5 text-sm outline-none focus:border-accent"
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
                              updateDay(day.dayOfWeek, {
                                endTime: e.target.value,
                              })
                            }
                            className="rounded-lg border border-border bg-muted px-2 py-1.5 text-sm outline-none focus:border-accent"
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
              </div>

              {updateScheduleMutation.isError && (
                <p className="mt-3 text-sm text-red-500">
                  {updateScheduleMutation.error.message}
                </p>
              )}

              {/* Navigation */}
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={prevStep}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={nextStep}
                  disabled={updateScheduleMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {updateScheduleMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">
                You&apos;re all set!
              </h1>
              <p className="mt-3 max-w-md text-muted-foreground">
                Your business is configured and ready to accept bookings.
                Here&apos;s a summary of what we set up:
              </p>

              {/* Summary */}
              <div className="mt-8 w-full max-w-md space-y-3 text-left">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
                    <Sparkles className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Services
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {services.length > 0
                        ? `${services.length} service${services.length > 1 ? "s" : ""} added: ${services.map((s) => s.name).join(", ")}`
                        : "No services added yet — you can add them from the dashboard."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
                    <Calendar className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Working Hours
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {schedules.filter((s) => s.isAvailable).length} days
                      available per week
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleFinish}
                disabled={completeOnboardingMutation.isPending}
                className="mt-8 flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {completeOnboardingMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </button>

              {completeOnboardingMutation.isError && (
                <p className="mt-3 text-sm text-red-500">
                  {completeOnboardingMutation.error.message}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
