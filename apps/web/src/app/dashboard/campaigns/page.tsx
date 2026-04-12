"use client";

import { useState } from "react";
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Play,
  Pause,
  Sparkles,
  Mail,
  MessageSquare,
  Send,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type CampaignType = "BIRTHDAY" | "WINBACK" | "POST_VISIT" | "REBOOK_NUDGE" | "CUSTOM";
type Channel = "EMAIL" | "SMS" | "WHATSAPP";

interface FormData {
  name: string;
  type: CampaignType;
  channel: Channel;
  messageTemplate: string;
  useAi: boolean;
  inactiveDays: number;
}

const emptyForm: FormData = {
  name: "",
  type: "WINBACK",
  channel: "EMAIL",
  messageTemplate: "",
  useAi: true,
  inactiveDays: 90,
};

const CAMPAIGN_TYPES: Array<{ value: CampaignType; label: string; description: string }> = [
  { value: "BIRTHDAY", label: "Birthday", description: "Send on client birthdays" },
  { value: "WINBACK", label: "Win-Back", description: "Re-engage inactive clients" },
  { value: "POST_VISIT", label: "Post-Visit", description: "Thank clients after appointments" },
  { value: "REBOOK_NUDGE", label: "Rebook Nudge", description: "Remind clients to rebook" },
  { value: "CUSTOM", label: "Custom", description: "Custom campaign with your own targeting" },
];

const CHANNEL_ICONS: Record<Channel, typeof Mail> = {
  EMAIL: Mail,
  SMS: MessageSquare,
  WHATSAPP: Send,
};

export default function CampaignsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  const utils = trpc.useUtils();
  const { data: campaigns, isLoading } = trpc.campaign.list.useQuery();

  const createMutation = trpc.campaign.create.useMutation({
    onSuccess: () => {
      utils.campaign.list.invalidate();
      closeForm();
    },
  });

  const updateMutation = trpc.campaign.update.useMutation({
    onSuccess: () => {
      utils.campaign.list.invalidate();
    },
  });

  const deleteMutation = trpc.campaign.delete.useMutation({
    onSuccess: () => {
      utils.campaign.list.invalidate();
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const triggerConfig: Record<string, unknown> = {};
    if (form.type === "WINBACK") triggerConfig.inactiveDays = form.inactiveDays;
    if (form.type === "REBOOK_NUDGE") triggerConfig.daysSinceLastVisit = form.inactiveDays;

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          name: form.name,
          channel: form.channel,
          messageTemplate: form.messageTemplate || undefined,
          useAi: form.useAi,
          triggerConfig,
        },
      });
      closeForm();
    } else {
      createMutation.mutate({
        name: form.name,
        type: form.type,
        channel: form.channel,
        messageTemplate: form.messageTemplate || undefined,
        useAi: form.useAi,
        triggerConfig,
      });
    }
  }

  function toggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    updateMutation.mutate({ id, data: { status: newStatus } });
  }

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Marketing Campaigns</h1>
          <p className="mt-1 text-muted-foreground">
            AI-powered campaigns that send personalized messages to your clients.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit Campaign" : "New Campaign"}
              </h2>
              <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Spring Win-Back Campaign"
                />
              </div>

              {!editingId && (
                <div>
                  <label className="mb-2 block text-sm font-medium">Campaign Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CAMPAIGN_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setForm({ ...form, type: t.value })}
                        className={cn(
                          "rounded-lg border p-3 text-left text-sm transition-colors",
                          form.type === t.value
                            ? "border-accent bg-accent/10"
                            : "border-input hover:bg-muted"
                        )}
                      >
                        <p className="font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">Channel</label>
                <div className="flex gap-2">
                  {(["EMAIL", "SMS", "WHATSAPP"] as Channel[]).map((ch) => {
                    const Icon = CHANNEL_ICONS[ch];
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setForm({ ...form, channel: ch })}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                          form.channel === ch
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-input text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(form.type === "WINBACK" || form.type === "REBOOK_NUDGE") && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    {form.type === "WINBACK" ? "Inactive Days Threshold" : "Days Since Last Visit"}
                  </label>
                  <input
                    type="number"
                    min={7}
                    value={form.inactiveDays}
                    onChange={(e) => setForm({ ...form, inactiveDays: parseInt(e.target.value) || 90 })}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Message Template (optional)
                </label>
                <textarea
                  value={form.messageTemplate}
                  onChange={(e) => setForm({ ...form, messageTemplate: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  rows={3}
                  placeholder={
                    form.useAi
                      ? "Optional guidance for AI. Leave blank for fully AI-generated messages."
                      : "Use {{firstName}}, {{businessName}} as variables"
                  }
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.useAi}
                  onChange={(e) => setForm({ ...form, useAi: e.target.checked })}
                  className="rounded"
                />
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">
                  AI-personalized messages (recommended)
                </span>
              </label>

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
                  {editingId ? "Save" : "Create Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Campaign List */}
      <div className="mt-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !campaigns?.length ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-input py-20">
            <Megaphone className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-medium">No campaigns yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create AI-powered campaigns to engage your clients automatically.
            </p>
            <button
              onClick={openCreate}
              className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Create First Campaign
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const Icon = CHANNEL_ICONS[c.channel as Channel] ?? Mail;
              return (
                <div
                  key={c.id}
                  className="group flex items-center justify-between rounded-xl border border-input bg-card p-5 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full",
                        c.status === "ACTIVE" ? "bg-green-500/10" : "bg-muted"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          c.status === "ACTIVE" ? "text-green-600" : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{c.name}</h3>
                        {c.useAi && (
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" title="AI-personalized" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{c.type.replace("_", " ")}</span>
                        <span>{c.channel}</span>
                        <span>{c._count.executions} sent</span>
                        {c.lastRunAt && (
                          <span>Last run: {new Date(c.lastRunAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        c.status === "ACTIVE"
                          ? "bg-green-100 text-green-700"
                          : c.status === "PAUSED"
                            ? "bg-yellow-100 text-yellow-700"
                            : c.status === "DRAFT"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-blue-100 text-blue-700"
                      )}
                    >
                      {c.status}
                    </span>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => toggleStatus(c.id, c.status)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={c.status === "ACTIVE" ? "Pause" : "Activate"}
                      >
                        {c.status === "ACTIVE" ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate({ id: c.id })}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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
