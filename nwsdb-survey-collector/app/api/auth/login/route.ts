import { createClient } from "@supabase/supabase-js";
import type { AuthUser } from "@/lib/auth";
import {
  createSessionToken,
  setSessionCookie,
  validateSessionConfiguration,
} from "@/lib/server-session";

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
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
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("login_user", {
      p_username: username,
      p_password: password,
    });

    if (error) {
      if (/invalid api key/i.test(error.message)) {
        return Response.json(
          {
            error:
              "Supabase rejected the API key. Update NEXT_PUBLIC_SUPABASE_ANON_KEY with a current key from this same Supabase project, then restart the app.",
          },
          { status: 503 }
        );
      }
      return Response.json({ error: error.message }, { status: 401 });
    }
    let userData: any = data;
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
      role: userData.is_admin ? "admin" : "collector",
      is_active: true,
    };
    setSessionCookie(createSessionToken(user));
    return Response.json({ user });
  } catch (error) {
    console.error("[auth/login]", error);
    return Response.json({ error: "Login failed." }, { status: 500 });
  }
}
