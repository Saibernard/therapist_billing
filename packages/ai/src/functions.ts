import type OpenAI from "openai";

type FunctionDef = OpenAI.FunctionDefinition;

export const BUSINESS_FUNCTIONS: FunctionDef[] = [
  {
    name: "create_service",
    description: "Create a new service offering for the business",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Service name" },
        durationMinutes: { type: "number", description: "Duration in minutes" },
        price: { type: "number", description: "Price in default currency" },
        description: { type: "string", description: "Service description" },
        category: { type: "string", description: "Service category" },
        bufferMinutes: {
          type: "number",
          description: "Buffer time between appointments",
        },
        maxCapacity: {
          type: "number",
          description: "Max clients per slot (for group services)",
        },
      },
      required: ["name", "durationMinutes", "price"],
    },
  },
  {
    name: "search_appointments",
    description: "Search for appointments by date, client, or status",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        clientName: { type: "string", description: "Client name to search" },
        status: {
          type: "string",
          enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"],
        },
        staffMemberId: { type: "string" },
      },
    },
  },
  {
    name: "create_appointment",
    description: "Book an appointment for a client. Use serviceId if you know it, or serviceName to look it up.",
    parameters: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        clientPhone: { type: "string" },
        clientEmail: { type: "string" },
        serviceId: { type: "string", description: "Service ID from the services list" },
        serviceName: { type: "string", description: "Service name if ID is unknown" },
        staffMemberId: { type: "string" },
        dateTime: {
          type: "string",
          description: "ISO datetime string for the appointment",
        },
        notes: { type: "string" },
      },
      required: ["dateTime"],
    },
  },
  {
    name: "block_time",
    description: "Block off time on a staff member's schedule",
    parameters: {
      type: "object",
      properties: {
        staffMemberId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        startTime: { type: "string", description: "HH:mm" },
        endTime: { type: "string", description: "HH:mm" },
        reason: { type: "string" },
      },
      required: ["date"],
    },
  },
  {
    name: "search_clients",
    description: "Search for client contacts",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, email, or phone" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_analytics",
    description: "Get business analytics and metrics",
    parameters: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: [
            "revenue",
            "bookings",
            "no_shows",
            "new_clients",
            "utilization",
          ],
        },
        period: {
          type: "string",
          enum: ["today", "this_week", "this_month", "last_month"],
        },
      },
      required: ["metric"],
    },
  },
  {
    name: "search_availability",
    description: "Find available time slots for a service on a given date. Use this to check what slots are open for customers.",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string" },
        serviceName: { type: "string", description: "Service name to search for if ID unknown" },
        staffMemberId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "update_staff_services",
    description: "Assign or update which services a staff member can perform. Replaces all current service assignments.",
    parameters: {
      type: "object",
      properties: {
        staffMemberId: { type: "string" },
        staffName: { type: "string", description: "Staff name if ID unknown" },
        serviceNames: {
          type: "array",
          items: { type: "string" },
          description: "Names of services to assign (replaces existing assignments)",
        },
        addServiceNames: {
          type: "array",
          items: { type: "string" },
          description: "Names of services to ADD to existing assignments (without removing others)",
        },
        removeServiceNames: {
          type: "array",
          items: { type: "string" },
          description: "Names of services to REMOVE from existing assignments",
        },
      },
    },
  },
  {
    name: "add_extra_availability",
    description: "Add extra working hours for a staff member on a specific date (outside their regular schedule). Also use this to block a day off or block specific hours.",
    parameters: {
      type: "object",
      properties: {
        staffMemberId: { type: "string" },
        staffName: { type: "string", description: "Staff name if ID unknown" },
        date: { type: "string", description: "YYYY-MM-DD" },
        startTime: { type: "string", description: "HH:mm — start of extra availability or block" },
        endTime: { type: "string", description: "HH:mm — end of extra availability or block" },
        isAvailable: { type: "boolean", description: "true = add extra hours, false = block time off" },
        reason: { type: "string", description: "Reason for the change" },
      },
      required: ["date", "isAvailable"],
    },
  },
  {
    name: "remove_override",
    description: "Remove a schedule override (unblock a blocked day or remove extra hours) for a staff member on a specific date.",
    parameters: {
      type: "object",
      properties: {
        staffMemberId: { type: "string" },
        staffName: { type: "string", description: "Staff name if ID unknown" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_staff_availability",
    description: "Show a summary of a staff member's availability for a date range. Use this when the owner asks 'show my availability' or 'what does my schedule look like'.",
    parameters: {
      type: "object",
      properties: {
        staffMemberId: { type: "string" },
        staffName: { type: "string", description: "Staff name if ID unknown" },
        startDate: { type: "string", description: "YYYY-MM-DD start" },
        endDate: { type: "string", description: "YYYY-MM-DD end" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "create_staff",
    description: "Add a new staff member to the business",
    parameters: {
      type: "object",
      properties: {
        displayName: { type: "string", description: "Staff member's full name" },
        bio: { type: "string", description: "Short bio or description" },
        serviceNames: {
          type: "array",
          items: { type: "string" },
          description: "Names of services this staff member offers",
        },
      },
      required: ["displayName"],
    },
  },
  {
    name: "update_staff_schedule",
    description: "Set working hours for a staff member. Provide schedule as an array of day objects.",
    parameters: {
      type: "object",
      properties: {
        staffMemberId: { type: "string" },
        staffName: { type: "string", description: "Staff name if ID unknown" },
        schedule: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dayOfWeek: { type: "number", description: "0=Sun, 1=Mon, ..., 6=Sat" },
              startTime: { type: "string", description: "HH:mm format" },
              endTime: { type: "string", description: "HH:mm format" },
              isAvailable: { type: "boolean" },
            },
            required: ["dayOfWeek", "startTime", "endTime", "isAvailable"],
          },
          description: "Working hours per day of week",
        },
      },
      required: ["schedule"],
    },
  },
  {
    name: "create_recurring_appointment",
    description: "Create a recurring appointment series for a client. E.g. 'book Sarah for weekly training every Tuesday at 2pm'",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        clientName: { type: "string", description: "Client name for lookup if clientId unknown" },
        serviceId: { type: "string" },
        serviceName: { type: "string", description: "Service name for lookup if serviceId unknown" },
        staffMemberId: { type: "string" },
        frequency: { type: "string", enum: ["WEEKLY", "BIWEEKLY", "MONTHLY"], description: "How often" },
        dayOfWeek: { type: "number", description: "0=Sun, 1=Mon, ..., 6=Sat" },
        preferredTime: { type: "string", description: "HH:mm format, e.g. '14:00'" },
        startDate: { type: "string", description: "ISO date string for the first occurrence" },
        endDate: { type: "string", description: "Optional ISO date string for when to stop" },
      },
      required: ["frequency", "preferredTime", "startDate"],
    },
  },
  {
    name: "cancel_recurring_series",
    description: "Cancel a recurring appointment series — cancel a single occurrence, all future, or the entire series",
    parameters: {
      type: "object",
      properties: {
        ruleId: { type: "string", description: "The recurrence rule ID" },
        scope: { type: "string", enum: ["this", "future", "all"], description: "Cancel just one, all future, or all" },
        appointmentId: { type: "string", description: "Required for 'this' or 'future' scope" },
      },
      required: ["ruleId", "scope"],
    },
  },
  {
    name: "get_client_packages",
    description: "Get a client's active packages and memberships, including visit counts and expiry dates",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Client ID if known" },
        clientName: { type: "string", description: "Client name to search for if ID unknown" },
      },
    },
  },
  {
    name: "assign_package",
    description: "Assign a package or membership to a client. Use this when the owner says 'give Sarah the 10-pack' or 'add the monthly membership for John'.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Client ID if known" },
        clientName: { type: "string", description: "Client name if ID unknown" },
        packageId: { type: "string", description: "Package ID if known" },
        packageName: { type: "string", description: "Package name if ID unknown" },
      },
    },
  },
  {
    name: "bulk_reschedule",
    description: "Reschedule multiple appointments at once. E.g. 'Move all Tuesday appointments to Wednesday' or 'Move all of Sarah's clients on Jan 5 to Jan 6'.",
    parameters: {
      type: "object",
      properties: {
        sourceDate: { type: "string", description: "YYYY-MM-DD date to move appointments FROM" },
        targetDate: { type: "string", description: "YYYY-MM-DD date to move appointments TO" },
        staffMemberId: { type: "string", description: "Only move this staff member's appointments" },
        staffName: { type: "string", description: "Staff name if ID unknown" },
        clientName: { type: "string", description: "Only move appointments for this client" },
        preserveTime: { type: "boolean", description: "Keep same time of day (default true)" },
      },
      required: ["sourceDate", "targetDate"],
    },
  },
  {
    name: "bulk_cancel",
    description: "Cancel multiple appointments at once. E.g. 'Cancel all appointments on January 5th' or 'Cancel all of Dr. Smith's appointments next Monday'.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD date to cancel appointments for" },
        staffMemberId: { type: "string", description: "Only cancel this staff member's appointments" },
        staffName: { type: "string", description: "Staff name if ID unknown" },
        reason: { type: "string", description: "Cancellation reason" },
      },
      required: ["date"],
    },
  },
  {
    name: "suggest_optimal_time",
    description: "Use AI to suggest the best time to schedule an appointment based on patterns, staff utilization, and client preferences.",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string" },
        serviceName: { type: "string", description: "Service name if ID unknown" },
        staffMemberId: { type: "string" },
        staffName: { type: "string", description: "Staff name if ID unknown" },
        clientName: { type: "string" },
        preferredDate: { type: "string", description: "YYYY-MM-DD preferred date" },
      },
    },
  },

  // ── Service management ──
  {
    name: "update_service",
    description: "Update an existing service's details — name, price, duration, description, category, buffer time, or capacity.",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "Service ID if known" },
        serviceName: { type: "string", description: "Service name to look up if ID unknown" },
        name: { type: "string", description: "New name for the service" },
        durationMinutes: { type: "number", description: "New duration in minutes" },
        price: { type: "number", description: "New price" },
        description: { type: "string", description: "New description" },
        category: { type: "string", description: "New category" },
        bufferMinutes: { type: "number", description: "New buffer time between appointments" },
        maxCapacity: { type: "number", description: "New max clients per slot" },
        depositAmount: { type: "number", description: "Deposit amount required" },
        noShowFeeAmount: { type: "number", description: "No-show fee amount" },
      },
    },
  },
  {
    name: "delete_service",
    description: "Delete (deactivate) a service. Requires confirmation — call once to preview, then again with confirmed=true.",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "Service ID if known" },
        serviceName: { type: "string", description: "Service name to look up if ID unknown" },
      },
    },
  },
  {
    name: "update_service_fees",
    description: "Set deposit and no-show fee policies for a service.",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "Service ID if known" },
        serviceName: { type: "string", description: "Service name if ID unknown" },
        depositAmount: { type: "number", description: "Deposit amount (0 to remove)" },
        depositType: { type: "string", enum: ["FIXED", "PERCENTAGE"], description: "Deposit type" },
        noShowFeeAmount: { type: "number", description: "No-show fee amount (0 to remove)" },
      },
    },
  },

  // ── Client management ──
  {
    name: "create_client",
    description: "Add a new client to the business. Use when someone new calls or the owner says 'add a new client'.",
    parameters: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "Client's first name" },
        lastName: { type: "string", description: "Client's last name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        notes: { type: "string", description: "Notes about the client" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to categorize the client" },
      },
      required: ["firstName"],
    },
  },
  {
    name: "update_client",
    description: "Update an existing client's details — name, email, phone, notes, or tags.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Client ID if known" },
        clientName: { type: "string", description: "Client name to look up if ID unknown" },
        firstName: { type: "string", description: "New first name" },
        lastName: { type: "string", description: "New last name" },
        email: { type: "string", description: "New email" },
        phone: { type: "string", description: "New phone number" },
        notes: { type: "string", description: "Updated notes" },
        tags: { type: "array", items: { type: "string" }, description: "Updated tags" },
      },
    },
  },

  // ── Appointment lifecycle ──
  {
    name: "reschedule_appointment",
    description: "Reschedule an existing appointment to a new date/time.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string", description: "Appointment ID" },
        newDateTime: { type: "string", description: "New ISO datetime" },
      },
      required: ["appointmentId", "newDateTime"],
    },
  },
  {
    name: "cancel_appointment",
    description: "Cancel an existing appointment.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string", description: "Appointment ID" },
        reason: { type: "string", description: "Cancellation reason" },
      },
      required: ["appointmentId"],
    },
  },
  {
    name: "confirm_appointment",
    description: "Confirm an appointment.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string", description: "Appointment ID" },
      },
      required: ["appointmentId"],
    },
  },
  {
    name: "complete_appointment",
    description: "Mark an appointment as completed. Can look up by ID or by client name + date.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string", description: "Appointment ID if known" },
        clientName: { type: "string", description: "Client name to look up if ID unknown" },
        date: { type: "string", description: "YYYY-MM-DD date to narrow search" },
      },
    },
  },
  {
    name: "mark_no_show",
    description: "Mark an appointment as a no-show. Can look up by ID or by client name + date.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string", description: "Appointment ID if known" },
        clientName: { type: "string", description: "Client name to look up if ID unknown" },
        date: { type: "string", description: "YYYY-MM-DD date to narrow search" },
      },
    },
  },

  // ── Packages ──
  {
    name: "create_package",
    description: "Create a new package or membership for the business. E.g. '10-session pack for $500' or '$99/month unlimited membership'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Package name" },
        type: { type: "string", enum: ["VISIT_PACK", "MEMBERSHIP"], description: "Package type" },
        price: { type: "number", description: "Price" },
        totalVisits: { type: "number", description: "Total visits included (for visit packs)" },
        validDays: { type: "number", description: "Days until expiration" },
        billingInterval: { type: "string", description: "Billing interval for memberships (e.g. 'monthly')" },
        includedVisits: { type: "number", description: "Visits per billing period (for memberships)" },
      },
      required: ["name", "type", "price"],
    },
  },

  // ── Campaigns ──
  {
    name: "create_campaign",
    description: "Create an automated marketing campaign. Types: birthday greetings, win-back inactive clients, post-visit follow-up, rebook nudge, or custom.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Campaign name" },
        type: { type: "string", enum: ["BIRTHDAY", "WINBACK", "POST_VISIT", "REBOOK_NUDGE", "CUSTOM"], description: "Campaign trigger type" },
        channel: { type: "string", enum: ["EMAIL", "SMS", "WHATSAPP"], description: "Delivery channel" },
        messageTemplate: { type: "string", description: "Message template with {{placeholders}}" },
        useAi: { type: "boolean", description: "Use AI to personalize messages" },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "update_campaign_status",
    description: "Activate, pause, or set a campaign to draft status.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID if known" },
        campaignName: { type: "string", description: "Campaign name if ID unknown" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED", "DRAFT"], description: "New status" },
      },
      required: ["status"],
    },
  },

  // ── Intake forms ──
  {
    name: "create_intake_form",
    description: "Create a new intake form or digital waiver. Define fields like text inputs, checkboxes, dropdowns, and optional signature requirement.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Form name" },
        description: { type: "string", description: "Form description" },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", description: "Field type: text, textarea, select, checkbox, date, signature, file" },
              label: { type: "string", description: "Field label" },
              required: { type: "boolean", description: "Whether the field is required" },
              options: { type: "array", items: { type: "string" }, description: "Options for select/checkbox fields" },
              placeholder: { type: "string", description: "Placeholder text" },
            },
            required: ["type", "label"],
          },
          description: "Form fields",
        },
        requireSignature: { type: "boolean", description: "Require client signature" },
        serviceNames: { type: "array", items: { type: "string" }, description: "Link form to specific services" },
      },
      required: ["name", "fields"],
    },
  },

  // ── Payroll & reports ──
  {
    name: "get_payroll_summary",
    description: "Get a payroll summary showing staff earnings, commission, and appointment counts for a given period.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["this_week", "this_month", "last_month"], description: "Time period" },
        staffName: { type: "string", description: "Filter to a specific staff member" },
      },
    },
  },
  {
    name: "get_revenue_report",
    description: "Get a revenue report grouped by service, staff, or day.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "this_week", "this_month", "last_month", "this_quarter"], description: "Time period" },
        groupBy: { type: "string", enum: ["service", "staff", "day"], description: "How to group the results" },
      },
    },
  },

  // ── Waitlist ──
  {
    name: "add_to_waitlist",
    description: "Add a client to the waitlist for a service. Optionally auto-book when a slot opens.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Client ID if known" },
        clientName: { type: "string", description: "Client name if ID unknown" },
        serviceId: { type: "string", description: "Service ID if known" },
        serviceName: { type: "string", description: "Service name if ID unknown" },
        staffMemberId: { type: "string", description: "Preferred staff member ID" },
        staffName: { type: "string", description: "Preferred staff name if ID unknown" },
        preferredDate: { type: "string", description: "YYYY-MM-DD preferred date" },
        preferredTime: { type: "string", description: "HH:mm preferred time" },
        autoBook: { type: "boolean", description: "Automatically book when a slot opens" },
      },
    },
  },
  {
    name: "get_waitlist",
    description: "View the current waitlist, optionally filtered by date or service.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD to filter by date" },
        serviceName: { type: "string", description: "Filter by service name" },
      },
    },
  },
];

