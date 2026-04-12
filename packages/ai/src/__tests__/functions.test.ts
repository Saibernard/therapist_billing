import { describe, it, expect } from "vitest";
import { BUSINESS_FUNCTIONS, CLIENT_FUNCTIONS } from "../functions";

describe("BUSINESS_FUNCTIONS definitions", () => {
  it("has at least 35 function definitions", () => {
    expect(BUSINESS_FUNCTIONS.length).toBeGreaterThanOrEqual(35);
  });

  it("every function has a name", () => {
    for (const fn of BUSINESS_FUNCTIONS) {
      expect(fn.name).toBeDefined();
      expect(fn.name.length).toBeGreaterThan(0);
    }
  });

  it("every function has a description", () => {
    for (const fn of BUSINESS_FUNCTIONS) {
      expect(fn.description).toBeDefined();
      expect(fn.description!.length).toBeGreaterThan(0);
    }
  });

  it("every function has parameters of type object", () => {
    for (const fn of BUSINESS_FUNCTIONS) {
      expect(fn.parameters).toBeDefined();
      expect((fn.parameters as Record<string, unknown>).type).toBe("object");
      expect((fn.parameters as Record<string, unknown>).properties).toBeDefined();
    }
  });

  it("has no duplicate function names", () => {
    const names = BUSINESS_FUNCTIONS.map((f) => f.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  // Verify all critical functions exist
  const requiredFunctions = [
    "create_service",
    "update_service",
    "delete_service",
    "update_service_fees",
    "create_client",
    "update_client",
    "search_clients",
    "search_appointments",
    "create_appointment",
    "complete_appointment",
    "mark_no_show",
    "reschedule_appointment",
    "cancel_appointment",
    "confirm_appointment",
    "bulk_reschedule",
    "bulk_cancel",
    "search_availability",
    "block_time",
    "add_extra_availability",
    "remove_override",
    "get_staff_availability",
    "suggest_optimal_time",
    "create_staff",
    "update_staff_services",
    "update_staff_schedule",
    "create_recurring_appointment",
    "cancel_recurring_series",
    "get_client_packages",
    "assign_package",
    "create_package",
    "create_campaign",
    "update_campaign_status",
    "create_intake_form",
    "get_payroll_summary",
    "get_revenue_report",
    "add_to_waitlist",
    "get_waitlist",
    "get_analytics",
  ];

  for (const fnName of requiredFunctions) {
    it(`includes "${fnName}"`, () => {
      const found = BUSINESS_FUNCTIONS.find((f) => f.name === fnName);
      expect(found).toBeDefined();
    });
  }

  // Verify required fields are declared where they should be
  it("create_service requires name, durationMinutes, price", () => {
    const fn = BUSINESS_FUNCTIONS.find((f) => f.name === "create_service")!;
    const required = (fn.parameters as Record<string, unknown>).required as string[];
    expect(required).toContain("name");
    expect(required).toContain("durationMinutes");
    expect(required).toContain("price");
  });

  it("create_appointment requires dateTime", () => {
    const fn = BUSINESS_FUNCTIONS.find((f) => f.name === "create_appointment")!;
    const required = (fn.parameters as Record<string, unknown>).required as string[];
    expect(required).toContain("dateTime");
  });

  it("create_client requires firstName", () => {
    const fn = BUSINESS_FUNCTIONS.find((f) => f.name === "create_client")!;
    const required = (fn.parameters as Record<string, unknown>).required as string[];
    expect(required).toContain("firstName");
  });

  it("create_package requires name, type, price", () => {
    const fn = BUSINESS_FUNCTIONS.find((f) => f.name === "create_package")!;
    const required = (fn.parameters as Record<string, unknown>).required as string[];
    expect(required).toContain("name");
    expect(required).toContain("type");
    expect(required).toContain("price");
  });

  it("create_campaign requires name, type", () => {
    const fn = BUSINESS_FUNCTIONS.find((f) => f.name === "create_campaign")!;
    const required = (fn.parameters as Record<string, unknown>).required as string[];
    expect(required).toContain("name");
    expect(required).toContain("type");
  });

  it("bulk_reschedule requires sourceDate, targetDate", () => {
    const fn = BUSINESS_FUNCTIONS.find((f) => f.name === "bulk_reschedule")!;
    const required = (fn.parameters as Record<string, unknown>).required as string[];
    expect(required).toContain("sourceDate");
    expect(required).toContain("targetDate");
  });
});

describe("CLIENT_FUNCTIONS definitions", () => {
  it("has at least 7 function definitions", () => {
    expect(CLIENT_FUNCTIONS.length).toBeGreaterThanOrEqual(7);
  });

  const requiredClientFunctions = [
    "search_availability",
    "create_appointment",
    "reschedule_appointment",
    "cancel_appointment",
    "confirm_appointment",
    "get_business_info",
    "escalate_to_human",
  ];

  for (const fnName of requiredClientFunctions) {
    it(`includes "${fnName}"`, () => {
      const found = CLIENT_FUNCTIONS.find((f) => f.name === fnName);
      expect(found).toBeDefined();
    });
  }

  it("every function has a name and description", () => {
    for (const fn of CLIENT_FUNCTIONS) {
      expect(fn.name).toBeDefined();
      expect(fn.description).toBeDefined();
      expect(fn.description!.length).toBeGreaterThan(0);
    }
  });
});
