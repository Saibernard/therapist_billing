import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { startOfDay, endOfDay } from "date-fns";

export function toOrgTimezone(date: Date, timezone: string): Date {
  return toZonedTime(date, timezone);
}

export function fromOrgTimezone(date: Date, timezone: string): Date {
  return fromZonedTime(date, timezone);
}

export function getStartOfDay(date: Date, timezone: string): Date {
  const zonedDate = toZonedTime(date, timezone);
  const start = startOfDay(zonedDate);
  return fromZonedTime(start, timezone);
}

export function getEndOfDay(date: Date, timezone: string): Date {
  const zonedDate = toZonedTime(date, timezone);
  const end = endOfDay(zonedDate);
  return fromZonedTime(end, timezone);
}
