"use client";

import { useState, useEffect, useRef } from "react";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  Clock,
  Link2,
  Copy,
  Check,
  Bell,
  BellRing,
  MessageSquare,
  AlertTriangle,
  Trash2,
  Loader2,
  Save,
  Eye,
  Users,
  CreditCard,
  Calendar,
  Download,
  Upload,
  ImageIcon,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
];

interface OrgFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  timezone: string;
}

const emptyOrg: OrgFormData = {
  name: "",
  email: "",
  phone: "",
  address: "",
  website: "",
  timezone: "America/New_York",
};

export default function SettingsPage() {
  const [form, setForm] = useState<OrgFormData>(emptyOrg);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [calCopied, setCalCopied] = useState(false);

  const [showPrices, setShowPrices] = useState(true);
  const [showStaffSelection, setShowStaffSelection] = useState(true);
  const [requirePayment, setRequirePayment] = useState(false);

  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [sendReminder, setSendReminder] = useState(true);
  const [sendFollowUp, setSendFollowUp] = useState(false);

  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: org, isLoading } = trpc.organization.getCurrent.useQuery();
  const updateMutation = trpc.organization.update.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  useEffect(() => {
    if (!org) return;
    setForm({
      name: org.name ?? "",
      email: org.email ?? "",
      phone: org.phone ?? "",
      address: org.address ?? "",
      website: org.website ?? "",
      timezone: org.timezone ?? "America/New_York",
    });
    if (org.logoUrl) setLogoUrl(org.logoUrl);
    const s = org.settings as Record<string, unknown> | undefined;
    if (s) {
      if (typeof s.showPrices === "boolean") setShowPrices(s.showPrices);
      if (typeof s.showStaffSelection === "boolean") setShowStaffSelection(s.showStaffSelection);
      if (typeof s.requirePayment === "boolean") setRequirePayment(s.requirePayment);
      if (typeof s.sendConfirmation === "boolean") setSendConfirmation(s.sendConfirmation);
      if (typeof s.sendReminder === "boolean") setSendReminder(s.sendReminder);
      if (typeof s.sendFollowUp === "boolean") setSendFollowUp(s.sendFollowUp);
    }
  }, [org]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) setLogoUrl(data.url);
    } catch (err) {
      console.error("Logo upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({
      ...form,
      logoUrl: logoUrl || undefined,
      settings: {
        showPrices,
        showStaffSelection,
        requirePayment,
        sendConfirmation,
        sendReminder,
        sendFollowUp,
      },
    });
  }

  const slug = org?.slug ?? "your-business";
  const bookingUrl = `bookai.com/b/${slug}`;

  function copyLink() {
    navigator.clipboard.writeText(`https://${bookingUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyCalendarLink() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard.writeText(`${origin}/api/calendar?org=${slug}`);
    setCalCopied(true);
    setTimeout(() => setCalCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Configure your business, booking page, notifications, and integrations.
        </p>
      </div>

      <form onSubmit={handleSave} className="mt-8 space-y-8">
        {/* ── Business Info ── */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Business Information</h2>
          </div>

          <div className="mb-5">
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              Logo
            </label>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Business logo"
                  className="h-16 w-16 rounded-xl border border-border object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => logoInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? "Uploading…" : logoUrl ? "Change Logo" : "Upload Logo"}
                </button>
                <p className="mt-1 text-xs text-muted-foreground">
                  JPEG, PNG, GIF, or WebP. Max 5MB.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              icon={<Building2 className="h-4 w-4" />}
              label="Organization Name"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="Acme Barbershop"
              required
            />
            <Field
              icon={<Mail className="h-4 w-4" />}
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              placeholder="hello@acme.com"
            />
            <Field
              icon={<Phone className="h-4 w-4" />}
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
              placeholder="+1 (555) 000-0000"
            />
            <Field
              icon={<Globe className="h-4 w-4" />}
              label="Website"
              type="url"
              value={form.website}
              onChange={(v) => setForm((f) => ({ ...f, website: v }))}
              placeholder="https://acme.com"
            />
            <div className="sm:col-span-2">
              <Field
                icon={<MapPin className="h-4 w-4" />}
                label="Address"
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                placeholder="123 Main St, City, State 12345"
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Timezone
              </label>
              <select
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ── Booking Page ── */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <Link2 className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Booking Page</h2>
          </div>

          <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3">
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-sm font-medium">{bookingUrl}</span>
            <button
              type="button"
              onClick={copyLink}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                copied
                  ? "bg-green-500/10 text-green-600"
                  : "bg-accent text-accent-foreground hover:opacity-90"
              )}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>

          <div className="space-y-4">
            <Toggle
              icon={<Eye className="h-4 w-4" />}
              label="Show Prices"
              description="Display service prices on the booking page"
              checked={showPrices}
              onChange={setShowPrices}
            />
            <Toggle
              icon={<Users className="h-4 w-4" />}
              label="Show Staff Selection"
              description="Let clients choose their preferred staff member"
              checked={showStaffSelection}
              onChange={setShowStaffSelection}
            />
            <Toggle
              icon={<CreditCard className="h-4 w-4" />}
              label="Require Payment"
              description="Clients must pay when booking to confirm their appointment"
              checked={requirePayment}
              onChange={setRequirePayment}
            />
          </div>
        </section>

        {/* ── Notifications ── */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <Bell className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Notification Settings</h2>
          </div>

          <div className="space-y-4">
            <Toggle
              icon={<Mail className="h-4 w-4" />}
              label="Send Confirmation Email"
              description="Email clients immediately after they book an appointment"
              checked={sendConfirmation}
              onChange={setSendConfirmation}
            />
            <Toggle
              icon={<BellRing className="h-4 w-4" />}
              label="Send Reminder (24h Before)"
              description="Automatic reminder email sent 24 hours before the appointment"
              checked={sendReminder}
              onChange={setSendReminder}
            />
            <Toggle
              icon={<MessageSquare className="h-4 w-4" />}
              label="Send Follow-Up"
              description="Follow-up email sent after the appointment for feedback"
              checked={sendFollowUp}
              onChange={setSendFollowUp}
            />
          </div>
        </section>

        {/* ── Public Booking Page ── */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <Link2 className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Public Booking Page</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Share this link with your customers so they can book appointments 24/7. Put it in your Instagram bio, Google listing, email signature, or anywhere.
          </p>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3">
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-sm font-mono">
              {typeof window !== "undefined"
                ? `${window.location.origin}/book/${slug}`
                : `/book/${slug}`}
            </span>
            <button
              type="button"
              onClick={() => {
                const url = typeof window !== "undefined"
                  ? `${window.location.origin}/book/${slug}`
                  : `/book/${slug}`;
                navigator.clipboard.writeText(url);
              }}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <a
              href={`/book/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview booking page
            </a>
          </div>
        </section>

        {/* ── Calendar Integration ── */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <Calendar className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Calendar Integration</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Subscribe to your appointment calendar in Google Calendar, Apple Calendar, or Outlook.
          </p>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-sm font-mono">
              {typeof window !== "undefined"
                ? `${window.location.origin}/api/calendar?org=${slug}`
                : `/api/calendar?org=${slug}`}
            </span>
            <button
              type="button"
              onClick={copyCalendarLink}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                calCopied
                  ? "bg-green-500/10 text-green-600"
                  : "bg-accent text-accent-foreground hover:opacity-90"
              )}
            >
              {calCopied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {calCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Paste this URL into your calendar app&apos;s &quot;Subscribe&quot; feature for automatic sync.
          </p>
        </section>

        {/* ── Google Calendar Two-Way Sync ── */}
        <GoogleCalendarSyncSection />

        {/* ── Save ── */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Settings
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
              <Check className="h-4 w-4" />
              Settings saved successfully
            </span>
          )}
          {updateMutation.isError && (
            <span className="text-sm text-red-500">
              Failed to save. Please try again.
            </span>
          )}
        </div>
      </form>

      {/* ── Data & Privacy ── */}
      <section className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <Download className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold">Data & Privacy</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Export all your business data or request deletion. Your data, your control.
        </p>
        <div className="flex gap-3">
          <a
            href="/api/export"
            download
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            Export All Data (JSON)
          </a>
        </div>
      </section>

      {/* ── Danger Zone ── */}
      <section className="mt-8 rounded-xl border-2 border-red-500/30 bg-card p-6">
        <div className="mb-3 flex items-center gap-2.5">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold text-red-500">Danger Zone</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Permanently delete your organization and all associated data. This action cannot be undone.
        </p>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/20"
        >
          <Trash2 className="h-4 w-4" />
          Delete Organization
        </button>
      </section>
    </div>
  );
}

