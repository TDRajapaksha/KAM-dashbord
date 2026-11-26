"use client";

export type AuthUser = {
  id: string;
  f_name: string;
  email: string;
  role: "admin" | "collector";
  is_active: boolean;
};

const STORAGE_KEY = "dbtool-admin-user";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ═══════════════════════════════════════════════════════════
// SESSION
// ═══════════════════════════════════════════════════════════

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "admin";
}

// ═══════════════════════════════════════════════════════════
// LOGIN — creates an HttpOnly server session after password verification.
// The actual Supabase call happens in /api/auth/login (server-side),
// which uses fetch against the REST API — no Supabase client library.
// ═══════════════════════════════════════════════════════════

export async function login(
  username: string,
  password: string
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  if (!username.trim() || !password) {
    return { ok: false, error: "Enter a username and password." };
  }

  let response: Response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
    });
  } catch {
    return { ok: false, error: "Network error — could not reach the server." };
  }

  // Guard against non-JSON bodies (e.g. a Cloudflare 1016 HTML error page).
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      error: `Server returned ${response.status} (non-JSON). Check that the Supabase URL resolves.`,
    };
  }

  const result = await response.json();
  if (!response.ok) return { ok: false, error: result.error ?? "Login failed." };

  const user = result.user as AuthUser;
  setUser(user);
  return { ok: true, user };
}

// ═══════════════════════════════════════════════════════════
// REGISTER — calls the register_user RPC directly over REST
// (bypasses the Supabase JS client to avoid Worker DNS issues)
// ═══════════════════════════════════════════════════════════

export async function register({
  fName,
  email,
  password,
  lName,
  phone,
}: {
  fName: string;
  email: string;
  password: string;
  lName?: string;
  phone?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!fName.trim() || !email.trim() || !password) {
    return { ok: false, error: "Please fill in all required fields." };
  }
  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/register_user`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        p_f_name: fName.trim(),
        p_email: email.trim().toLowerCase(),
        p_password: password,
        p_phone: phone?.trim() ?? "",
        p_l_name: lName?.trim() ?? "",
      }),
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {
        ok: false,
        error: `Server returned ${res.status} (non-JSON). Check that the Supabase URL resolves.`,
      };
    }

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.message ?? data?.error ?? "Registration failed." };
    }

    // Normalise the various shapes the RPC might return.
    let row: any = data;
    if (Array.isArray(row)) {
      row = row[0]?.register_user ?? row[0];
    } else if (row && typeof row === "object" && "register_user" in row) {
      row = row.register_user;
    }
    if (row && row.success === false) {
      return { ok: false, error: row.error ?? "Registration failed." };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Registration failed." };
  }
}

// ═══════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════

export function logout() {
  if (typeof window !== "undefined") {
    void fetch("/api/auth/logout", { method: "POST", keepalive: true });
  }
  clearUser();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}