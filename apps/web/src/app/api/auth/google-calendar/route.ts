import { NextResponse } from "next/server";
import { prisma } from "@bookai/db";
import { exchangeCodeForTokens } from "@bookai/scheduling";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?calendarError=denied", request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?calendarError=missing_params", request.url)
    );
  }

  try {
    // State format: {userId}_{organizationId}_{staffMemberId?}
    const [userId, organizationId, staffMemberId] = state.split("_");

    const redirectUri = `${url.origin}/api/auth/google-calendar`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.calendarSync.upsert({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      create: {
        organizationId,
        userId,
        staffMemberId: staffMemberId || null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? "",
        tokenExpiry,
        isActive: true,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        tokenExpiry,
        isActive: true,
        staffMemberId: staffMemberId || null,
      },
    });

    return NextResponse.redirect(
      new URL("/dashboard/settings?calendarConnected=true", request.url)
    );
  } catch (err) {
    console.error("Google Calendar OAuth error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/settings?calendarError=exchange_failed", request.url)
    );
  }
}
