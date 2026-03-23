import type { ChatUIBlock, ChatUIOption } from "@bookai/types";

interface FunctionCallInfo {
  name: string;
  arguments: string;
  result: string;
  data?: unknown;
}

export interface KnownContext {
  services?: Array<{ id: string; name: string; durationMinutes: number; price: number }>;
  staffMembers?: Array<{ id: string; name: string; services: string[] }>;
}

export function detectUIBlocks(
  aiResponse: string,
  functionCalls: FunctionCallInfo[],
  knownContext?: KnownContext
): ChatUIBlock[] {
  const blocks: ChatUIBlock[] = [];

  for (const fc of functionCalls) {
    const data = fc.data;

    switch (fc.name) {
      case "search_availability": {
        const slots = extractSlots(data, fc.result);
        if (slots.length > 0) {
          blocks.push({
            type: "time_selector",
            prompt: "Available time slots:",
            options: slots.map((s) => ({
              id: `${s.startTime}|${s.staffMemberId}|${s.staffName}`,
              label: s.startTime,
              subtitle: `with ${s.staffName}`,
              metadata: {
                endTime: s.endTime,
                staffMemberId: s.staffMemberId,
                staffName: s.staffName,
              },
            })),
          });
        }
        break;
      }

      case "search_clients": {
        const clients = extractClients(data, fc.result);
        if (clients.length > 1) {
          blocks.push({
            type: "client_selector",
            prompt: "Multiple clients found. Which one?",
            options: clients.map((c) => ({
              id: c.id,
              label: `${c.firstName} ${c.lastName || ""}`.trim(),
              subtitle: c.email || c.phone || undefined,
              metadata: {
                visits: String(c.totalVisits ?? 0),
              },
            })),
          });
        }
        break;
      }

      case "create_appointment":
      case "reschedule_appointment":
      case "cancel_appointment":
      case "confirm_appointment": {
        if (fc.result && !fc.result.includes("error") && !fc.result.includes("Could not")) {
          const apptId = extractAppointmentId(data);
          blocks.push({
            type: "action_buttons",
            prompt: "",
            options: getPostActionButtons(fc.name, apptId),
          });
        }
        break;
      }

      case "get_business_info": {
        if (fc.result.includes("Services:")) {
          const services = extractServicesFromText(fc.result);
          if (services.length > 0) {
            blocks.push({
              type: "service_selector",
              prompt: "Available services:",
              options: services,
            });
          }
        }
        break;
      }

      default:
        break;
    }
  }

  if (blocks.length === 0) {
    const responseBlocks = detectFromResponseText(aiResponse, functionCalls, knownContext);
    blocks.push(...responseBlocks);
  }

  return blocks;
}

