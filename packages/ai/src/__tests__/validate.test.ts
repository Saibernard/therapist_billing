import { describe, it, expect } from "vitest";
import { validateArgs } from "../validate";

describe("validateArgs", () => {
  // ─── Unknown function → skip validation ─────────────────────
  describe("unknown functions", () => {
    it("passes through args for unknown functions (backward compat)", () => {
      const result = validateArgs("totally_unknown_function", { foo: "bar" });
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.data).toEqual({ foo: "bar" });
    });
  });

  // ─── create_service ─────────────────────────────────────────
  describe("create_service", () => {
    it("accepts valid input", () => {
      const result = validateArgs("create_service", {
        name: "Haircut",
        durationMinutes: 30,
        price: 50,
      });
      expect(result.valid).toBe(true);
    });

    it("rejects missing name", () => {
      const result = validateArgs("create_service", {
        durationMinutes: 30,
        price: 50,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain("Required");
    });

    it("rejects empty name", () => {
      const result = validateArgs("create_service", {
        name: "",
        durationMinutes: 30,
        price: 50,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects duration < 5 minutes", () => {
      const result = validateArgs("create_service", {
        name: "Quick",
        durationMinutes: 2,
        price: 10,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain("5 minutes");
    });

    it("rejects negative price", () => {
      const result = validateArgs("create_service", {
        name: "Haircut",
        durationMinutes: 30,
        price: -10,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain("negative");
    });

    it("accepts optional fields", () => {
      const result = validateArgs("create_service", {
        name: "Massage",
        durationMinutes: 60,
        price: 100,
        description: "Full body massage",
        category: "Wellness",
        bufferMinutes: 15,
        maxCapacity: 1,
      });
      expect(result.valid).toBe(true);
    });
  });

  // ─── update_service ─────────────────────────────────────────
  describe("update_service", () => {
    it("accepts partial updates", () => {
      const result = validateArgs("update_service", {
        serviceName: "Haircut",
        price: 60,
      });
      expect(result.valid).toBe(true);
    });

    it("accepts empty object (all optional)", () => {
      const result = validateArgs("update_service", {});
      expect(result.valid).toBe(true);
    });
  });

  // ─── delete_service ─────────────────────────────────────────
  describe("delete_service", () => {
    it("accepts serviceId", () => {
      const result = validateArgs("delete_service", { serviceId: "svc-123" });
      expect(result.valid).toBe(true);
    });

    it("accepts serviceName", () => {
      const result = validateArgs("delete_service", { serviceName: "Haircut" });
      expect(result.valid).toBe(true);
    });
  });

  // ─── create_client ──────────────────────────────────────────
  describe("create_client", () => {
    it("accepts valid input", () => {
      const result = validateArgs("create_client", {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "555-1234",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects missing firstName", () => {
      const result = validateArgs("create_client", { lastName: "Doe" });
      expect(result.valid).toBe(false);
    });

    it("rejects invalid email", () => {
      const result = validateArgs("create_client", {
        firstName: "Jane",
        email: "not-an-email",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain("email");
    });

    it("accepts empty string email (opt-out)", () => {
      const result = validateArgs("create_client", {
        firstName: "Jane",
        email: "",
      });
      expect(result.valid).toBe(true);
    });

    it("accepts tags array", () => {
      const result = validateArgs("create_client", {
        firstName: "Jane",
        tags: ["VIP", "Regular"],
      });
      expect(result.valid).toBe(true);
    });
  });

  // ─── search_clients ────────────────────────────────────────
  describe("search_clients", () => {
    it("accepts valid query", () => {
      const result = validateArgs("search_clients", { query: "Jane" });
      expect(result.valid).toBe(true);
    });

    it("rejects empty query", () => {
      const result = validateArgs("search_clients", { query: "" });
      expect(result.valid).toBe(false);
    });
  });

  // ─── create_appointment ─────────────────────────────────────
  describe("create_appointment", () => {
    it("accepts valid input", () => {
      const result = validateArgs("create_appointment", {
        clientName: "Jane Doe",
        serviceName: "Haircut",
        dateTime: "2026-04-15T10:00:00Z",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects missing dateTime", () => {
      const result = validateArgs("create_appointment", {
        clientName: "Jane",
        serviceName: "Haircut",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain("Required");
    });
  });

  // ─── search_appointments ────────────────────────────────────
  describe("search_appointments", () => {
    it("accepts date filter", () => {
      const result = validateArgs("search_appointments", { date: "2026-04-15" });
      expect(result.valid).toBe(true);
    });

    it("accepts status filter", () => {
      const result = validateArgs("search_appointments", { status: "CONFIRMED" });
      expect(result.valid).toBe(true);
    });

    it("rejects invalid status", () => {
      const result = validateArgs("search_appointments", { status: "INVALID" });
      expect(result.valid).toBe(false);
    });
  });

  // ─── reschedule_appointment ─────────────────────────────────
  describe("reschedule_appointment", () => {
    it("accepts valid input", () => {
      const result = validateArgs("reschedule_appointment", {
        appointmentId: "appt-1",
        newDateTime: "2026-04-16T10:00:00Z",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects missing appointmentId", () => {
      const result = validateArgs("reschedule_appointment", {
        newDateTime: "2026-04-16T10:00:00Z",
      });
      expect(result.valid).toBe(false);
    });
  });

  // ─── cancel_appointment ─────────────────────────────────────
  describe("cancel_appointment", () => {
    it("accepts valid input", () => {
      const result = validateArgs("cancel_appointment", {
        appointmentId: "appt-1",
        reason: "Client requested",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects missing appointmentId", () => {
      const result = validateArgs("cancel_appointment", {});
      expect(result.valid).toBe(false);
    });
  });

  // ─── bulk_reschedule ────────────────────────────────────────
  describe("bulk_reschedule", () => {
    it("accepts valid input", () => {
      const result = validateArgs("bulk_reschedule", {
        sourceDate: "2026-04-15",
        targetDate: "2026-04-16",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects missing sourceDate", () => {
      const result = validateArgs("bulk_reschedule", { targetDate: "2026-04-16" });
      expect(result.valid).toBe(false);
    });

    it("accepts optional filters", () => {
      const result = validateArgs("bulk_reschedule", {
        sourceDate: "2026-04-15",
        targetDate: "2026-04-16",
        staffName: "Sarah",
        preserveTime: true,
        confirmed: true,
      });
      expect(result.valid).toBe(true);
    });
  });

  // ─── bulk_cancel ────────────────────────────────────────────
  describe("bulk_cancel", () => {
    it("accepts valid input", () => {
      const result = validateArgs("bulk_cancel", { date: "2026-04-15" });
      expect(result.valid).toBe(true);
    });

    it("rejects missing date", () => {
      const result = validateArgs("bulk_cancel", {});
      expect(result.valid).toBe(false);
    });
  });

  // ─── create_recurring_appointment ───────────────────────────
  describe("create_recurring_appointment", () => {
    it("accepts valid input", () => {
      const result = validateArgs("create_recurring_appointment", {
        clientName: "Jane",
        serviceName: "Massage",
        frequency: "WEEKLY",
        preferredTime: "14:00",
        startDate: "2026-04-15",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects invalid frequency", () => {
      const result = validateArgs("create_recurring_appointment", {
        frequency: "DAILY",
        preferredTime: "14:00",
        startDate: "2026-04-15",
      });
      expect(result.valid).toBe(false);
    });
  });

  // ─── create_package ─────────────────────────────────────────
  describe("create_package", () => {
    it("accepts visit pack", () => {
      const result = validateArgs("create_package", {
        name: "10-Session Pack",
        type: "VISIT_PACK",
        price: 500,
        totalVisits: 10,
      });
      expect(result.valid).toBe(true);
    });

    it("accepts membership", () => {
      const result = validateArgs("create_package", {
        name: "Monthly Unlimited",
        type: "MEMBERSHIP",
        price: 99,
        billingInterval: "monthly",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects negative price", () => {
      const result = validateArgs("create_package", {
        name: "Bad",
        type: "VISIT_PACK",
        price: -10,
      });
      expect(result.valid).toBe(false);
    });
  });

  // ─── create_campaign ────────────────────────────────────────
  describe("create_campaign", () => {
    it("accepts valid input", () => {
      const result = validateArgs("create_campaign", {
        name: "Birthday Special",
        type: "BIRTHDAY",
        channel: "EMAIL",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects invalid type", () => {
      const result = validateArgs("create_campaign", {
        name: "Test",
        type: "INVALID",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects invalid channel", () => {
      const result = validateArgs("create_campaign", {
        name: "Test",
        type: "BIRTHDAY",
        channel: "PIGEON",
      });
      expect(result.valid).toBe(false);
    });
  });

  // ─── create_intake_form ─────────────────────────────────────
  describe("create_intake_form", () => {
    it("accepts valid form with fields", () => {
      const result = validateArgs("create_intake_form", {
        name: "Health History",
        fields: [
          { type: "text", label: "Full Name", required: true },
          { type: "textarea", label: "Medical Conditions" },
          { type: "select", label: "Frequency", options: ["Weekly", "Monthly"] },
        ],
        requireSignature: true,
      });
      expect(result.valid).toBe(true);
    });

    it("rejects missing fields", () => {
      const result = validateArgs("create_intake_form", { name: "Form" });
      expect(result.valid).toBe(false);
    });
  });

  // ─── get_analytics ──────────────────────────────────────────
  describe("get_analytics", () => {
    it("accepts valid metric", () => {
      const result = validateArgs("get_analytics", {
        metric: "revenue",
        period: "this_month",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects invalid metric", () => {
      const result = validateArgs("get_analytics", { metric: "happiness" });
      expect(result.valid).toBe(false);
    });
  });

  // ─── get_business_info ──────────────────────────────────────
  describe("get_business_info", () => {
    it("accepts valid infoType", () => {
      const result = validateArgs("get_business_info", { infoType: "hours" });
      expect(result.valid).toBe(true);
    });

    it("rejects invalid infoType", () => {
      const result = validateArgs("get_business_info", { infoType: "secrets" });
      expect(result.valid).toBe(false);
    });
  });

  // ─── escalate_to_human ─────────────────────────────────────
  describe("escalate_to_human", () => {
    it("accepts valid input", () => {
      const result = validateArgs("escalate_to_human", {
        reason: "Customer unhappy, need manager",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects empty reason", () => {
      const result = validateArgs("escalate_to_human", { reason: "" });
      expect(result.valid).toBe(false);
    });
  });

  // ─── get_payroll_summary ────────────────────────────────────
  describe("get_payroll_summary", () => {
    it("accepts valid period", () => {
      const result = validateArgs("get_payroll_summary", { period: "this_month" });
      expect(result.valid).toBe(true);
    });

    it("rejects invalid period", () => {
      const result = validateArgs("get_payroll_summary", { period: "last_year" });
      expect(result.valid).toBe(false);
    });

    it("accepts empty object (all optional)", () => {
      const result = validateArgs("get_payroll_summary", {});
      expect(result.valid).toBe(true);
    });
  });

  // ─── get_revenue_report ─────────────────────────────────────
  describe("get_revenue_report", () => {
    it("accepts valid input", () => {
      const result = validateArgs("get_revenue_report", {
        period: "this_quarter",
        groupBy: "service",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects invalid groupBy", () => {
      const result = validateArgs("get_revenue_report", { groupBy: "zodiac" });
      expect(result.valid).toBe(false);
    });
  });

  // ─── add_to_waitlist ────────────────────────────────────────
  describe("add_to_waitlist", () => {
    it("accepts valid input", () => {
      const result = validateArgs("add_to_waitlist", {
        clientName: "Jane",
        serviceName: "Massage",
        autoBook: true,
      });
      expect(result.valid).toBe(true);
    });

    it("accepts empty object (all optional)", () => {
      const result = validateArgs("add_to_waitlist", {});
      expect(result.valid).toBe(true);
    });
  });

  // ─── update_service_fees ────────────────────────────────────
  describe("update_service_fees", () => {
    it("accepts valid input", () => {
      const result = validateArgs("update_service_fees", {
        serviceName: "Haircut",
        depositAmount: 20,
        depositType: "FIXED",
        noShowFeeAmount: 50,
      });
      expect(result.valid).toBe(true);
    });

    it("rejects invalid deposit type", () => {
      const result = validateArgs("update_service_fees", {
        serviceName: "Haircut",
        depositType: "MAGIC",
      });
      expect(result.valid).toBe(false);
    });
  });
});
