import { prisma } from "@bookai/db";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  status?: string;
}

interface GoogleEventsListResponse {
  items?: GoogleCalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

// -------------------------------------------------------------------
// Token management
// -------------------------------------------------------------------

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json();
}

async function refreshAccessToken(syncId: string): Promise<string> {
  const sync = await prisma.calendarSync.findUniqueOrThrow({ where: { id: syncId } });

  // If token is still valid (with 5 min buffer), return it
  if (sync.tokenExpiry > new Date(Date.now() + 5 * 60 * 1000)) {
    return sync.accessToken;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: sync.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

  const tokens: GoogleTokenResponse = await res.json();
  const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.calendarSync.update({
    where: { id: syncId },
    data: {
      accessToken: tokens.access_token,
      tokenExpiry,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    },
  });

  return tokens.access_token;
}

// -------------------------------------------------------------------
// Push to Google Calendar
// -------------------------------------------------------------------

export async function pushAppointmentToGoogle(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { client: true, service: true, staffMember: true },
  });

  // Find an active calendar sync for this organization (or specific staff member)
  const sync = await prisma.calendarSync.findFirst({
    where: {
      organizationId: appointment.organizationId,
      isActive: true,
      syncDirection: { in: ["ONE_WAY_PUSH", "TWO_WAY"] },
      OR: [
        { staffMemberId: appointment.staffMemberId },
        { staffMemberId: null },
      ],
    },
    orderBy: { staffMemberId: "desc" }, // Prefer staff-specific sync
  });

  if (!sync) return; // No sync configured

  const accessToken = await refreshAccessToken(sync.id);

  const event: GoogleCalendarEvent = {
    summary: `${appointment.client.firstName} ${appointment.client.lastName ?? ""} — ${appointment.service.name}`.trim(),
    description: appointment.notes ?? undefined,
    start: { dateTime: appointment.startTime.toISOString() },
    end: { dateTime: appointment.endTime.toISOString() },
  };

  if (appointment.externalCalendarId) {
    // Update existing event
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(sync.calendarId)}/events/${encodeURIComponent(appointment.externalCalendarId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Google Calendar update failed: ${res.status}`);
    }
  } else {
    // Create new event
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(sync.calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );
    if (!res.ok) throw new Error(`Google Calendar create failed: ${res.status}`);

    const created: GoogleCalendarEvent = await res.json();
    if (created.id) {
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { externalCalendarId: created.id },
      });
    }
  }

  await prisma.calendarSync.update({
    where: { id: sync.id },
    data: { lastSyncAt: new Date() },
  });
}

export async function deleteGoogleCalendarEvent(
  organizationId: string,
  externalCalendarId: string,
  staffMemberId?: string
): Promise<void> {
  const sync = await prisma.calendarSync.findFirst({
    where: {
      organizationId,
      isActive: true,
      syncDirection: { in: ["ONE_WAY_PUSH", "TWO_WAY"] },
      OR: [
        { staffMemberId: staffMemberId ?? undefined },
        { staffMemberId: null },
      ],
    },
  });

  if (!sync) return;

  const accessToken = await refreshAccessToken(sync.id);

  await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(sync.calendarId)}/events/${encodeURIComponent(externalCalendarId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

// -------------------------------------------------------------------
// Pull from Google Calendar (incremental sync)
// -------------------------------------------------------------------

export async function pullFromGoogle(syncId: string): Promise<{ created: number; updated: number }> {
  const sync = await prisma.calendarSync.findUniqueOrThrow({ where: { id: syncId } });
  if (!sync.isActive || sync.syncDirection === "ONE_WAY_PUSH") {
    return { created: 0, updated: 0 };
  }

  const accessToken = await refreshAccessToken(sync.id);

  const params = new URLSearchParams({
    maxResults: "100",
    singleEvents: "true",
  });

  if (sync.syncToken) {
    params.set("syncToken", sync.syncToken);
  } else {
    // First sync: only get events from now forward
    params.set("timeMin", new Date().toISOString());
  }

  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(sync.calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 410) {
    // Sync token expired, do full sync
    await prisma.calendarSync.update({
      where: { id: syncId },
      data: { syncToken: null },
    });
    return pullFromGoogle(syncId);
  }

  if (!res.ok) throw new Error(`Google Calendar pull failed: ${res.status}`);

  const data: GoogleEventsListResponse = await res.json();
  let created = 0;
  let updated = 0;

  for (const event of data.items ?? []) {
    if (!event.id || !event.start?.dateTime || !event.end?.dateTime) continue;

    // Check if we already have this event
    const existing = await prisma.appointment.findFirst({
      where: {
        organizationId: sync.organizationId,
        externalCalendarId: event.id,
      },
    });

    if (event.status === "cancelled") {
      if (existing && existing.status !== "CANCELLED") {
        await prisma.appointment.update({
          where: { id: existing.id },
          data: { status: "CANCELLED" },
        });
        updated++;
      }
      continue;
    }

    if (existing) {
      // Update times if changed
      const newStart = new Date(event.start.dateTime);
      const newEnd = new Date(event.end.dateTime);
      if (
        existing.startTime.getTime() !== newStart.getTime() ||
        existing.endTime.getTime() !== newEnd.getTime()
      ) {
        await prisma.appointment.update({
          where: { id: existing.id },
          data: { startTime: newStart, endTime: newEnd },
        });
        updated++;
      }
    }
    // Note: We don't create new appointments from Google events by default
    // since they wouldn't have a client/service. Business owners can opt-in
    // to creating blocked-time entries from external events in a future version.
  }

  // Save sync token for incremental sync next time
  if (data.nextSyncToken) {
    await prisma.calendarSync.update({
      where: { id: syncId },
      data: { syncToken: data.nextSyncToken, lastSyncAt: new Date() },
    });
  }

  return { created, updated };
}

// -------------------------------------------------------------------
// Sync all active connections (for cron)
// -------------------------------------------------------------------

export async function syncAllCalendars(): Promise<{ synced: number; errors: number }> {
  const activeSyncs = await prisma.calendarSync.findMany({
    where: { isActive: true },
  });

  let synced = 0;
  let errors = 0;

  for (const sync of activeSyncs) {
    try {
      await pullFromGoogle(sync.id);
      synced++;
    } catch (err) {
      console.error(`Calendar sync failed for ${sync.id}:`, err);
      errors++;
    }
  }

  return { synced, errors };
}

// -------------------------------------------------------------------
// OAuth URL helper
// -------------------------------------------------------------------

export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