function detectFromResponseText(
  text: string,
  _functionCalls: FunctionCallInfo[],
  knownContext?: KnownContext
): ChatUIBlock[] {
  const blocks: ChatUIBlock[] = [];
  const lower = text.toLowerCase();

  const isAskingService =
    lower.includes("which service") ||
    lower.includes("what service") ||
    lower.includes("select a service") ||
    lower.includes("choose a service") ||
    lower.includes("available services") ||
    lower.includes("available options") ||
    lower.includes("here are the services") ||
    lower.includes("following services") ||
    lower.includes("offer the following") ||
    lower.includes("services we offer") ||
    lower.includes("list the services") ||
    lower.includes("what services") ||
    (lower.includes("service") && lower.includes("would you like")) ||
    (lower.includes("service") && lower.includes("will") && lower.includes("offer"));

  if (isAskingService) {
    let serviceOptions = extractServicesFromText(text);
    if (serviceOptions.length === 0 && knownContext?.services?.length) {
      serviceOptions = knownContext.services.map((s) => ({
        id: s.id,
        label: s.name,
        subtitle: `${s.durationMinutes} min`,
        metadata: { duration: String(s.durationMinutes), price: `$${s.price}` },
      }));
    }
    if (serviceOptions.length > 0) {
      const isMultiContext =
        lower.includes("assign") ||
        lower.includes("will") && lower.includes("offer") ||
        lower.includes("services they") ||
        lower.includes("services should");
      blocks.push({
        type: "service_selector",
        prompt: isMultiContext ? "Select services:" : "Select a service:",
        options: serviceOptions,
      });
      return blocks;
    }
  }

  const isAskingClient =
    lower.includes("which client") ||
    lower.includes("who is the client") ||
    lower.includes("book this for") ||
    lower.includes("for which client") ||
    lower.includes("client name") ||
    lower.includes("select a client");

  if (isAskingClient && blocks.length === 0) {
    blocks.push({
      type: "confirm_action",
      prompt: "",
      options: [
        { id: "new_client", label: "New client", metadata: { action: "new_client" } },
        { id: "search_client", label: "Search existing clients", metadata: { action: "search_client" } },
      ],
    });
    return blocks;
  }

  const isAskingStaff =
    (lower.includes("which staff") ||
      lower.includes("who should") ||
      lower.includes("which team member") ||
      lower.includes("select a staff") ||
      lower.includes("choose a staff") ||
      lower.includes("pick a staff") ||
      lower.includes("with another staff")) &&
    !lower.includes("[staffmemberid:");

  if (isAskingStaff) {
    let staffOptions = extractStaffFromText(text);
    if (staffOptions.length === 0 && knownContext?.staffMembers?.length) {
      staffOptions = knownContext.staffMembers.map((s) => ({
        id: s.id,
        label: s.name,
        subtitle: s.services.length > 0 ? s.services.join(", ") : undefined,
        metadata: { staffMemberId: s.id },
      }));
    }
    if (staffOptions.length > 0) {
      blocks.push({
        type: "staff_selector",
        prompt: "Select a staff member:",
        options: staffOptions,
      });
      return blocks;
    }
  }

  const isAskingConfirm =
    lower.includes("shall i proceed") ||
    lower.includes("should i go ahead") ||
    lower.includes("want me to") ||
    lower.includes("shall i book") ||
    lower.includes("would you like me to book") ||
    lower.includes("would you like me to create") ||
    lower.includes("ready to book") ||
    lower.includes("confirm this");

  if (isAskingConfirm && blocks.length === 0) {
    blocks.push({
      type: "confirm_action",
      prompt: "Confirm action?",
      options: [
        { id: "confirm_yes", label: "Yes, go ahead", metadata: { action: "confirm" } },
        { id: "confirm_no", label: "No, cancel", metadata: { action: "cancel" } },
      ],
    });
  }

  return blocks;
}

// --- Data extractors ---

interface SlotData {
  startTime: string;
  endTime: string;
  staffMemberId: string;
  staffName: string;
}

function extractSlots(data: unknown, result: string): SlotData[] {
  if (Array.isArray(data)) {
    return data
      .filter((s) => s.available !== false)
      .slice(0, 12)
      .map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        staffMemberId: s.staffMemberId,
        staffName: s.staffName || "Staff",
      }));
  }

  const slots: SlotData[] = [];
  const lines = result.split("\n");
  for (const line of lines) {
    const match = line.match(/^- (\d{1,2}:\d{2})\s+with\s+(.+)$/);
    if (match) {
      slots.push({
        startTime: match[1],
        endTime: "",
        staffMemberId: "",
        staffName: match[2],
      });
    }
  }
  return slots.slice(0, 12);
}

interface ClientData {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  totalVisits?: number;
}

function extractClients(data: unknown, _result: string): ClientData[] {
  if (Array.isArray(data)) {
    return data.slice(0, 8).map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      totalVisits: c.totalVisits,
    }));
  }
  return [];
}

function extractAppointmentId(data: unknown): string {
  if (data && typeof data === "object" && "id" in data) {
    return (data as { id: string }).id;
  }
  return "";
}

