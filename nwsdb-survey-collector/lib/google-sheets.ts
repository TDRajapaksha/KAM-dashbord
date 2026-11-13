import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase-server";

type Question = { id: string; label: string };
type SyncResponse = {
  id: string;
  project_id: string;
  submitted_by: string | null;
  submitted_at: string;
  answers: Record<string, unknown> | null;
};
type Connection = {
  project_id: string;
  owner_id: string;
  spreadsheet_id: string;
  refresh_token_ciphertext: string;
  question_ids: string[];
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function encryptionKey() {
  const key = Buffer.from(requiredEnv("GOOGLE_TOKEN_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function encryptRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decryptRefreshToken(value: string) {
  const [iv, tag, encrypted, extra] = value.split(".");
  if (!iv || !tag || !encrypted || extra) {
    throw new Error("Stored Google token is invalid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function oauthConfig() {
  return {
    clientId: requiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: requiredEnv("GOOGLE_REDIRECT_URI"),
  };
}

export function buildGoogleAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = oauthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/spreadsheets",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string) {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.refresh_token) {
    throw new Error(
      result.error_description ??
        "Google did not return an offline access token. Revoke the app in Google Account settings and try again."
    );
  }
  return result as { refresh_token: string };
}

function assertWebhookSecret(request: Request) {
  const secret = requiredEnv("SHEETS_WEBHOOK_SECRET");
  const authorization = request.headers.get("authorization") ?? "";
  const normalized = authorization.trim();

  const candidates = [secret, `Bearer ${secret}`];
  for (const candidate of candidates) {
    const expected = Buffer.from(candidate);
    const received = Buffer.from(normalized);
    if (
      expected.length === received.length &&
      timingSafeEqual(expected, received)
    ) {
      return true;
    }
  }

  const bareToken = normalized.replace(/^Bearer\s+/i, "");
  if (bareToken !== normalized) {
    const expected = Buffer.from(secret);
    const received = Buffer.from(bareToken);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  return false;
}
export function isAuthorizedSheetsWebhook(request: Request) {
  return assertWebhookSecret(request);
}

async function getAccessToken(connection: Connection) {
  const { clientId, clientSecret } = oauthConfig();
  const refreshToken = decryptRefreshToken(connection.refresh_token_ciphertext);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description ?? "Could not refresh Google access.");
  }
  return result.access_token as string;
}

async function sheetsRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.error?.message ?? "Google Sheets request failed.";
    throw new Error(message);
  }
  return result as T;
}
function quoteSheetName(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

async function ensureResponsesSheet(accessToken: string, spreadsheetId: string) {
  const spreadsheet = await sheetsRequest<{
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  }>(
    accessToken,
    `spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=sheets.properties(sheetId,title)`
  );
  const existingSheet = spreadsheet.sheets?.find(
    (sheet) => sheet.properties?.title === "Responses"
  );
  if (existingSheet?.properties?.sheetId !== undefined) {
    return existingSheet.properties.sheetId;
  }

  await sheetsRequest(
    accessToken,
    `spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: "Responses" } } }],
      }),
    }
  );
  return ensureResponsesSheet(accessToken, spreadsheetId);
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildHeaders(questionIds: string[], questions: Question[]) {
  const labels = new Map(questions.map((question) => [question.id, question.label]));
  return [
    "Response ID",
    "#",
    "Submitted by",
    "Email",
    "Submitted at",
    ...questionIds.map((id) => labels.get(id) ?? `Question ${id}`),
  ];
}

async function readQuestionIds(
  client: ReturnType<typeof createSupabaseAdmin>,
  connection: Connection
) {
  const ids = Array.isArray(connection.question_ids)
    ? [...connection.question_ids]
    : [];
  const { data: questions, error } = await client
    .from("questions")
    .select("id, label")
    .eq("project_id", connection.project_id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  for (const question of (questions ?? []) as Question[]) {
    if (!ids.includes(question.id)) ids.push(question.id);
  }

  if (JSON.stringify(ids) !== JSON.stringify(connection.question_ids ?? [])) {
    const { error: updateError } = await client
      .from("google_sheet_connections")
      .update({ question_ids: ids })
      .eq("project_id", connection.project_id);
    if (updateError) throw new Error(updateError.message);
  }
  return { ids, questions: (questions ?? []) as Question[] };
}

async function appendResponses(
  connection: Connection,
  responses: SyncResponse[]
) {
  const accessToken = await getAccessToken(connection);
  const client = createSupabaseAdmin();
  await ensureResponsesSheet(accessToken, connection.spreadsheet_id);

  const { ids: questionIds, questions } = await readQuestionIds(
    client,
    connection
  );
  const sheet = quoteSheetName("Responses");
  const valuesPath = `spreadsheets/${encodeURIComponent(
    connection.spreadsheet_id
  )}/values/${encodeURIComponent(`${sheet}!A:A`)}`;
  const existing = await sheetsRequest<{ values?: unknown[][] }>(
    accessToken,
    valuesPath
  );
  const existingRows = existing.values ?? [];
  if (
    existingRows.length > 0 &&
    existingRows[0]?.[0] !== "Response ID"
  ) {
    throw new Error(
      'The "Responses" tab is not empty or was created by another app. Use a blank tab named "Responses".'
    );
  }

  const headers = buildHeaders(questionIds, questions);
  if (existingRows.length === 0) {
    await sheetsRequest(
      accessToken,
      `spreadsheets/${encodeURIComponent(
        connection.spreadsheet_id
      )}/values/${encodeURIComponent(`${sheet}!A1`)}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ values: [headers] }),
      }
    );
  } else {
    await sheetsRequest(
      accessToken,
      `spreadsheets/${encodeURIComponent(
        connection.spreadsheet_id
      )}/values/${encodeURIComponent(`${sheet}!A1`)}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ values: [headers] }),
      }
    );
  }

  const existingIds = new Set(
    existingRows.slice(1).map((row) => String(row[0] ?? ""))
  );
  const existingRowNumbers = new Map(
    existingRows.slice(1).map((row, index) => [String(row[0] ?? ""), index + 2])
  );
  const missing = responses.filter((response) => !existingIds.has(response.id));
  const userIds = Array.from(
    new Set(responses.map((response) => response.submitted_by).filter(Boolean))
  ) as string[];
  const { data: users, error: usersError } =
    userIds.length > 0
      ? await client.from("usersT").select("id, f_name, email").in("id", userIds)
      : { data: [], error: null };
  if (usersError) throw new Error(usersError.message);
  const userMap = new Map(
    (users ?? []).map((user) => [
      user.id,
      { name: user.f_name, email: user.email ?? "" },
    ])
  );

  function responseValues(response: SyncResponse, submissionNumber: number) {
    const user = response.submitted_by
      ? userMap.get(response.submitted_by)
      : undefined;
    const answerMap = response.answers ?? {};
    return [
      response.id,
      submissionNumber,
      user?.name ?? (response.submitted_by ? "App user" : "Anonymous"),
      user?.email ?? "",
      response.submitted_at,
      ...questionIds.map((id) => formatCell(answerMap[id])),
    ];
  }

  const existingUpdates = responses.flatMap((response) => {
    const rowNumber = existingRowNumbers.get(response.id);
    if (!rowNumber) return [];
    return [
      {
        range: `${sheet}!A${rowNumber}`,
        values: [responseValues(response, rowNumber - 1)],
      },
    ];
  });
  if (existingUpdates.length > 0) {
    await sheetsRequest(
      accessToken,
      `spreadsheets/${encodeURIComponent(
        connection.spreadsheet_id
      )}/values:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: existingUpdates,
        }),
      }
    );
  }

  for (let offset = 0; offset < missing.length; offset += 100) {
    const batch = missing.slice(offset, offset + 100);
    const rows = batch.map((response, index) =>
      responseValues(response, existingIds.size + offset + index + 1)
    );
    await sheetsRequest(
      accessToken,
      `spreadsheets/${encodeURIComponent(
        connection.spreadsheet_id
      )}/values/${encodeURIComponent(`${sheet}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        body: JSON.stringify({ values: rows }),
      }
    );
  }
}

