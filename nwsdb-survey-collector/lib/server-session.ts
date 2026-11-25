import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { AuthUser } from "@/lib/auth";

const COOKIE_NAME = "dbtool-session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return secret;
}

export function validateSessionConfiguration() {
  getSessionSecret();
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(user: AuthUser) {
  const payload = Buffer.from(
    JSON.stringify({
      user,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
    })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// ✅ NEW: Added async
export async function getSessionUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies(); // ✅ NEW: Await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value;
  
  if (!token) return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { user?: AuthUser; expiresAt?: number };
    if (
      !parsed.user?.id ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return parsed.user;
  } catch {
    return null;
  }
}

// ✅ NEW: Added async
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies(); // ✅ NEW: Await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

// ✅ NEW: Added async
export async function clearSessionCookie() {
  const cookieStore = await cookies(); // ✅ NEW: Await cookies()
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function signOAuthState(value: string) {
  return sign(value);
}

export function verifyOAuthState(value: string, signature: string) {
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}