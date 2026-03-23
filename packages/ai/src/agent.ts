import OpenAI from "openai";
import type { AiContext, AiMessage, ChatUIBlock } from "@bookai/types";
import { buildSystemPrompt } from "./prompts";
import { BUSINESS_FUNCTIONS, CLIENT_FUNCTIONS } from "./functions";
import { executeFunctionCall } from "./executor";
import { detectUIBlocks, KnownContext } from "./ui-blocks";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "placeholder" });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("500") ||
          error.message.includes("502") ||
          error.message.includes("503") ||
          error.message.includes("timeout") ||
          error.message.includes("ECONNRESET") ||
          error.message.includes("fetch failed"));
      if (!isRetryable || attempt === maxRetries) throw error;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error("Unreachable");
}

interface ProcessMessageInput {
  message: string;
  context: AiContext;
  conversationHistory: AiMessage[];
  mode: "business" | "client";
  executionMode?: "execute" | "plan_mutations";
  approvalRequiredFunctions?: string[];
}

interface ProcessMessageResult {
  response: string;
  functionCalls: Array<{ name: string; arguments: string; result: string; data?: unknown }>;
  uiBlocks?: ChatUIBlock[];
}

export async function processMessage(
  input: ProcessMessageInput
): Promise<ProcessMessageResult> {
  const {
    message,
    context,
    conversationHistory,
    mode,
    executionMode = "execute",
    approvalRequiredFunctions,
  } = input;

  const knownCtx: KnownContext = {
    services: context.services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      price: s.price,
    })),
    staffMembers: context.staffMembers.map((s) => ({
      id: s.id,
      name: s.name,
      services: s.services,
    })),
  };

  if (!process.env.OPENAI_API_KEY) {
    return {
      response: getStubResponse(message, context, mode),
      functionCalls: [],
      uiBlocks: [],
    };
  }

  const systemPrompt = buildSystemPrompt(context, mode);
  const functions = mode === "business" ? BUSINESS_FUNCTIONS : CLIENT_FUNCTIONS;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map((m) => ({
      role: (m.role === "assistant" || m.role === "owner" ? "assistant" : "user") as
        | "user"
        | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  const executedCalls: ProcessMessageResult["functionCalls"] = [];
  let maxIterations = 5;

  try {
    while (maxIterations > 0) {
      maxIterations--;

      const completion = await withRetry(() =>
        getOpenAI().chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          tools: functions.map((f) => ({
            type: "function" as const,
            function: f,
          })),
          temperature: 0.7,
          max_tokens: 1000,
        })
      );

      const choice = completion.choices[0];
      const responseMessage = choice.message;

      if (
        !responseMessage.tool_calls ||
        responseMessage.tool_calls.length === 0
      ) {
        const responseText =
          responseMessage.content ?? "I'm not sure how to help with that.";
        const uiBlocks = detectUIBlocks(responseText, executedCalls, knownCtx);
        return {
          response: responseText,
          functionCalls: executedCalls,
          uiBlocks,
        };
      }

      messages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments);
        const mutatingClientActions = new Set([
          "create_appointment",
          "reschedule_appointment",
          "cancel_appointment",
          "confirm_appointment",
        ]);
        const requiredSet =
          approvalRequiredFunctions && approvalRequiredFunctions.length > 0
            ? new Set(approvalRequiredFunctions)
            : null;

        const shouldPlanOnly =
          executionMode === "plan_mutations" &&
          mutatingClientActions.has(fnName) &&
          (requiredSet ? requiredSet.has(fnName) : true);

        const result = shouldPlanOnly
          ? {
              success: true,
              message: "Pending owner approval before this action is executed.",
              data: {
                pendingApproval: true,
                functionName: fnName,
                arguments: fnArgs,
              },
            }
          : await executeFunctionCall(
              fnName,
              fnArgs,
              context.organizationId,
              context.clientId
            );

        executedCalls.push({
          name: fnName,
          arguments: toolCall.function.arguments,
          result: result.message,
          data: result.data,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.message,
        });
      }
    }

    const finalResponse = "I completed the requested actions. Is there anything else?";
    const uiBlocks = detectUIBlocks(finalResponse, executedCalls, knownCtx);
    return {
      response: finalResponse,
      functionCalls: executedCalls,
      uiBlocks,
    };
  } catch (error) {
    console.error("[AI] Processing failed after retries:", error);
    return {
      response:
        "I'm having a bit of trouble right now. Let me connect you with the business owner who can help directly.",
      functionCalls: executedCalls,
      uiBlocks: [],
    };
  }
}

function getStubResponse(
  message: string,
  context: AiContext,
  mode: string
): string {
  const lower = message.toLowerCase();

  if (mode === "business") {
    if (lower.includes("set up") || lower.includes("setup") || lower.includes("get started")) {
      return `Let's get your business set up! I'll need a few things:\n\n1. **What services do you offer?** (e.g., "haircuts for $30, 45 minutes")\n2. **What are your working hours?**\n3. **Do you have any staff members?**\n\nJust describe them naturally and I'll configure everything.\n\n_Note: Connect your OpenAI API key (OPENAI_API_KEY) to enable full AI capabilities._`;
    }
    if (lower.includes("tomorrow") || lower.includes("today") || lower.includes("schedule")) {
      return `To check your schedule, I'll need the database connected. Here's what I can do once everything is wired up:\n\n- Show today's/tomorrow's appointments\n- Search by client name or date\n- Create new bookings\n\n_Set OPENAI_API_KEY in .env to enable full AI._`;
    }
    if (context.services.length === 0) {
      return `Welcome to BookAI! I notice you don't have any services set up yet. Try telling me what you offer, like:\n\n- "I do haircuts for $35, takes about 45 minutes"\n- "Personal training sessions, 60 min, $80"\n- "Group yoga class, 45 min, $25 per person"\n\n_Set OPENAI_API_KEY to enable AI-powered setup._`;
    }
  }

  return `I received your message: "${message}"\n\nTo enable full AI capabilities, add your OpenAI API key to the .env file (OPENAI_API_KEY). The AI can then:\n- Manage services, staff, and schedules\n- Book and reschedule appointments\n- Answer client questions\n- Run your business through conversation`;
}
