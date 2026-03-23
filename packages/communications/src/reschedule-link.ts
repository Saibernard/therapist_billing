import { createHmac, timingSafeEqual } from "crypto";

type RescheduleTokenPayload = {
  o: string; // organizationId
  c: string; // clientId
  a: string; // appointmentId
  exp: number; // unix seconds
};

function getSigningSecret(): string {
  return (
    process.env.RESCHEDULE_LINK_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-reschedule-secret-change-me"
  );
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createRescheduleToken(params: {
  organizationId: string;
  clientId: string;
  appointmentId: string;
  expiresInSeconds?: number;
}): string {
  const payload: RescheduleTokenPayload = {
    o: params.organizationId,
    c: params.clientId,
    a: params.appointmentId,
    exp: Math.floor(Date.now() / 1000) + (params.expiresInSeconds ?? 60 * 60 * 24 * 30),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyRescheduleToken(token: string): RescheduleTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  const expectedBuf = Buffer.from(expectedSignature, "utf-8");
  const actualBuf = Buffer.from(signature, "utf-8");
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      base64UrlDecode(encodedPayload)
    ) as Partial<RescheduleTokenPayload>;
    if (!payload.o || !payload.c || !payload.a || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload as RescheduleTokenPayload;
  } catch {
    return null;
  }
}

export function buildRescheduleBookingUrl(params: {
  slug: string;
  organizationId: string;
  clientId: string;
  appointmentId: string;
  baseUrl?: string;
}): string {
  const token = createRescheduleToken({
    organizationId: params.organizationId,
    clientId: params.clientId,
    appointmentId: params.appointmentId,
  });
  const baseUrl =
    params.baseUrl ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3456";
  return `${baseUrl}/book/${params.slug}?rescheduleToken=${encodeURIComponent(token)}`;
}
