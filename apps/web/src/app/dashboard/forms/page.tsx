"use client";

import { useState } from "react";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  X,
  GripVertical,
  Loader2,
  FileSignature,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface IntakeField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

const FIELD_TYPES = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Multiple Choice" },
  { value: "checkbox", label: "Checkbox" },
  { value: "signature", label: "Signature" },
];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

const defaultField: () => IntakeField = () => ({
  id: generateId(),
  type: "text",
  label: "",
  required: false,
});

interface FormBuilderData {
  name: string;
  description: string;
  requireSignature: boolean;
  fields: IntakeField[];
  serviceIds: string[];
}

const emptyForm: FormBuilderData = {
  name: "",
  description: "",
  requireSignature: false,
  fields: [defaultField()],
  serviceIds: [],
};

export default function IntakeFormsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormBuilderData>(emptyForm);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: forms, isLoading } = trpc.intakeForm.list.useQuery();
  const { data: services } = trpc.service.list.useQuery();
  const { data: viewingForm } = trpc.intakeForm.getById.useQuery(
    { id: viewingId! },
    { enabled: !!viewingId }
  );

  const createMutation = trpc.intakeForm.create.useMutation({
    onSuccess: () => {
      utils.intakeForm.list.invalidate();
      closeForm();
    },
  });

  const updateMutation = trpc.intakeForm.update.useMutation({
    onSuccess: () => {
      utils.intakeForm.list.invalidate();
      closeForm();
    },
  });

  const deleteMutation = trpc.intakeForm.delete.useMutation({
    onSuccess: () => {
      utils.intakeForm.list.invalidate();
    },
  });

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, fields: [defaultField()] });
    setShowForm(true);
  }

  function openEdit(f: NonNullable<typeof forms>[number]) {
    setEditingId(f.id);
    const fields = Array.isArray(f.fields) ? (f.fields as unknown as IntakeField[]) : [];
    setForm({
      name: f.name,
      description: f.description ?? "",
      requireSignature: f.requireSignature,
      fields: fields.length > 0 ? fields : [defaultField()],
      serviceIds: f.serviceLinks.map((l) => l.serviceId),
    });
    setShowForm(true);
  }

  function addField() {
    setForm({ ...form, fields: [...form.fields, defaultField()] });
  }

  function removeField(idx: number) {
    if (form.fields.length <= 1) return;
    setForm({ ...form, fields: form.fields.filter((_, i) => i !== idx) });
  }

  function updateField(idx: number, updates: Partial<IntakeField>) {
    const fields = [...form.fields];
    fields[idx] = { ...fields[idx], ...updates };
    setForm({ ...form, fields });
  }

  function moveField(idx: number, direction: "up" | "down") {
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= form.fields.length) return;
    const fields = [...form.fields];
    [fields[idx], fields[newIdx]] = [fields[newIdx], fields[idx]];
    setForm({ ...form, fields });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validFields = form.fields.filter((f) => f.label.trim());
    if (validFields.length === 0) return;

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          name: form.name,
          description: form.description || undefined,
          requireSignature: form.requireSignature,
          fields: validFields,
          serviceIds: form.serviceIds,
        },
      });
    } else {
      createMutation.mutate({
        name: form.name,
        description: form.description || undefined,
        requireSignature: form.requireSignature,
        fields: validFields,
        serviceIds: form.serviceIds,
      });
    }
  }

  function toggleService(serviceId: string) {
    setForm({
      ...form,
      serviceIds: form.serviceIds.includes(serviceId)
        ? form.serviceIds.filter((id) => id !== serviceId)
        : [...form.serviceIds, serviceId],
    });
  }

  const isMutating = createMutation.isPending || updateMutation.isPending;
  const activeForms = forms?.filter((f) => f.isActive) ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Intake Forms & Waivers</h1>
          <p className="mt-1 text-muted-foreground">
            Build forms to collect health history, consent, and other info from clients.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Create Form
        </button>
      </div>

      {/* Form Builder Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit Form" : "New Intake Form"}
              </h2>
              <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Form Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Health History Questionnaire"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Instructions shown to clients"
                />
              </div>

              {/* Fields */}
              <div>
                <label className="mb-2 block text-sm font-medium">Fields</label>
                <div className="space-y-3">
                  {form.fields.map((field, idx) => (
                    <div
                      key={field.id}
                      className="rounded-lg border border-input bg-background p-3"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-0.5 pt-2">
                          <button
                            type="button"
                            onClick={() => moveField(idx, "up")}
                            disabled={idx === 0}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveField(idx, "down")}
                            disabled={idx === form.fields.length - 1}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => updateField(idx, { label: e.target.value })}
                              className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                              placeholder="Field label"
                            />
                            <select
                              value={field.type}
                              onChange={(e) => updateField(idx, { type: e.target.value })}
                              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                            >
                              {FIELD_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {(field.type === "select" || field.type === "radio") && (
                            <input
                              type="text"
                              value={field.options?.join(", ") ?? ""}
                              onChange={(e) =>
                                updateField(idx, {
                                  options: e.target.value.split(",").map((s) => s.trim()),
                                })
                              }
                              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                              placeholder="Options (comma-separated)"
                            />
                          )}
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(e) => updateField(idx, { required: e.target.checked })}
                                className="rounded"
                              />
                              Required
                            </label>
                            <input
                              type="text"
                              value={field.placeholder ?? ""}
                              onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                              className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                              placeholder="Placeholder text (optional)"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeField(idx)}
                          disabled={form.fields.length <= 1}
                          className="pt-1.5 text-muted-foreground hover:text-red-500 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addField}
                  className="mt-2 flex items-center gap-1 text-sm text-accent hover:underline"
                >
                  <Plus className="h-3 w-3" /> Add Field
                </button>
              </div>

              {/* Require Signature */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.requireSignature}
                  onChange={(e) => setForm({ ...form, requireSignature: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm font-medium">Require digital signature</span>
              </label>

              {/* Link to Services */}
              {services && services.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Require for services (optional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {services
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleService(s.id)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            form.serviceIds.includes(s.id)
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-input text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {s.name}
                        </button>
                      ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Clients will be asked to fill this form when booking selected services.
                  </p>
                </div>
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
                  disabled={isMutating || !form.name || !form.fields.some((f) => f.label.trim())}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {isMutating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Form"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submission Viewer Modal */}
      {viewingId && viewingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{viewingForm.name} — Submissions</h2>
              <button
                onClick={() => setViewingId(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {viewingForm.submissions.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No submissions yet.</p>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto">
                {viewingForm.submissions.map((sub) => {
                  const responses =
                    typeof sub.responses === "object" && sub.responses !== null
                      ? (sub.responses as Record<string, unknown>)
                      : {};
                  return (
                    <div key={sub.id} className="rounded-lg border border-input p-3">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {sub.client.firstName} {sub.client.lastName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(sub.submittedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        {Object.entries(responses).map(([key, val]) => (
                          <div key={key} className="flex gap-2">
                            <span className="font-medium text-muted-foreground">{key}:</span>
                            <span>{String(val)}</span>
                          </div>
                        ))}
                      </div>
                      {sub.signedAt && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-green-600">
                          <FileSignature className="h-3 w-3" />
                          Signed {new Date(sub.signedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form List */}
      <div className="mt-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !activeForms.length ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-input py-20">
            <ClipboardList className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-medium">No intake forms yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create forms for health history, consent waivers, and more.
            </p>
            <button
              onClick={openCreate}
              className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Create First Form
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeForms.map((f) => {
              const fields = Array.isArray(f.fields) ? f.fields : [];
              return (
                <div
                  key={f.id}
                  className="group relative rounded-xl border border-input bg-card p-5 transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 text-accent" />
                      {f.requireSignature && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                          Signature Required
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => setViewingId(f.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="View submissions"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openEdit(f)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate({ id: f.id })}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold">{f.name}</h3>
                  {f.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
                  )}

                  <div className="mt-3 text-sm text-muted-foreground">
                    {fields.length} field{fields.length !== 1 ? "s" : ""}
                  </div>

                  {f.serviceLinks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {f.serviceLinks.map((link) => (
                        <span
                          key={link.serviceId}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {link.service.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 border-t border-input pt-3">
                    <p className="text-xs text-muted-foreground">
                      {f._count.submissions} submission{f._count.submissions !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
