import { getSessionUser } from "@/lib/server-session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  return Response.json({ user });
}
