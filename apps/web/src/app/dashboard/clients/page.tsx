"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Users,
  Plus,
  Search,
  X,
  Loader2,
  Mail,
  Phone,
  MessageSquare,
  Tag,
  Calendar,
  ChevronRight,
  UserPlus,
  Clock,
  Hash,
  StickyNote,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const CHANNELS = ["EMAIL", "SMS", "WHATSAPP"] as const;
type Channel = (typeof CHANNELS)[number];

interface ClientFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredChannel: Channel;
  tags: string;
  notes: string;
}

const emptyForm: ClientFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  preferredChannel: "EMAIL",
  tags: "",
  notes: "",
};

const CHANNEL_CONFIG: Record<Channel, { icon: typeof Mail; label: string; color: string }> = {
  EMAIL: { icon: Mail, label: "Email", color: "bg-blue-500/10 text-blue-600" },
  SMS: { icon: Phone, label: "SMS", color: "bg-emerald-500/10 text-emerald-600" },
  WHATSAPP: { icon: MessageSquare, label: "WhatsApp", color: "bg-green-500/10 text-green-600" },
};

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-blue-500/10 text-blue-600",
  COMPLETED: "bg-green-500/10 text-green-600",
  CANCELLED: "bg-red-500/10 text-red-500",
  PENDING: "bg-yellow-500/10 text-yellow-600",
  NO_SHOW: "bg-orange-500/10 text-orange-600",
};

