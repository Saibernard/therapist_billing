/**
 * Mock utils module for unit tests.
 */
export function formatCurrency(amount: number, currency = "USD"): string {
  return `$${amount.toFixed(2)}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US");
}

export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}
