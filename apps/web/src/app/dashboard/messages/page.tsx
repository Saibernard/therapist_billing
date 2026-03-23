"use client";

import { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Mail,
  Phone,
  Send,
  Sparkles,
  Search,
  Bot,
  User,
  Shield,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

type ChannelFilter = "ALL" | "EMAIL" | "SMS" | "WHATSAPP";

const channelIcon = {
  EMAIL: Mail,
  SMS: Phone,
  WHATSAPP: MessageSquare,
};

const channelColors = {
  EMAIL: "text-blue-500",
  SMS: "text-emerald-500",
  WHATSAPP: "text-green-500",
};

export default function MessagesPage() {
  const [filter, setFilter] = useState<ChannelFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  const { data: conversations, isLoading } = trpc.ai.getConversations.useQuery();

  const { data: selectedConversation, isLoading: isLoadingDetail } =
    trpc.ai.getConversationById.useQuery(
      { id: selectedId! },
      { enabled: !!selectedId, refetchInterval: 5000 }
    );

  const { data: pendingApprovals } = trpc.ai.getPendingApprovals.useQuery(
    { conversationId: selectedId! },
    { enabled: !!selectedId, refetchInterval: 5000 }
  );

  const sendReply = trpc.ai.sendManualReply.useMutation({
    onSuccess: () => {
      setReplyText("");
      utils.ai.getConversationById.invalidate({ id: selectedId! });
      utils.ai.getConversations.invalidate();
    },
  });

  const toggleAi = trpc.ai.toggleAi.useMutation({
    onSuccess: () => {
      utils.ai.getConversationById.invalidate({ id: selectedId! });
      utils.ai.getConversations.invalidate();
    },
  });

  const escalate = trpc.ai.escalate.useMutation({
    onSuccess: () => {
      utils.ai.getConversationById.invalidate({ id: selectedId! });
      utils.ai.getConversations.invalidate();
    },
  });

  const resolve = trpc.ai.resolve.useMutation({
    onSuccess: () => {
      utils.ai.getConversationById.invalidate({ id: selectedId! });
      utils.ai.getConversations.invalidate();
    },
  });

  const resolvePendingApproval = trpc.ai.resolvePendingApproval.useMutation({
    onSuccess: () => {
      if (selectedId) {
        utils.ai.getPendingApprovals.invalidate({ conversationId: selectedId });
        utils.ai.getConversationById.invalidate({ id: selectedId });
      }
      utils.ai.getConversations.invalidate();
      utils.ai.getNotificationCount.invalidate();
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation?.messages]);

  const filtered = conversations?.filter((c) => {
    if (filter !== "ALL" && c.channel !== filter) return false;
    if (search) {
      const clientName = c.client
        ? `${c.client.firstName} ${c.client.lastName ?? ""}`.toLowerCase()
        : "";
      const msgs = c.messages as Array<{ content: string }>;
      const hasMatch =
        clientName.includes(search.toLowerCase()) ||
        msgs.some((m) => m.content?.toLowerCase().includes(search.toLowerCase()));
      if (!hasMatch) return false;
    }
    return true;
  });

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedId) return;
    sendReply.mutate({ conversationId: selectedId, message: replyText.trim() });
  };

  const messages = (selectedConversation?.messages ?? []) as Array<{
    role: string;
    content: string;
    timestamp: string;
    functionCalls?: unknown;
  }>;

  return (
    <div className="flex h-full">
      {/* Left panel: conversation list */}
      <div className="flex w-[380px] flex-shrink-0 flex-col border-r border-border">
        <div className="border-b border-border p-4">
          <h1 className="text-lg font-bold">Messages</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            AI conversations across all channels
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
              {(["ALL", "EMAIL", "SMS", "WHATSAPP"] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setFilter(ch)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    filter === ch
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {ch === "ALL" ? "All" : ch}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="divide-y divide-border">
              {filtered.map((conv) => {
                const rawMsgs = conv.messages;
                const msgs: Array<{ role: string; content: string; timestamp: string }> =
                  typeof rawMsgs === "string" ? JSON.parse(rawMsgs) : (rawMsgs as Array<{ role: string; content: string; timestamp: string }>) ?? [];
                const lastMsg = msgs[msgs.length - 1];
                const Icon =
                  channelIcon[conv.channel as keyof typeof channelIcon] ?? MessageSquare;
                const clientName = conv.client
                  ? `${conv.client.firstName} ${conv.client.lastName ?? ""}`.trim()
                  : "Business Chat";
                const isSelected = conv.id === selectedId;

                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedId(conv.id)}
                    className={cn(
                      "flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50",
                      isSelected && "bg-accent/50"
                    )}
                  >
                    <div className="relative mt-1">
                      <div
                        className={cn(
                          channelColors[conv.channel as keyof typeof channelColors]
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      {conv.status === "ESCALATED" && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {clientName}
                        </span>
                        {conv.status === "ESCALATED" && (
                          <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                            ESCALATED
                          </span>
                        )}
                        {conv.status === "PAUSED" && (
                          <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                            PAUSED
                          </span>
                        )}
                        <span className="ml-auto flex-shrink-0 text-[10px] text-muted-foreground">
                          {new Date(conv.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {lastMsg && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {lastMsg.role === "assistant"
                            ? "AI: "
                            : lastMsg.role === "owner"
                              ? "You: "
                              : ""}
                          {lastMsg.content?.substring(0, 80)}
                        </p>
                      )}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {msgs.length} messages
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center px-4">
              <MessageSquare className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No conversations yet</p>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                Client conversations will appear here when they reply to messages.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel: conversation detail */}
      <div className="flex flex-1 flex-col">
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <Sparkles className="mb-3 h-10 w-10" />
            <p className="font-medium">Select a conversation</p>
            <p className="mt-1 text-sm">
              Choose a conversation from the list to view messages and reply.
            </p>
          </div>
        ) : isLoadingDetail ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : selectedConversation ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {selectedConversation.client
                      ? `${selectedConversation.client.firstName} ${selectedConversation.client.lastName ?? ""}`.trim()
                      : "Business Chat"}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {selectedConversation.channel}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      selectedConversation.status === "ACTIVE"
                        ? "bg-green-100 text-green-700"
                        : selectedConversation.status === "ESCALATED"
                          ? "bg-orange-100 text-orange-700"
                          : selectedConversation.status === "PAUSED"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-muted text-muted-foreground"
                    )}
                  >
                    {selectedConversation.status}
                  </span>
                </div>
              </div>

              <button
                onClick={() =>
                  toggleAi.mutate({
                    conversationId: selectedId!,
                    enabled: !selectedConversation.aiEnabled,
                  })
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  selectedConversation.aiEnabled
                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                disabled={toggleAi.isPending}
              >
                {selectedConversation.aiEnabled ? (
                  <ToggleRight className="h-3.5 w-3.5" />
                ) : (
                  <ToggleLeft className="h-3.5 w-3.5" />
                )}
                AI {selectedConversation.aiEnabled ? "On" : "Off"}
              </button>

              {selectedConversation.status !== "ESCALATED" && (
                <button
                  onClick={() => escalate.mutate({ conversationId: selectedId! })}
                  className="flex items-center gap-1.5 rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-200"
                  disabled={escalate.isPending}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Escalate
                </button>
              )}

              {selectedConversation.status !== "RESOLVED" && (
                <button
                  onClick={() => resolve.mutate({ conversationId: selectedId! })}
                  className="flex items-center gap-1.5 rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-200"
                  disabled={resolve.isPending}
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Resolve
                </button>
              )}
            </div>

            {!!pendingApprovals?.length && (
              <div className="border-b border-orange-200 bg-orange-50 px-4 py-3">
                <div className="mx-auto max-w-2xl space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                    Pending owner approvals
                  </p>
                  {pendingApprovals.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-orange-200 bg-white p-3"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {item.functionName?.replaceAll("_", " ") ?? "Action"}
                      </p>
                      {item.clientMessage && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Client: {item.clientMessage}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() =>
                            resolvePendingApproval.mutate({
                              actionLogId: item.id,
                              decision: "APPROVE",
                            })
                          }
                          disabled={resolvePendingApproval.isPending}
                          className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve & send
                        </button>
                        <button
                          onClick={() =>
                            resolvePendingApproval.mutate({
                              actionLogId: item.id,
                              decision: "REJECT",
                            })
                          }
                          disabled={resolvePendingApproval.isPending}
                          className="rounded-md bg-slate-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages thread */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mx-auto max-w-2xl space-y-3">
                {messages.map((msg, i) => {
                  const isAi = msg.role === "assistant";
                  const isOwner = msg.role === "owner";
                  const isClient = msg.role === "user";

                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex",
                        isClient ? "justify-start" : "justify-end"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2.5",
                          isAi && "bg-blue-100 text-blue-900",
                          isOwner && "bg-purple-100 text-purple-900",
                          isClient && "bg-muted text-foreground"
                        )}
                      >
                        <div className="mb-1 flex items-center gap-1.5">
                          {isAi && <Bot className="h-3 w-3" />}
                          {isOwner && <Shield className="h-3 w-3" />}
                          {isClient && <User className="h-3 w-3" />}
                          <span className="text-[10px] font-medium uppercase opacity-70">
                            {isAi ? "AI Assistant" : isOwner ? "You" : "Client"}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                        <p className="mt-1 text-[10px] opacity-50">
                          {new Date(msg.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Reply input */}
            <div className="border-t border-border p-4">
              <div className="mx-auto flex max-w-2xl items-center gap-2">
                <input
                  type="text"
                  placeholder="Type a reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent placeholder:text-muted-foreground"
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || sendReply.isPending}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
                >
                  {sendReply.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Conversation not found.
          </div>
        )}
      </div>
    </div>
  );
}
