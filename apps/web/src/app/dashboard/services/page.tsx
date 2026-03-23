"use client";

import { useState } from "react";
import {
  Scissors,
  Plus,
  Pencil,
  Trash2,
  X,
  Clock,
  DollarSign,
  Users,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const DEFAULT_COLOR = "#3B82F6";

const PRESET_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#06B6D4",
  "#6366F1",
];

interface ServiceFormData {
  name: string;
  description: string;
  category: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  color: string;
  maxCapacity: number;
}

const emptyForm: ServiceFormData = {
  name: "",
  description: "",
  category: "",
  durationMinutes: 30,
  bufferMinutes: 0,
  price: 0,
  color: DEFAULT_COLOR,
  maxCapacity: 1,
};

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
}

export default function ServicesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormData>(emptyForm);

  const utils = trpc.useUtils();
  const { data: services, isLoading } = trpc.service.list.useQuery();

  const createMutation = trpc.service.create.useMutation({
    onSuccess: () => {
      utils.service.list.invalidate();
      closeForm();
    },
  });

  const updateMutation = trpc.service.update.useMutation({
    onSuccess: () => {
      utils.service.list.invalidate();
      closeForm();
    },
  });

  const deleteMutation = trpc.service.delete.useMutation({
    onSuccess: () => {
      utils.service.list.invalidate();
    },
  });

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(service: NonNullable<typeof services>[number]) {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description ?? "",
      category: service.category ?? "",
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      price: Number(service.price),
      color: service.color,
      maxCapacity: service.maxCapacity,
    });
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      description: form.description || undefined,
      category: form.category || undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isMutating = createMutation.isPending || updateMutation.isPending;
  const activeServices = services?.filter((s) => s.isActive) ?? [];
  const inactiveServices = services?.filter((s) => !s.isActive) ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Services</h1>
          <p className="mt-1 text-muted-foreground">
            Define the services your business offers.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Service
        </button>
      </div>

      {showForm && (
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {editingId ? "Edit Service" : "New Service"}
            </h2>
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
                  Name
                </label>
                <input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. Haircut"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Category
                </label>
                <input
                  maxLength={50}
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  placeholder="e.g. Hair, Nails, Skin"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Description
              </label>
              <textarea
                maxLength={500}
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Brief description of this service"
                className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Duration (min)
                </label>
                <input
                  required
                  type="number"
                  min={5}
                  max={480}
                  value={form.durationMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      durationMinutes: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Buffer (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={form.bufferMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      bufferMinutes: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Price ($)
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: Number(e.target.value) }))
                  }
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Max Capacity
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.maxCapacity}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      maxCapacity: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Color</label>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                      form.color === c
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, color: e.target.value }))
                  }
                  className="ml-1 h-7 w-7 cursor-pointer rounded border-none bg-transparent"
                />
              </div>
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
                disabled={isMutating || !form.name.trim()}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isMutating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingId ? "Save Changes" : "Create Service"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="mt-12 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Loading services…
          </p>
        </div>
      ) : activeServices.length === 0 && inactiveServices.length === 0 ? (
        <div className="mt-8 flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
          <Scissors className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">No services yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try telling the AI: &quot;I offer haircuts for $30, 45
            minutes&quot;
          </p>
        </div>
      ) : (
        <>
          {activeServices.length > 0 && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activeServices.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onEdit={() => openEdit(service)}
                  onDelete={() => deleteMutation.mutate({ id: service.id })}
                  isDeleting={
                    deleteMutation.isPending &&
                    deleteMutation.variables?.id === service.id
                  }
                />
              ))}
            </div>
          )}

          {inactiveServices.length > 0 && (
            <div className="mt-10">
              <h3 className="mb-4 text-sm font-medium text-muted-foreground">
                Inactive ({inactiveServices.length})
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {inactiveServices.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    onEdit={() => openEdit(service)}
                    onDelete={() => deleteMutation.mutate({ id: service.id })}
                    isDeleting={
                      deleteMutation.isPending &&
                      deleteMutation.variables?.id === service.id
                    }
                    inactive
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ServiceCard({
  service,
  onEdit,
  onDelete,
  isDeleting,
  inactive,
}: {
  service: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    durationMinutes: number;
    bufferMinutes: number;
    price: unknown;
    color: string;
    maxCapacity: number;
    isActive: boolean;
  };
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  inactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md",
        inactive && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: service.color }}
          />
          <div>
            <h3 className="font-semibold leading-tight">{service.name}</h3>
            {service.category && (
              <span className="mt-0.5 inline-block text-xs text-muted-foreground">
                {service.category}
              </span>
            )}
          </div>
        </div>

        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            service.isActive
              ? "bg-green-500/10 text-green-600"
              : "bg-muted text-muted-foreground"
          )}
        >
          {service.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {service.description && (
        <p className="mt-2.5 line-clamp-2 text-sm text-muted-foreground">
          {service.description}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(service.durationMinutes)}
          {service.bufferMinutes > 0 && (
            <span className="text-xs">(+{service.bufferMinutes}m buffer)</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <DollarSign className="h-3.5 w-3.5" />
          {formatPrice(Number(service.price))}
        </span>
        {service.maxCapacity > 1 && (
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {service.maxCapacity} max
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-1 border-t border-border pt-3">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
        {service.isActive && (
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Deactivate
          </button>
        )}
      </div>
    </div>
  );
}
