import type { AuthUser } from "@/lib/auth";
import {
  createSessionToken,
  setSessionCookie,
  validateSessionConfiguration,
} from "@/lib/server-session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password;
  if (!username || !password) {
    return Response.json(
      { error: "Enter a username and password." },
      { status: 400 }
    );
  }

  if (!SUPABASE_URL || !ANON_KEY) {
    return Response.json(
      { error: "Supabase login is not configured on the server." },
      { status: 503 }
    );
  }

  try {
    validateSessionConfiguration();
  } catch {
    return Response.json(
      {
        error:
          "Server login is not configured. Set SESSION_SECRET and restart the app.",
      },
      { status: 503 }
    );
  }

  try {
    // ── Direct REST call to the login_user RPC (no Supabase JS client) ──
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/login_user`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        p_username: username,
        p_password: password,
      }),
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      // This is what a Cloudflare 1016 page (or any HTML error page) looks like.
      console.error(
        "[auth/login] non-JSON response from Supabase",
        res.status,
        contentType
      );
      return Response.json(
        {
          error: `Supabase returned ${res.status} (non-JSON). Check that NEXT_PUBLIC_SUPABASE_URL resolves correctly.`,
        },
        { status: 502 }
      );
    }

    const payload = await res.json();

    if (!res.ok) {
      const msg: string =
        payload?.message ?? payload?.error ?? payload?.hint ?? "Login failed.";
      if (/invalid api key/i.test(msg)) {
        return Response.json(
          {
            error:
              "Supabase rejected the API key. Update NEXT_PUBLIC_SUPABASE_ANON_KEY with a current key from this same Supabase project, then restart the app.",
          },
          { status: 503 }
        );
      }
      return Response.json({ error: msg }, { status: 401 });
    }

    // ── Normalise the RPC return shape ──
    let userData: any = payload;
    if (Array.isArray(userData)) {
      userData = userData[0]?.login_user ?? userData[0];
    } else if (
      userData &&
      typeof userData === "object" &&
      "login_user" in userData
    ) {
      userData = userData.login_user;
    }

    if (!userData || userData.is_active === false) {
      return Response.json(
        {
          error: userData
            ? "Your account has been disabled."
            : "Invalid username or password.",
        },
        { status: 401 }
      );
    }

    const user: AuthUser = {
      id: userData.id,
      f_name: userData.f_name,
      email: userData.email ?? "",
      role: userData.role ?? "collector",
      is_active: true,
    };

    await setSessionCookie(createSessionToken(user));
    return Response.json({ user });
  } catch (error) {
    console.error("[auth/login]", error);
    return Response.json({ error: "Login failed." }, { status: 500 });
  }
}