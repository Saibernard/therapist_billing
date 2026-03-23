export const REQUEST_AUTOMATION_FUNCTIONS = [
  "create_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "confirm_appointment",
] as const;

export type RequestAutomationFunction = (typeof REQUEST_AUTOMATION_FUNCTIONS)[number];
export type RequestApprovalMode = "require_approval" | "auto_execute";

export type RequestAutomationPolicy = Record<
  RequestAutomationFunction,
  RequestApprovalMode
>;

export const DEFAULT_REQUEST_AUTOMATION_POLICY: RequestAutomationPolicy = {
  create_appointment: "require_approval",
  reschedule_appointment: "require_approval",
  cancel_appointment: "require_approval",
  confirm_appointment: "require_approval",
};

export function normalizeRequestAutomationPolicy(
  raw: unknown
): RequestAutomationPolicy {
  const partial =
    raw && typeof raw === "object"
      ? (raw as Partial<Record<RequestAutomationFunction, RequestApprovalMode>>)
      : {};

  return {
    create_appointment:
      partial.create_appointment === "auto_execute"
        ? "auto_execute"
        : "require_approval",
    reschedule_appointment:
      partial.reschedule_appointment === "auto_execute"
        ? "auto_execute"
        : "require_approval",
    cancel_appointment:
      partial.cancel_appointment === "auto_execute"
        ? "auto_execute"
        : "require_approval",
    confirm_appointment:
      partial.confirm_appointment === "auto_execute"
        ? "auto_execute"
        : "require_approval",
  };
}