function getPostActionButtons(
  actionName: string,
  appointmentId: string
): ChatUIOption[] {
  switch (actionName) {
    case "create_appointment":
      return [
        { id: `reschedule|${appointmentId}`, label: "Reschedule", metadata: { action: "reschedule", appointmentId } },
        { id: `cancel|${appointmentId}`, label: "Cancel", metadata: { action: "cancel", appointmentId } },
        { id: "book_another", label: "Book Another", metadata: { action: "book_another" } },
      ];
    case "cancel_appointment":
      return [
        { id: "rebook", label: "Rebook", metadata: { action: "rebook" } },
        { id: "book_another", label: "Book Another", metadata: { action: "book_another" } },
      ];
    case "reschedule_appointment":
      return [
        { id: `cancel|${appointmentId}`, label: "Cancel Instead", metadata: { action: "cancel", appointmentId } },
        { id: "done", label: "All Done", metadata: { action: "done" } },
      ];
    default:
      return [];
  }
}

function extractStaffFromText(text: string): ChatUIOption[] {
  const options: ChatUIOption[] = [];
  const idPattern = /\[staffMemberId:\s*([^\]]+)\]/g;
  const nameIdPairs: Array<{ id: string; name: string }> = [];

  let match;
  while ((match = idPattern.exec(text)) !== null) {
    const id = match[1].trim();
    const beforeMatch = text.substring(0, match.index);
    const nameMatch = beforeMatch.match(/(\w[\w\s]+?)\s*$/);
    nameIdPairs.push({ id, name: nameMatch ? nameMatch[1].trim() : `Staff ${id.slice(0, 6)}` });
  }

  for (const pair of nameIdPairs) {
    options.push({
      id: pair.id,
      label: pair.name,
      metadata: { staffMemberId: pair.id },
    });
  }

  return options;
}

function extractServicesFromText(text: string): ChatUIOption[] {
  const options: ChatUIOption[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    let name = "";
    let duration = "";
    let price = "";
    let serviceId = "";

    const idMatch = line.match(/\[(?:id|serviceId):\s*([^\]]+)\]/);
    if (idMatch) serviceId = idMatch[1].trim();

    const fmtWithId = line.match(/^-\s*(.+?)\s*\[(?:id|serviceId):\s*[^\]]+\]\s*\((\d+)\s*min,\s*\$?([\d.]+)\)/);
    if (fmtWithId) {
      name = fmtWithId[1].trim();
      duration = fmtWithId[2];
      price = fmtWithId[3];
    }

    if (!name) {
      const fmtColon = line.match(/^-\s*(.+?):\s*(\d+)\s*min,\s*\$?([\d.]+)/);
      if (fmtColon) {
        name = fmtColon[1].trim();
        duration = fmtColon[2];
        price = fmtColon[3];
      }
    }

    if (!name) {
      const fmtParen = line.match(/^-\s*(.+?)\s*\((\d+)\s*min,\s*\$?([\d.]+)\)/);
      if (fmtParen) {
        name = fmtParen[1].trim();
        duration = fmtParen[2];
        price = fmtParen[3];
      }
    }

    if (!name) {
      const fmtDash = line.match(/^-\s*(.+?)\s*[-–]\s*(\d+)\s*min(?:utes?)?,?\s*\$?([\d.]+)/);
      if (fmtDash) {
        name = fmtDash[1].trim();
        duration = fmtDash[2];
        price = fmtDash[3];
      }
    }

    if (!name) {
      const fmtStarParen = line.match(/^\*\*?(.+?)\*\*?\s*\((\d+)\s*min,\s*\$?([\d.]+)\)/);
      if (fmtStarParen) {
        name = fmtStarParen[1].trim();
        duration = fmtStarParen[2];
        price = fmtStarParen[3];
      }
    }

    if (name) {
      name = name.replace(/\s*\[(?:id|serviceId):\s*[^\]]+\]\s*$/, "").trim();
      name = name.replace(/\*+/g, "").trim();
      options.push({
        id: serviceId || name,
        label: name,
        subtitle: `${duration} min`,
        metadata: { duration, price: `$${price}` },
      });
    }
  }

  return options;
}
