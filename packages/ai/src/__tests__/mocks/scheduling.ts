/**
 * Mock scheduling module for unit tests.
 */
import { vi } from "vitest";

export const createAppointment = vi.fn().mockResolvedValue({
  id: "appt-1",
  startTime: new Date("2026-04-15T10:00:00Z"),
  endTime: new Date("2026-04-15T11:00:00Z"),
  status: "CONFIRMED",
  client: { firstName: "Test", lastName: "Client" },
  service: { name: "Test Service" },
  staffMember: { displayName: "Test Staff" },
});

export const cancelAppointment = vi.fn().mockResolvedValue({
  id: "appt-1",
  status: "CANCELLED",
});

export const rescheduleAppointment = vi.fn().mockResolvedValue({
  id: "appt-1",
  startTime: new Date("2026-04-16T10:00:00Z"),
  endTime: new Date("2026-04-16T11:00:00Z"),
  status: "CONFIRMED",
});

export const getAvailableSlots = vi.fn().mockResolvedValue([
  { startTime: "10:00", endTime: "11:00" },
  { startTime: "14:00", endTime: "15:00" },
]);

export const createRecurringSeries = vi.fn().mockResolvedValue({
  created: ["appt-1", "appt-2", "appt-3"],
  skipped: [],
});

export const cancelSeries = vi.fn().mockResolvedValue({
  cancelled: "all",
});
