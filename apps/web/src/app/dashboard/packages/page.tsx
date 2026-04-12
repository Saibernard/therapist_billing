"use client";

import { useState } from "react";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  X,
  DollarSign,
  Users,
  Loader2,
  CreditCard,
  Repeat,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type PackageType = "VISIT_PACK" | "MEMBERSHIP";

interface PackageFormData {
  name: string;
  description: string;
  type: PackageType;
  price: number;
  totalVisits: number | undefined;
  validDays: number | undefined;
  billingInterval: "monthly" | "yearly" | undefined;
  includedVisits: number | undefined;
}

const emptyForm: PackageFormData = {
  name: "",
  description: "",
  type: "VISIT_PACK",
  price: 0,
  totalVisits: 10,
  validDays: 365,
  billingInterval: undefined,
  includedVisits: undefined,
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
}

export default function PackagesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageFormData>(emptyForm);

  const utils = trpc.useUtils();
  const { data: packages, isLoading } = trpc.package.list.useQuery();

  const createMutation = trpc.package.create.useMutation({
    onSuccess: () => {
      utils.package.list.invalidate();
      closeForm();
    },
  });

  const updateMutation = trpc.package.update.useMutation({
    onSuccess: () => {
      utils.package.list.invalidate();
      closeForm();
    },
  });

  const deleteMutation = trpc.package.delete.useMutation({
    onSuccess: () => {
      utils.package.list.invalidate();
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

  function openEdit(pkg: NonNullable<typeof packages>[number]) {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      description: pkg.description ?? "",
      type: pkg.type as PackageType,
      price: Number(pkg.price),
      totalVisits: pkg.totalVisits ?? undefined,
      validDays: pkg.validDays ?? undefined,
      billingInterval: (pkg.billingInterval as "monthly" | "yearly") ?? undefined,
      includedVisits: pkg.includedVisits ?? undefined,
    });
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || undefined,
      type: form.type,
      price: form.price,
      totalVisits: form.type === "VISIT_PACK" ? form.totalVisits : undefined,
      validDays: form.type === "VISIT_PACK" ? form.validDays : undefined,
      billingInterval: form.type === "MEMBERSHIP" ? form.billingInterval : undefined,
      includedVisits: form.type === "MEMBERSHIP" ? form.includedVisits : undefined,
    };
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          name: payload.name,
          description: payload.description,
          price: payload.price,
          totalVisits: payload.totalVisits,
          validDays: payload.validDays,
        },
      });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Packages & Memberships</h1>
          <p className="mt-1 text-muted-foreground">
            Create visit packs and memberships for your clients.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Package
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit Package" : "New Package"}
              </h2>
              <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="e.g. 10-Session Pack"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>

              {!editingId && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Type</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          type: "VISIT_PACK",
                          totalVisits: 10,
                          validDays: 365,
                          billingInterval: undefined,
                          includedVisits: undefined,
                        })
                      }
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                        form.type === "VISIT_PACK"
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-input text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <CreditCard className="h-4 w-4" />
                      Visit Pack
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          type: "MEMBERSHIP",
                          totalVisits: undefined,
                          validDays: undefined,
                          billingInterval: "monthly",
                          includedVisits: undefined,
                        })
                      }
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                        form.type === "MEMBERSHIP"
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-input text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Repeat className="h-4 w-4" />
                      Membership
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Price {form.type === "MEMBERSHIP" && form.billingInterval ? `(per ${form.billingInterval === "monthly" ? "month" : "year"})` : ""}
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step={0.01}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {form.type === "VISIT_PACK" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Total Visits</label>
                      <input
                        type="number"
                        min={1}
                        value={form.totalVisits ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, totalVisits: parseInt(e.target.value) || undefined })
                        }
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Valid Days</label>
                      <input
                        type="number"
                        min={1}
                        value={form.validDays ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, validDays: parseInt(e.target.value) || undefined })
                        }
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        placeholder="e.g. 365"
                      />
                    </div>
                  </div>
                </>
              )}

              {form.type === "MEMBERSHIP" && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Billing Interval</label>
                    <select
                      value={form.billingInterval ?? "monthly"}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          billingInterval: e.target.value as "monthly" | "yearly",
                        })
                      }
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Included Visits per Period
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.includedVisits ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          includedVisits: parseInt(e.target.value) || undefined,
                        })
                      }
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Leave blank for unlimited"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isMutating || !form.name}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {isMutating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Package"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Package List */}
      <div className="mt-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !packages?.length ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-input py-20">
            <Package className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-medium">No packages yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create visit packs or memberships to offer your clients.
            </p>
            <button
              onClick={openCreate}
              className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Create First Package
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="group relative rounded-xl border border-input bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {pkg.type === "VISIT_PACK" ? (
                      <CreditCard className="h-5 w-5 text-blue-500" />
                    ) : (
                      <Repeat className="h-5 w-5 text-purple-500" />
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        pkg.type === "VISIT_PACK"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-purple-500/10 text-purple-500"
                      )}
                    >
                      {pkg.type === "VISIT_PACK" ? "Visit Pack" : "Membership"}
                    </span>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(pkg)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate({ id: pkg.id })}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-semibold">{pkg.name}</h3>
                {pkg.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{pkg.description}</p>
                )}

                <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    {formatPrice(Number(pkg.price))}
                    {pkg.type === "MEMBERSHIP" && pkg.billingInterval && (
                      <span>/{pkg.billingInterval === "monthly" ? "mo" : "yr"}</span>
                    )}
                  </span>
                  {pkg.type === "VISIT_PACK" && pkg.totalVisits && (
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {pkg.totalVisits} visits
                    </span>
                  )}
                  {pkg.type === "MEMBERSHIP" && pkg.includedVisits && (
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {pkg.includedVisits}/period
                    </span>
                  )}
                </div>

                {pkg.validDays && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Valid for {pkg.validDays} days
                  </p>
                )}

                <div className="mt-3 border-t border-input pt-3">
                  <p className="text-xs text-muted-foreground">
                    {pkg._count.clientPackages} active client{pkg._count.clientPackages !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
