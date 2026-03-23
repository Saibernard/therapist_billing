"use client";

export function sendToAiChat(message: string) {
  window.dispatchEvent(
    new CustomEvent("ai-chat-send", { detail: { message } })
  );
}

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Sparkles,
  User,
  Loader2,
  Calendar,
  Ban,
  UserPlus,
  Scissors,
  Check,
  Undo2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { ChatUIBlocks } from "./chat-ui-blocks";

interface UIBlock {
  type: string;
  prompt: string;
  options: Array<{
    id: string;
    label: string;
    subtitle?: string;
    metadata?: Record<string, string>;
  }>;
}

interface FunctionCall {
  name: string;
  result: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  displayContent?: string;
  selectionType?: string;
  timestamp: Date;
  functionCalls?: FunctionCall[];
  uiBlocks?: UIBlock[];
  uiBlocksHandled?: boolean;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  create_appointment: <Calendar className="h-3.5 w-3.5 text-blue-500" />,
  cancel_appointment: <Ban className="h-3.5 w-3.5 text-red-500" />,
  reschedule_appointment: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  create_service: <Scissors className="h-3.5 w-3.5 text-violet-500" />,
  create_staff: <UserPlus className="h-3.5 w-3.5 text-teal-500" />,
  block_time: <Ban className="h-3.5 w-3.5 text-red-500" />,
  add_extra_availability: <Calendar className="h-3.5 w-3.5 text-emerald-500" />,
  update_staff_schedule: <Clock className="h-3.5 w-3.5 text-blue-500" />,
  escalate_to_human: <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />,
};

const ACTION_LABELS: Record<string, string> = {
  create_appointment: "Booked appointment",
  cancel_appointment: "Cancelled appointment",
  reschedule_appointment: "Rescheduled appointment",
  create_service: "Created service",
  create_staff: "Added staff member",
  create_client: "Added client",
  block_time: "Blocked time",
  add_extra_availability: "Added extra availability",
  remove_override: "Removed schedule override",
  update_staff_schedule: "Updated schedule",
  update_staff_services: "Updated staff services",
  search_availability: "Searched availability",
  get_staff_availability: "Checked availability",
  search_clients: "Searched clients",
  escalate_to_human: "Escalated to you",
};

const LIVE_MUTATION_CALLS = new Set([
  "create_service",
  "create_staff",
  "update_staff_services",
  "update_staff_schedule",
  "block_time",
  "add_extra_availability",
  "remove_override",
  "create_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "confirm_appointment",
]);

