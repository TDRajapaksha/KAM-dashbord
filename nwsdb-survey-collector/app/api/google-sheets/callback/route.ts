import { createSupabaseAdmin } from "@/lib/supabase-server";
import {
  checkProjectOwner,
  encryptRefreshToken,
  exchangeGoogleCode,
  syncAllProjectResponses,
} from "@/lib/google-sheets";
import {
  getSessionUser,
  verifyOAuthState,
} from "@/lib/server-session";

function projectSettingsUrl(request: Request, projectId: string, result: string) {
  const url = new URL(`/projects/${encodeURIComponent(projectId)}`, request.url);
  url.searchParams.set("tab", "settings");
  url.searchParams.set("googleSheets", result);
  return url;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const [encodedState, signature, extra] = state.split(".");
  if (!encodedState || !signature || extra || !verifyOAuthState(encodedState, signature)) {
    return Response.redirect(new URL("/projects?googleSheets=invalid-state", request.url));
  }

  let payload: {
    projectId: string;
    userId: string;
    spreadsheetId: string;
    expiresAt: number;
  };
  try {
    payload = JSON.parse(
      Buffer.from(encodedState, "base64url").toString("utf8")
    );
    if (
      !payload.projectId ||
      !payload.userId ||
      !payload.spreadsheetId ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      throw new Error("Expired authorization request.");
    }
  } catch {
    return Response.redirect(new URL("/projects?googleSheets=invalid-state", request.url));
  }

  const sessionUser = getSessionUser();
  if (!sessionUser || sessionUser.id !== payload.userId) {
    return Response.redirect(projectSettingsUrl(request, payload.projectId, "session-expired"));
  }
  if (oauthError || !code) {
    return Response.redirect(projectSettingsUrl(request, payload.projectId, "cancelled"));
  }

  try {
    if (!(await checkProjectOwner(payload.projectId, sessionUser.id))) {
      return Response.redirect(projectSettingsUrl(request, payload.projectId, "not-owner"));
    }
    const tokens = await exchangeGoogleCode(code);
    const client = createSupabaseAdmin();
    const { data: previous, error: previousError } = await client
      .from("google_sheet_connections")
      .select("question_ids, spreadsheet_id")
      .eq("project_id", payload.projectId)
      .maybeSingle();
    if (previousError) throw new Error(previousError.message);

    const { error: saveError } = await client
      .from("google_sheet_connections")
      .upsert(
        {
          project_id: payload.projectId,
          owner_id: sessionUser.id,
          spreadsheet_id: payload.spreadsheetId,
          refresh_token_ciphertext: encryptRefreshToken(tokens.refresh_token),
          question_ids:
            previous?.spreadsheet_id === payload.spreadsheetId
              ? previous.question_ids
              : [],
          last_sync_error: null,
          last_synced_at:
            previous?.spreadsheet_id === payload.spreadsheetId
              ? undefined
              : null,
        },
        { onConflict: "project_id" }
      );
    if (saveError) throw new Error(saveError.message);

    try {
      await syncAllProjectResponses(payload.projectId);
      return Response.redirect(projectSettingsUrl(request, payload.projectId, "connected"));
    } catch (error) {
      console.error("[google-sheets/initial-sync]", error);
      const { error: updateError } = await client
        .from("google_sheet_connections")
        .update({
          last_sync_error:
            error instanceof Error ? error.message : "Initial sync failed.",
        })
        .eq("project_id", payload.projectId);
      if (updateError) console.error("[google-sheets/save-sync-error]", updateError);
      return Response.redirect(projectSettingsUrl(request, payload.projectId, "sync-error"));
    }
  } catch (error) {
    console.error("[google-sheets/callback]", error);
    return Response.redirect(projectSettingsUrl(request, payload.projectId, "error"));
  }
}