export const CLIENT_FUNCTIONS: FunctionDef[] = [
  {
    name: "search_availability",
    description: "Find available time slots for a service",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string" },
        serviceName: {
          type: "string",
          description: "Service name to search for if ID unknown",
        },
        staffMemberId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        dateRange: {
          type: "string",
          description:
            "Natural language date range like 'this week' or 'next Friday'",
        },
      },
    },
  },
  {
    name: "create_appointment",
    description: "Book an appointment. Use serviceId if known, or serviceName to look it up.",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "Service ID from the services list" },
        serviceName: { type: "string", description: "Service name if ID is unknown" },
        staffMemberId: { type: "string" },
        dateTime: { type: "string", description: "ISO datetime" },
      },
      required: ["dateTime"],
    },
  },
  {
    name: "reschedule_appointment",
    description: "Reschedule an existing appointment",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
        newDateTime: { type: "string", description: "ISO datetime" },
      },
      required: ["appointmentId", "newDateTime"],
    },
  },
  {
    name: "cancel_appointment",
    description: "Cancel an appointment",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["appointmentId"],
    },
  },
  {
    name: "confirm_appointment",
    description: "Confirm attendance for an appointment",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
      },
      required: ["appointmentId"],
    },
  },
  {
    name: "get_business_info",
    description: "Get business information like hours, location, services",
    parameters: {
      type: "object",
      properties: {
        infoType: {
          type: "string",
          enum: ["hours", "location", "services", "pricing", "policies"],
        },
      },
      required: ["infoType"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Escalate to the business owner when unable to help or uncertain",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
];
