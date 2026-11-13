import {
  deleteResponseFromGoogleSheet,
  syncResponseToGoogleSheet,
  verifySheetsWebhook,
} from "@/lib/google-sheets";

export async function POST(request: Request) {
  if (!verifySheetsWebhook(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let event: {
    type?: string;
    table?: string;
    record?: { id?: string; project_id?: string };
    old_record?: { id?: string; project_id?: string };
  };
  try {
    event = await request.json();
  } catch {
    return Response.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  if (
    event.table !== "responses" ||
    !["INSERT", "UPDATE", "DELETE"].includes(event.type ?? "")
  ) {
    return Response.json({ ignored: true });
  }

  try {
    if (event.type === "DELETE") {
      const deleted = event.old_record;
      if (!deleted?.id || !deleted.project_id) {
        return Response.json({ error: "Missing deleted response details." }, { status: 400 });
      }
      await deleteResponseFromGoogleSheet(deleted.id, deleted.project_id);
    } else {
      if (!event.record?.id) {
        return Response.json({ error: "Missing response details." }, { status: 400 });
      }
      await syncResponseToGoogleSheet(event.record.id);
    }
    return Response.json({ synced: true });
  } catch (error) {
    console.error("[google-sheets/webhook]", error);
    return Response.json(
      { error: "Google Sheets sync failed. The error is saved in project settings." },
      { status: 502 }
    );
  }
}