function GoogleCalendarSyncSection() {
  const { data: syncStatus, isLoading: statusLoading } =
    trpc.calendarSync.getStatus.useQuery();
  const connectMutation = trpc.calendarSync.getConnectUrl.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });
  const disconnectMutation = trpc.calendarSync.disconnect.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="mb-5 flex items-center gap-2.5">
        <RefreshCw className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-semibold">Google Calendar Sync</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Connect your Google Calendar for two-way sync. New appointments appear in Google, and changes in Google sync back.
      </p>

      {statusLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking connection...
        </div>
      ) : syncStatus?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3">
            <Check className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-700">Connected to Google Calendar</p>
              <p className="text-xs text-muted-foreground">
                Sync: {syncStatus.syncDirection === "TWO_WAY"
                  ? "Two-way"
                  : syncStatus.syncDirection === "ONE_WAY_PUSH"
                    ? "Push only"
                    : "Pull only"}
                {syncStatus.lastSyncAt &&
                  ` | Last synced: ${new Date(syncStatus.lastSyncAt).toLocaleString()}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10"
            >
              <Unplug className="h-3.5 w-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => connectMutation.mutate({})}
          disabled={connectMutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {connectMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Calendar className="h-4 w-4" />
          )}
          Connect Google Calendar
        </button>
      )}
    </section>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
      />
    </div>
  );
}

function Toggle({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/50 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
          checked ? "bg-accent" : "bg-border"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}