export function AiChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        'Hi! I\'m your AI assistant. I can help you manage your schedule, book appointments, set up services, and more. Try saying **"Set up my business"** or **"Who\'s coming in today?"**',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const utils = trpc.useUtils();

  const invalidateLiveData = useCallback(async () => {
    await Promise.allSettled([
      utils.organization.getCurrent.invalidate(),
      utils.organization.dashboardStats.invalidate(),
      utils.organization.morningBriefing.invalidate(),
      utils.appointment.list.invalidate(),
      utils.staff.list.invalidate(),
      utils.staff.getById.invalidate(),
      utils.staff.getAvailabilityGrid.invalidate(),
      utils.staff.getOverridesForRange.invalidate(),
      utils.client.list.invalidate(),
      utils.client.getById.invalidate(),
      utils.service.list.invalidate(),
      utils.analytics.dashboard.invalidate(),
      utils.analytics.upcomingAppointments.invalidate(),
      utils.waitlist.list.invalidate(),
      utils.review.list.invalidate(),
      utils.review.getStats.invalidate(),
    ]);
  }, [utils]);

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess(data) {
      setConversationId(data.conversationId);
      const assistantMsg: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        functionCalls: data.functionCalls?.map((fc) => ({
          name: fc.name,
          result: fc.result ?? "",
        })),
        uiBlocks: data.uiBlocks as UIBlock[] | undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const fnNames = data.functionCalls?.map((fc) => fc.name) ?? [];
      const hasMutation = fnNames.some((name) => LIVE_MUTATION_CALLS.has(name));
      if (hasMutation) {
        void invalidateLiveData();
      }
    },
    onError(error) {
      const errMsg: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message}. Make sure you're logged in and your AI key is configured.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    function onChatEvent(e: Event) {
      const detail = (e as CustomEvent<{ message: string; displayText?: string }>).detail;
      if (detail?.message) {
        handleSendRef.current?.(detail.message, detail.displayText);
      }
    }
    window.addEventListener("ai-chat-send", onChatEvent);
    return () => window.removeEventListener("ai-chat-send", onChatEvent);
  }, []);

  const handleSendRef = useRef<((text: string, displayText?: string, selType?: string) => void) | null>(null);

  const handleSend = useCallback(
    (text?: string, displayText?: string, selType?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || chatMutation.isPending) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: msg,
        displayContent: displayText || undefined,
        selectionType: selType || undefined,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      if (!text) setInput("");

      chatMutation.mutate({
        message: msg,
        conversationId: conversationId ?? undefined,
      });
    },
    [input, chatMutation, conversationId]
  );

  handleSendRef.current = handleSend;

  const handleUIBlockSelect = useCallback(
    (messageId: string, blockType: string, option: { id: string; label: string; subtitle?: string; metadata?: Record<string, string> }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, uiBlocksHandled: true } : m
        )
      );

      let aiText = "";
      let displayText = "";
      let selType = "";

      switch (blockType) {
        case "staff_selector":
          aiText = `Selected staff: ${option.label} [staffMemberId: ${option.metadata?.staffMemberId || option.id}]`;
          displayText = option.label;
          selType = "staff";
          break;
        case "service_selector":
          if (option.metadata?.action === "multi_service_select") {
            aiText = `Assign these services: ${option.label}`;
            displayText = option.label;
            selType = "services";
          } else {
            aiText = `Selected service: ${option.label} [serviceId: ${option.id}]`;
            displayText = `${option.label}${option.metadata?.price ? ` · ${option.metadata.price}` : ""}`;
            selType = "service";
          }
          break;
        case "time_selector": {
          const parts = option.id.split("|");
          const time = parts[0] || option.label;
          aiText = `Selected time: ${time}${parts[1] ? ` [staffMemberId: ${parts[1]}]` : ""}`;
          displayText = `${time}${option.subtitle ? ` ${option.subtitle}` : ""}`;
          selType = "time";
          break;
        }
        case "client_selector":
          aiText = `Selected client: ${option.label} [clientId: ${option.id}]`;
          displayText = option.label;
          selType = "client";
          break;
        case "confirm_action":
          if (option.metadata?.action === "new_client") {
            aiText = "It's a new client — I'll provide their details";
            displayText = "New client";
            selType = "action";
          } else if (option.metadata?.action === "search_client") {
            aiText = "Search my existing clients";
            displayText = "Search existing clients";
            selType = "action";
          } else {
            aiText = option.metadata?.action === "confirm" ? "Yes, go ahead" : "No, cancel that";
            displayText = aiText;
            selType = "action";
          }
          break;
        case "action_buttons": {
          const action = option.metadata?.action;
          if (action === "reschedule" && option.metadata?.appointmentId) {
            aiText = `Reschedule appointment ${option.metadata.appointmentId}`;
          } else if (action === "cancel" && option.metadata?.appointmentId) {
            aiText = `Cancel appointment ${option.metadata.appointmentId}`;
          } else if (action === "book_another" || action === "rebook") {
            aiText = "I'd like to book another appointment";
          } else {
            aiText = option.label;
          }
          displayText = option.label;
          selType = "action";
          break;
        }
        default:
          aiText = option.label;
          displayText = option.label;
      }

      handleSend(aiText, displayText, selType);
    },
    [handleSend]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-5 w-5 text-accent" />
        <h2 className="text-sm font-semibold">AI Assistant</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {chatMutation.isPending ? "Thinking..." : "Ready"}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {msg.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent">
                <Sparkles className="h-4 w-4 text-accent-foreground" />
              </div>
            )}
            <div className="max-w-[85%] space-y-2">
              {msg.role === "user" && msg.selectionType ? (
                <SelectionPill
                  type={msg.selectionType}
                  label={msg.displayContent || msg.content}
                />
              ) : (
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {msg.role === "assistant"
                    ? cleanAssistantText(msg.content)
                    : (msg.displayContent || cleanUserText(msg.content))}
                </div>
              )}

              {/* Action preview cards */}
              {msg.functionCalls && msg.functionCalls.length > 0 && (
                <div className="space-y-1.5">
                  {msg.functionCalls.map((fc, i) => (
                    <ActionCard key={i} fc={fc} onUndo={handleSend} />
                  ))}
                </div>
              )}

              {msg.uiBlocks && msg.uiBlocks.length > 0 && (
                <ChatUIBlocks
                  blocks={msg.uiBlocks}
                  onSelect={(blockType, option) =>
                    handleUIBlockSelect(msg.id, blockType, option)
                  }
                  disabled={msg.uiBlocksHandled || chatMutation.isPending}
                />
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent">
              <Sparkles className="h-4 w-4 text-accent-foreground" />
            </div>
            <div className="rounded-2xl bg-muted px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 focus-within:border-accent">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Try "Set up my business" or "Book Sarah in for a haircut on Friday"'
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || chatMutation.isPending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function cleanUserText(text: string): string {
  return text
    .replace(/\s*\[(?:serviceId|staffMemberId|clientId|id):\s*[^\]]+\]/g, "")
    .replace(/\s*with staffMemberId\s+\S+/g, "")
    .trim();
}

function cleanAssistantText(text: string): string {
  return text
    .replace(/\[(?:id|serviceId|staffMemberId|clientId):\s*[^\]]+\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const SELECTION_ICONS: Record<string, React.ReactNode> = {
  service: <Scissors className="h-3 w-3" />,
  services: <Scissors className="h-3 w-3" />,
  staff: <User className="h-3 w-3" />,
  time: <Clock className="h-3 w-3" />,
  client: <UserPlus className="h-3 w-3" />,
  action: <Check className="h-3 w-3" />,
};

const SELECTION_LABELS: Record<string, string> = {
  service: "Service",
  services: "Services",
  staff: "Staff",
  time: "Time",
  client: "Client",
  action: "",
};

function SelectionPill({ type, label }: { type: string; label: string }) {
  const icon = SELECTION_ICONS[type];
  const prefix = SELECTION_LABELS[type];

  return (
    <div className="flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">
      {icon && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-foreground/20">
          {icon}
        </span>
      )}
      <span>
        {prefix && <span className="text-accent-foreground/70 text-xs mr-1">{prefix}:</span>}
        <span className="font-medium">{label}</span>
      </span>
    </div>
  );
}

function ActionCard({
  fc,
  onUndo,
}: {
  fc: FunctionCall;
  onUndo: (text: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(true);
  const icon = ACTION_ICONS[fc.name];
  const label = ACTION_LABELS[fc.name] ?? fc.name.replace(/_/g, " ");
  const isDestructive = fc.name === "cancel_appointment" || fc.name === "block_time";
  const isUndoable = fc.name === "create_appointment" || fc.name === "cancel_appointment" || fc.name === "block_time";

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-xs transition-all",
        confirmed
          ? isDestructive
            ? "border-red-200 bg-red-50/50"
            : "border-emerald-200 bg-emerald-50/50"
          : "border-border bg-muted opacity-50"
      )}
    >
      <div className="flex items-center gap-2">
        {icon ?? <Check className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-medium text-foreground">{label}</span>
        <Check className="ml-auto h-3.5 w-3.5 text-emerald-500" />
      </div>
      {fc.result && (
        <p className="mt-1 text-muted-foreground leading-relaxed">
          {(() => {
            const clean = fc.result
              .replace(/\[(?:id|serviceId|staffMemberId|clientId):\s*[^\]]+\]/g, "")
              .replace(/\s{2,}/g, " ")
              .trim();
            return clean.length > 150 ? clean.substring(0, 150) + "…" : clean;
          })()}
        </p>
      )}
      {isUndoable && confirmed && (
        <button
          onClick={() => {
            setConfirmed(false);
            if (fc.name === "create_appointment") {
              onUndo("Undo that — cancel the last booking I just made");
            } else if (fc.name === "cancel_appointment") {
              onUndo("Undo that — rebook the appointment I just cancelled");
            } else if (fc.name === "block_time") {
              onUndo("Undo that — remove the time block I just created");
            }
          }}
          className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Undo2 className="h-3 w-3" />
          Undo this action
        </button>
      )}
    </div>
  );
}