function getInitials(firstName: string, lastName?: string | null) {
  return `${firstName[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ClientFormData>(emptyForm);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceRef[0]) clearTimeout(debounceRef[0]);
      debounceRef[0] = setTimeout(() => setDebouncedSearch(value), 300);
    },
    [debounceRef]
  );

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.client.list.useQuery({
    search: debouncedSearch || undefined,
    limit: 50,
  });

  const createMutation = trpc.client.create.useMutation({
    onSuccess: () => {
      utils.client.list.invalidate();
      closeForm();
    },
  });

  const clients = data?.clients ?? [];

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
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    createMutation.mutate({
      firstName: form.firstName,
      lastName: form.lastName || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      preferredChannel: form.preferredChannel,
      tags,
      notes: form.notes || undefined,
      source: "MANUAL",
    });
  }

  const hasSearch = debouncedSearch.length > 0;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="mt-1 text-muted-foreground">
            Your client contacts and booking history.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Client
        </button>
      </div>

      {/* Search Bar */}
      <div className="mt-6">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search clients by name, email, or phone..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">New Client</h2>
            <button
              onClick={closeForm}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  First Name *
                </label>
                <input
                  required
                  maxLength={50}
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, firstName: e.target.value }))
                  }
                  placeholder="Jane"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Last Name
                </label>
                <input
                  maxLength={50}
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lastName: e.target.value }))
                  }
                  placeholder="Doe"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="jane@example.com"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Phone
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Preferred Channel
                </label>
                <select
                  value={form.preferredChannel}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      preferredChannel: e.target.value as Channel,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {CHANNEL_CONFIG[ch].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Tags
                </label>
                <input
                  value={form.tags}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tags: e.target.value }))
                  }
                  placeholder="VIP, Regular, New (comma-separated)"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Notes</label>
              <textarea
                maxLength={2000}
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Any relevant notes about this client..."
                className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
              />
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
                disabled={createMutation.isPending || !form.firstName.trim()}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {createMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Create Client
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

      {/* Client List */}
      {isLoading ? (
        <div className="mt-12 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Loading clients…
          </p>
        </div>
      ) : clients.length === 0 && !hasSearch ? (
        <div className="mt-8 flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
          <Users className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">No clients yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Clients are added automatically when they book, or add them
            manually.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            <UserPlus className="h-4 w-4" />
            Add Your First Client
          </button>
        </div>
      ) : clients.length === 0 && hasSearch ? (
        <div className="mt-8 flex h-48 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
          <Search className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-foreground">No results found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No clients match &ldquo;{debouncedSearch}&rdquo;. Try a different
            search term.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Client
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground md:table-cell">
                  Contact
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground lg:table-cell">
                  Channel
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground lg:table-cell">
                  Tags
                </th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">
                  Visits
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground xl:table-cell">
                  Source
                </th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  isSelected={selectedClientId === client.id}
                  onSelect={() =>
                    setSelectedClientId(
                      selectedClientId === client.id ? null : client.id
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Client Detail Modal */}
      {selectedClientId && (
        <ClientDetailPanel
          clientId={selectedClientId}
          onClose={() => setSelectedClientId(null)}
        />
      )}
    </div>
  );
}

function ClientRow({
  client,
  isSelected,
  onSelect,
}: {
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    preferredChannel: string;
    tags: string[];
    totalVisits: number;
    source: string;
  };
  isSelected: boolean;
  onSelect: () => void;
}) {
  const fullName = [client.firstName, client.lastName].filter(Boolean).join(" ");
  const channel = client.preferredChannel as Channel;
  const config = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.EMAIL;
  const ChannelIcon = config.icon;

  return (
    <tr
      onClick={onSelect}
      className={cn(
        "cursor-pointer transition-colors hover:bg-muted/50",
        isSelected && "bg-muted/70"
      )}
    >
      {/* Client name + avatar */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {getInitials(client.firstName, client.lastName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {fullName}
            </p>
            <p className="truncate text-xs text-muted-foreground md:hidden">
              {client.email || client.phone || "—"}
            </p>
          </div>
        </div>
      </td>

      {/* Contact */}
      <td className="hidden px-4 py-3 md:table-cell">
        <div className="space-y-0.5">
          {client.email && (
            <p className="truncate text-sm text-muted-foreground">
              {client.email}
            </p>
          )}
          {client.phone && (
            <p className="truncate text-xs text-muted-foreground">
              {client.phone}
            </p>
          )}
          {!client.email && !client.phone && (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      </td>

      {/* Channel */}
      <td className="hidden px-4 py-3 lg:table-cell">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            config.color
          )}
        >
          <ChannelIcon className="h-3 w-3" />
          {config.label}
        </span>
      </td>

      {/* Tags */}
      <td className="hidden px-4 py-3 lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {client.tags.length > 0 ? (
            client.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {client.tags.length > 3 && (
            <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              +{client.tags.length - 3}
            </span>
          )}
        </div>
      </td>

      {/* Visits */}
      <td className="hidden px-4 py-3 text-right sm:table-cell">
        <span className="text-sm tabular-nums text-muted-foreground">
          {client.totalVisits}
        </span>
      </td>

      {/* Source */}
      <td className="hidden px-4 py-3 xl:table-cell">
        <span className="text-xs capitalize text-muted-foreground">
          {client.source.toLowerCase().replace("_", " ")}
        </span>
      </td>

      {/* Chevron */}
      <td className="px-4 py-3 text-right">
        <ChevronRight
          className={cn(
            "inline-block h-4 w-4 text-muted-foreground transition-transform",
            isSelected && "rotate-90"
          )}
        />
      </td>
    </tr>
  );
}

function ClientDetailPanel({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const { data: client, isLoading } = trpc.client.getById.useQuery({
    id: clientId,
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-8">
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Loading client details…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!client) return null;

  const fullName = [client.firstName, client.lastName].filter(Boolean).join(" ");
  const channel = client.preferredChannel as Channel;
  const config = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.EMAIL;
  const ChannelIcon = config.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
              {getInitials(client.firstName, client.lastName)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{fullName}</h2>
              <div className="mt-1 flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    config.color
                  )}
                >
                  <ChannelIcon className="h-3 w-3" />
                  {config.label}
                </span>
                <span className="text-xs capitalize text-muted-foreground">
                  {client.source.toLowerCase().replace("_", " ")}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info Grid */}
        <div className="grid gap-4 border-b border-border p-6 sm:grid-cols-2">
          <InfoRow icon={Mail} label="Email" value={client.email || "—"} />
          <InfoRow icon={Phone} label="Phone" value={client.phone || "—"} />
          <InfoRow
            icon={Hash}
            label="Total Visits"
            value={String(client.totalVisits)}
          />
          <InfoRow
            icon={Clock}
            label="Last Visit"
            value={client.lastVisitAt ? formatDate(client.lastVisitAt) : "Never"}
          />
          {client.tags.length > 0 && (
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                <span className="font-medium">Tags</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {client.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          {client.notes && (
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <StickyNote className="h-3.5 w-3.5" />
                <span className="font-medium">Notes</span>
              </div>
              <p className="mt-1.5 text-sm text-foreground">{client.notes}</p>
            </div>
          )}
        </div>

        {/* Appointments */}
        <div className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Calendar className="h-4 w-4" />
            Recent Appointments
          </h3>
          {client.appointments.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border">
              <p className="text-sm text-muted-foreground">
                No appointments yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {client.appointments.map((apt) => (
                <div
                  key={apt.id}
                  className="rounded-lg border border-border p-3.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {apt.service?.name ?? "Unknown Service"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        with{" "}
                        {apt.staffMember
                          ? apt.staffMember.displayName
                          : "—"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        STATUS_STYLES[apt.status] ?? "bg-muted text-muted-foreground"
                      )}
                    >
                      {apt.status.charAt(0) + apt.status.slice(1).toLowerCase().replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-medium">{label}</span>
      </div>
      <p className="mt-0.5 pl-6 text-sm text-foreground">{value}</p>
    </div>
  );
}
