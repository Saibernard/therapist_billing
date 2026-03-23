export interface OrganizationSettings {
  defaultReminderHours: number[];
  cancellationPolicyHours: number;
  allowOnlinePayment: boolean;
  requirePaymentUpfront: boolean;
  aiPersonality: "professional" | "friendly" | "casual";
  businessHoursDisplay: string;
  bookingConfirmationRequired: boolean;
  autoConfirmBookings: boolean;
}

export const DEFAULT_ORG_SETTINGS: OrganizationSettings = {
  defaultReminderHours: [24, 2],
  cancellationPolicyHours: 24,
  allowOnlinePayment: false,
  requirePaymentUpfront: false,
  aiPersonality: "friendly",
  businessHoursDisplay: "",
  bookingConfirmationRequired: false,
  autoConfirmBookings: true,
};

export interface TimeSlot {
  startTime: string;
  endTime: string;
  staffMemberId: string;
  staffName: string;
  available: boolean;
}

export interface AvailabilityQuery {
  organizationId: string;
  serviceId: string;
  staffMemberId?: string;
  date: string; // ISO date string
  timezone: string;
}

export interface AiMessage {
  role: "system" | "user" | "assistant" | "function";
  content: string;
  functionCall?: {
    name: string;
    arguments: string;
  };
  timestamp: string;
}

export interface AiContext {
  organizationId: string;
  organizationName: string;
  timezone: string;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
    category?: string;
  }>;
  staffMembers: Array<{
    id: string;
    name: string;
    services: string[];
  }>;
  clientId?: string;
  clientName?: string;
  recentAppointments?: Array<{
    id: string;
    serviceName: string;
    startTime: string;
    status: string;
  }>;
}

export interface InboundMessage {
  channel: "email" | "sms" | "whatsapp";
  from: string;
  to: string;
  body: string;
  subject?: string;
  organizationId?: string;
  clientId?: string;
  appointmentId?: string;
  externalId?: string;
}

export interface OutboundMessage {
  channel: "email" | "sms" | "whatsapp";
  to: string;
  body: string;
  subject?: string;
  organizationId: string;
  clientId?: string;
  appointmentId?: string;
  messageType: string;
  replyTo?: string;
}

// ============================================================
// Interactive Chat UI Blocks
// ============================================================

export type ChatUIBlockType =
  | "staff_selector"
  | "service_selector"
  | "time_selector"
  | "client_selector"
  | "confirm_action"
  | "action_buttons";

export interface ChatUIOption {
  id: string;
  label: string;
  subtitle?: string;
  metadata?: Record<string, string>;
}

export interface ChatUIBlock {
  type: ChatUIBlockType;
  prompt: string;
  options: ChatUIOption[];
  context?: Record<string, string>;
}
