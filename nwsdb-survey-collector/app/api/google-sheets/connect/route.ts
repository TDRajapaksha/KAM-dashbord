import { getSessionUser, signOAuthState } from "@/lib/server-session";
import {
  buildGoogleAuthorizationUrl,
  checkProjectOwner,
  extractSpreadsheetId,
  getSheetConnection,
} from "@/lib/google-sheets";

export async function GET(request: Request) {
  const user = getSessionUser();
  if (!user) return Response.json({ error: "Sign in again to continue." }, { status: 401 });

  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
  try {
    if (!(await checkProjectOwner(projectId, user.id))) {
      return Response.json({ error: "Only the project owner can connect a sheet." }, { status: 403 });
    }
    const connection = await getSheetConnection(projectId);
    return Response.json({
      connected: Boolean(connection),
      spreadsheetUrl: connection
        ? `https://docs.google.com/spreadsheets/d/${connection.spreadsheet_id}/edit`
        : null,
      lastSyncedAt: connection?.last_synced_at ?? null,
      lastSyncError: connection?.last_sync_error ?? null,
    });
  } catch (error) {
    console.error("[google-sheets/status]", error);
    return Response.json({ error: "Could not load Google Sheets status." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = getSessionUser();
  if (!user) return Response.json({ error: "Sign in again to continue." }, { status: 401 });

  let body: { projectId?: string; spreadsheetUrl?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const projectId = body.projectId?.trim() ?? "";
  if (!projectId || !body.spreadsheetUrl?.trim()) {
    return Response.json({ error: "Project and spreadsheet URL are required." }, { status: 400 });
  }

  try {
    if (!(await checkProjectOwner(projectId, user.id))) {
      return Response.json({ error: "Only the project owner can connect a sheet." }, { status: 403 });
    }
    const spreadsheetId = extractSpreadsheetId(body.spreadsheetUrl);
    const stateData = Buffer.from(
      JSON.stringify({
        projectId,
        userId: user.id,
        spreadsheetId,
        expiresAt: Math.floor(Date.now() / 1000) + 10 * 60,
      })
    ).toString("base64url");
    const state = `${stateData}.${signOAuthState(stateData)}`;
    return Response.json({ authorizationUrl: buildGoogleAuthorizationUrl(state) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Google authorization.";
    console.error("[google-sheets/connect]", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
