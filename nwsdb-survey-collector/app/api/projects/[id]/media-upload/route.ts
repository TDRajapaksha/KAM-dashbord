import { getSessionUser } from "@/lib/server-session";
import { createSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

const STORAGE_BUCKET = "survey-media";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MEDIA_TYPES = ["Photo", "Audio", "Video", "File"];

function isValidMimeType(questionType: string, mimeType: string) {
  if (questionType === "File") return true;
  const expectedPrefixes: Record<string, string> = {
    Photo: "image/",
    Audio: "audio/",
    Video: "video/",
  };
  const expectedPrefix = expectedPrefixes[questionType];
  return Boolean(expectedPrefix && mimeType.startsWith(expectedPrefix));
}

// ✅ NEW (Next.js 15/16)
export async function POST(
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params; 

  // ✅ FIX 1: Actually get the user from the session
  const user = await getSessionUser(); 

  if (!user) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json(
      {
        error: "File uploads need NEXT_PUBLIC_SUPABASE_URL in the server environment.",
      },
      { status: 503 }
    );
  }
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_SECRET_KEY
  ) {
    return Response.json(
      {
        error:
          "File uploads need a Supabase server key. Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY to .env.local, then restart the app.",
      },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const file = formData.get("file");
  const questionId = formData.get("questionId");
  if (!(file instanceof File) || typeof questionId !== "string") {
    return Response.json(
      { error: "Choose a file for a valid question." },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return Response.json(
      { error: "The selected file is empty." },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: "Files must be 50 MB or smaller." },
      { status: 413 }
    );
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, owner_id, status")
      // ✅ FIX 2: Use projectId here, not params.id
      .eq("id", projectId) 
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    let hasAccess = project.owner_id === user.id;
    if (!hasAccess) {
      const { data: share, error: shareError } = await supabase
        .from("project_shares")
        .select("permission")
        .eq("project_id", project.id)
        .eq("shared_with_user_id", user.id)
        .maybeSingle();
      if (shareError) throw shareError;
      hasAccess = Boolean(share);
    }
    if (!hasAccess) {
      return Response.json({ error: "You don't have access to this project." }, {
        status: 403,
      });
    }
    if (project.status !== "deployed") {
      return Response.json(
        { error: "Files can only be uploaded to a deployed project." },
        { status: 409 }
      );
    }

    const { data: question, error: questionError } = await supabase
      .from("questions")
      .select("type")
      .eq("id", questionId)
      .eq("project_id", project.id)
      .maybeSingle();
    if (questionError) throw questionError;
    if (!question || !MEDIA_TYPES.includes(question.type)) {
      return Response.json(
        { error: "This question does not accept file uploads." },
        { status: 400 }
      );
    }
    if (!isValidMimeType(question.type, file.type)) {
      return Response.json(
        { error: `Choose a valid ${question.type.toLowerCase()} file.` },
        { status: 415 }
      );
    }

    const extension = file.name
      .match(/\.([a-z0-9]{1,10})$/i)?.[1]
      ?.toLowerCase();
    const objectPath = `${project.id}/${crypto.randomUUID()}${
      extension ? `.${extension}` : ""
    }`;
    const contentType =
      question.type === "File" ? "application/octet-stream" : file.type;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, Buffer.from(await file.arrayBuffer()), {
        contentType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);
    return Response.json({ url: data.publicUrl });
  } catch (error) {
    console.error("Media upload failed:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to upload this file.",
      },
      { status: 500 }
    );
  }
}