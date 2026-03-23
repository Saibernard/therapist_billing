"use client";

import { useState } from "react";
import {
  User,
  Clock,
  Briefcase,
  Users,
  Check,
  X,
  ArrowRight,
  Calendar,
  RefreshCw,
  Ban,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatUIOption {
  id: string;
  label: string;
  subtitle?: string;
  metadata?: Record<string, string>;
}

interface ChatUIBlock {
  type: string;
  prompt: string;
  options: ChatUIOption[];
  context?: Record<string, string>;
}

interface ChatUIBlocksProps {
  blocks: ChatUIBlock[];
  onSelect: (blockType: string, option: ChatUIOption) => void;
  disabled?: boolean;
}

export function ChatUIBlocks({ blocks, onSelect, disabled }: ChatUIBlocksProps) {
  return (
    <div className="space-y-3 mt-2">
      {blocks.map((block, i) => (
        <ChatBlock
          key={`${block.type}-${i}`}
          block={block}
          onSelect={(option) => onSelect(block.type, option)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function ChatBlock({
  block,
  onSelect,
  disabled,
}: {
  block: ChatUIBlock;
  onSelect: (option: ChatUIOption) => void;
  disabled?: boolean;
}) {
  switch (block.type) {
    case "staff_selector":
      return <StaffSelector block={block} onSelect={onSelect} disabled={disabled} />;
    case "service_selector":
      return <ServiceSelector block={block} onSelect={onSelect} disabled={disabled} />;
    case "time_selector":
      return <TimeSelector block={block} onSelect={onSelect} disabled={disabled} />;
    case "client_selector":
      return <ClientSelector block={block} onSelect={onSelect} disabled={disabled} />;
    case "confirm_action":
      return <ConfirmAction block={block} onSelect={onSelect} disabled={disabled} />;
    case "action_buttons":
      return <ActionButtons block={block} onSelect={onSelect} disabled={disabled} />;
    default:
      return null;
  }
}

// ─── Staff Selector ───────────────────────────────────────

function StaffSelector({
  block,
  onSelect,
  disabled,
}: {
  block: ChatUIBlock;
  onSelect: (option: ChatUIOption) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (option: ChatUIOption) => {
    if (disabled || selected) return;
    setSelected(option.id);
    onSelect(option);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {block.prompt && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border bg-muted/50">
          <Users className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-medium">{block.prompt}</span>
        </div>
      )}
      <div className="p-2 space-y-1.5">
        {block.options.map((option) => {
          const isSelected = selected === option.id;
          const isDisabled = disabled || (selected !== null && !isSelected);

          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option)}
              disabled={isDisabled}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                isSelected
                  ? "bg-accent text-accent-foreground ring-2 ring-accent"
                  : isDisabled
                    ? "opacity-40 cursor-not-allowed bg-muted"
                    : "hover:bg-muted/80 cursor-pointer border border-transparent hover:border-border"
              )}
            >
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                isSelected ? "bg-accent-foreground/20 text-accent-foreground" : "bg-accent/10 text-accent"
              )}>
                {option.label.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{option.label}</div>
                {option.subtitle && (
                  <div className="text-xs text-muted-foreground truncate">{option.subtitle}</div>
                )}
              </div>
              {isSelected ? (
                <Check className="h-4 w-4 shrink-0 text-accent-foreground" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Service Selector ─────────────────────────────────────

function ServiceSelector({
  block,
  onSelect,
  disabled,
}: {
  block: ChatUIBlock;
  onSelect: (option: ChatUIOption) => void;
  disabled?: boolean;
}) {
  const isMulti = block.prompt?.toLowerCase().includes("services");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = (option: ChatUIOption) => {
    if (disabled || submitted) return;
    if (isMulti) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(option.id)) next.delete(option.id);
        else next.add(option.id);
        return next;
      });
    } else {
      setSelected(new Set([option.id]));
      setSubmitted(true);
      onSelect(option);
    }
  };

  const handleSubmitMulti = () => {
    if (selected.size === 0 || submitted) return;
    setSubmitted(true);
    const selectedLabels = block.options
      .filter((o) => selected.has(o.id))
      .map((o) => o.label);
    onSelect({
      id: Array.from(selected).join(","),
      label: selectedLabels.join(", "),
      metadata: { action: "multi_service_select", ids: Array.from(selected).join(",") },
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {block.prompt && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border bg-muted/50">
          <Briefcase className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-medium">{block.prompt}</span>
          {isMulti && !submitted && (
            <span className="ml-auto text-[10px] text-muted-foreground">Select multiple</span>
          )}
        </div>
      )}
      <div className="p-2 space-y-1.5">
        {block.options.map((option) => {
          const isSelected = selected.has(option.id);
          const isDisabled = disabled || (submitted && !isSelected);

          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option)}
              disabled={isDisabled}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                isSelected
                  ? "bg-accent text-accent-foreground ring-2 ring-accent"
                  : isDisabled
                    ? "opacity-40 cursor-not-allowed bg-muted"
                    : "hover:bg-muted/80 cursor-pointer border border-transparent hover:border-border"
              )}
            >
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                isSelected ? "bg-accent-foreground/20" : "bg-accent/10"
              )}>
                {isMulti ? (
                  <div className={cn(
                    "h-4 w-4 rounded border-2 flex items-center justify-center",
                    isSelected ? "border-accent-foreground bg-accent-foreground/20" : "border-muted-foreground/40"
                  )}>
                    {isSelected && <Check className="h-3 w-3 text-accent-foreground" />}
                  </div>
                ) : (
                  <Briefcase className={cn("h-4 w-4", isSelected ? "text-accent-foreground" : "text-accent")} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{option.label}</div>
                {(option.subtitle || option.metadata?.price) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {option.subtitle && <span>{option.subtitle}</span>}
                    {option.metadata?.price && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="font-medium">{option.metadata.price}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              {!isMulti && isSelected && <Check className="h-4 w-4 shrink-0 text-accent-foreground" />}
            </button>
          );
        })}
      </div>
      {isMulti && !submitted && selected.size > 0 && (
        <div className="border-t border-border px-3 py-2">
          <button
            onClick={handleSubmitMulti}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            <Check className="h-4 w-4" />
            Confirm {selected.size} service{selected.size > 1 ? "s" : ""}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Time Selector ────────────────────────────────────────

function TimeSelector({
  block,
  onSelect,
  disabled,
}: {
  block: ChatUIBlock;
  onSelect: (option: ChatUIOption) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (option: ChatUIOption) => {
    if (disabled || selected) return;
    setSelected(option.id);
    onSelect(option);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {block.prompt && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border bg-muted/50">
          <Clock className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-medium">{block.prompt}</span>
        </div>
      )}
      <div className="p-2.5 flex flex-wrap gap-2">
        {block.options.map((option) => {
          const isSelected = selected === option.id;
          const isDisabled = disabled || (selected !== null && !isSelected);

          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option)}
              disabled={isDisabled}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-all",
                isSelected
                  ? "bg-accent text-accent-foreground ring-2 ring-accent shadow-sm"
                  : isDisabled
                    ? "opacity-30 cursor-not-allowed bg-muted text-muted-foreground"
                    : "bg-muted hover:bg-accent/10 hover:text-accent cursor-pointer border border-transparent hover:border-accent/30"
              )}
            >
              <div className="text-center">
                <div>{option.label}</div>
                {option.subtitle && (
                  <div className="text-[10px] opacity-70 mt-0.5">{option.subtitle}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Client Selector ──────────────────────────────────────

function ClientSelector({
  block,
  onSelect,
  disabled,
}: {
  block: ChatUIBlock;
  onSelect: (option: ChatUIOption) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (option: ChatUIOption) => {
    if (disabled || selected) return;
    setSelected(option.id);
    onSelect(option);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {block.prompt && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border bg-muted/50">
          <User className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-medium">{block.prompt}</span>
        </div>
      )}
      <div className="p-2 space-y-1.5">
        {block.options.map((option) => {
          const isSelected = selected === option.id;
          const isDisabled = disabled || (selected !== null && !isSelected);

          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option)}
              disabled={isDisabled}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                isSelected
                  ? "bg-accent text-accent-foreground ring-2 ring-accent"
                  : isDisabled
                    ? "opacity-40 cursor-not-allowed bg-muted"
                    : "hover:bg-muted/80 cursor-pointer border border-transparent hover:border-border"
              )}
            >
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                isSelected ? "bg-accent-foreground/20 text-accent-foreground" : "bg-blue-100 text-blue-600"
              )}>
                {option.label.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{option.label}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {option.subtitle && <span className="truncate">{option.subtitle}</span>}
                  {option.metadata?.visits && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{option.metadata.visits} visits</span>
                    </>
                  )}
                </div>
              </div>
              {isSelected && <Check className="h-4 w-4 shrink-0 text-accent-foreground" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Confirm Action ───────────────────────────────────────

function ConfirmAction({
  block,
  onSelect,
  disabled,
}: {
  block: ChatUIBlock;
  onSelect: (option: ChatUIOption) => void;
  disabled?: boolean;
}) {
  const [answered, setAnswered] = useState(false);

  const handleSelect = (option: ChatUIOption) => {
    if (disabled || answered) return;
    setAnswered(true);
    onSelect(option);
  };

  const yesOption = block.options.find((o) => o.metadata?.action === "confirm") ?? block.options[0];
  const noOption = block.options.find((o) => o.metadata?.action === "cancel") ?? block.options[1];

  return (
    <div className="flex items-center gap-2 mt-1">
      <button
        onClick={() => handleSelect(yesOption)}
        disabled={disabled || answered}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
          answered
            ? "opacity-50 cursor-not-allowed bg-green-100 text-green-700"
            : "bg-green-500 text-white hover:bg-green-600 cursor-pointer shadow-sm"
        )}
      >
        <Check className="h-3.5 w-3.5" />
        {yesOption?.label || "Yes, go ahead"}
      </button>
      {noOption && (
        <button
          onClick={() => handleSelect(noOption)}
          disabled={disabled || answered}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
            answered
              ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-muted hover:bg-red-50 hover:text-red-600 cursor-pointer border border-border"
          )}
        >
          <X className="h-3.5 w-3.5" />
          {noOption.label || "No, cancel"}
        </button>
      )}
    </div>
  );
}

// ─── Action Buttons ───────────────────────────────────────

function ActionButtons({
  block,
  onSelect,
  disabled,
}: {
  block: ChatUIBlock;
  onSelect: (option: ChatUIOption) => void;
  disabled?: boolean;
}) {
  const [clicked, setClicked] = useState<string | null>(null);

  const handleSelect = (option: ChatUIOption) => {
    if (disabled || clicked) return;
    setClicked(option.id);
    onSelect(option);
  };

  const getIcon = (action?: string) => {
    switch (action) {
      case "reschedule": return <RefreshCw className="h-3.5 w-3.5" />;
      case "cancel": return <Ban className="h-3.5 w-3.5" />;
      case "book_another": return <Plus className="h-3.5 w-3.5" />;
      case "rebook": return <Calendar className="h-3.5 w-3.5" />;
      default: return <ArrowRight className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      {block.options.map((option) => {
        const isClicked = clicked === option.id;
        const isDisabled = disabled || (clicked !== null && !isClicked);

        return (
          <button
            key={option.id}
            onClick={() => handleSelect(option)}
            disabled={isDisabled}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              isClicked
                ? "bg-accent text-accent-foreground"
                : isDisabled
                  ? "opacity-30 cursor-not-allowed bg-muted"
                  : "bg-muted hover:bg-accent/10 hover:text-accent cursor-pointer border border-border"
            )}
          >
            {getIcon(option.metadata?.action)}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