export function extractSpreadsheetId(sheetUrl: string) {
  let url: URL;
  try {
    url = new URL(sheetUrl);
  } catch {
    throw new Error("Enter a valid Google Sheets URL.");
  }
  if (url.hostname !== "docs.google.com") {
    throw new Error("Enter a URL from docs.google.com.");
  }
  const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("That URL does not contain a spreadsheet ID.");
  return match[1];
}

export async function syncAllProjectResponses(projectId: string) {
  const client = createSupabaseAdmin();
  const { data: connection, error: connectionError } = await client
    .from("google_sheet_connections")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (connectionError) throw new Error(connectionError.message);
  if (!connection) throw new Error("Google Sheet connection was not saved.");

  const responses: SyncResponse[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("responses")
      .select("id, project_id, submitted_by, submitted_at, answers")
      .eq("project_id", projectId)
      .order("submitted_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as SyncResponse[];
    responses.push(...page);
    if (page.length < pageSize) break;
  }

  await appendResponses(connection as Connection, responses);
  const { error: syncError } = await client
    .from("google_sheet_connections")
    .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
    .eq("project_id", projectId);
  if (syncError) throw new Error(syncError.message);
}

export async function syncResponseToGoogleSheet(responseId: string) {
  const client = createSupabaseAdmin();
  const { data: response, error } = await client
    .from("responses")
    .select("id, project_id, submitted_by, submitted_at, answers")
    .eq("id", responseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!response) return;

  const { data: connection, error: connectionError } = await client
    .from("google_sheet_connections")
    .select("*")
    .eq("project_id", response.project_id)
    .maybeSingle();
  if (connectionError) throw new Error(connectionError.message);
  if (!connection) return;

  try {
    await appendResponses(connection as Connection, [response as SyncResponse]);
    const { error: syncError } = await client
      .from("google_sheet_connections")
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq("project_id", response.project_id);
    if (syncError) throw new Error(syncError.message);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Sheets sync failed.";
    await client
      .from("google_sheet_connections")
      .update({ last_sync_error: message })
      .eq("project_id", response.project_id);
    throw error;
  }
}

export async function deleteResponseFromGoogleSheet(
  responseId: string,
  projectId: string
) {
  const client = createSupabaseAdmin();
  const { data: connection, error } = await client
    .from("google_sheet_connections")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!connection) return;

  const typedConnection = connection as Connection;
  const accessToken = await getAccessToken(typedConnection);
  const sheetId = await ensureResponsesSheet(
    accessToken,
    typedConnection.spreadsheet_id
  );
  const sheet = quoteSheetName("Responses");
  const existing = await sheetsRequest<{ values?: unknown[][] }>(
    accessToken,
    `spreadsheets/${encodeURIComponent(
      typedConnection.spreadsheet_id
    )}/values/${encodeURIComponent(`${sheet}!A:A`)}`
  );
  const rowIndex = (existing.values ?? []).findIndex(
    (row, index) => index > 0 && String(row[0] ?? "") === responseId
  );
  if (rowIndex < 0) return;

  await sheetsRequest(
    accessToken,
    `spreadsheets/${encodeURIComponent(
      typedConnection.spreadsheet_id
    )}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      }),
    }
  );

  const lastRow = (existing.values ?? []).length;
  if (lastRow > 2) {
    const remaining = Array.from({ length: lastRow - 2 }, (_, index) => [
      index + 1,
    ]);
    await sheetsRequest(
      accessToken,
      `spreadsheets/${encodeURIComponent(
        typedConnection.spreadsheet_id
      )}/values/${encodeURIComponent(`${sheet}!B2:B${lastRow - 1}`)}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ values: remaining }),
      }
    );
  }

  const { error: syncError } = await client
    .from("google_sheet_connections")
    .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
    .eq("project_id", projectId);
  if (syncError) throw new Error(syncError.message);
}

export async function checkProjectOwner(projectId: string, userId: string) {
  const client = createSupabaseAdmin();
  const { data, error } = await client
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.owner_id !== userId) return false;
  return true;
}

export function verifySheetsWebhook(request: Request) {
  return isAuthorizedSheetsWebhook(request);
}

export async function getSheetConnection(projectId: string) {
  const client = createSupabaseAdmin();
  const { data, error } = await client
    .from("google_sheet_connections")
    .select("spreadsheet_id, last_synced_at, last_sync_error")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
