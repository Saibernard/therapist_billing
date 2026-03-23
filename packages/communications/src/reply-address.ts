const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "inbound.bookai.com";

export function encodeReplyAddress(
  organizationId: string,
  clientId: string,
  appointmentId?: string
): string {
  // Keep local-part safely under RFC 64-char limit.
  // Using raw IDs with a dot delimiter is shorter than base64("org:client[:appt]").
  // We intentionally omit appointmentId in reply address to avoid length issues.
  // Appointment context is still inferred from recent conversation/history.
  const token = `${organizationId}.${clientId}`;
  return `reply+${token}@${INBOUND_DOMAIN}`;
}

export function decodeReplyAddress(
  address: string
): { organizationId: string; clientId: string; appointmentId?: string } | null {
  const match = address.match(/^reply\+(.+)@/);
  if (!match) return null;

  // New compact format: reply+<orgId>.<clientId>@domain
  const token = match[1];
  if (token.includes(".")) {
    const [organizationId, clientId] = token.split(".");
    if (organizationId && clientId) {
      return { organizationId, clientId };
    }
  }

  // Backward compatibility: old base64url "org:client[:appointment]"
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const [organizationId, clientId, appointmentId] = decoded.split(":");
    if (!organizationId || !clientId) return null;
    return { organizationId, clientId, appointmentId };
  } catch {
    return null;
  }
}
