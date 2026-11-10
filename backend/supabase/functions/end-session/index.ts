import { authorize, isResponse, json, preflight } from "../_shared/auth.ts";
Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  const auth = await authorize(req); if (isResponse(auth)) return auth;
  try {
    const { sessionId } = await req.json();
    if (typeof sessionId !== "string") return json({ error: "Invalid session." }, 400);
    const result = await auth.admin.from("safety_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", sessionId).eq("owner_id", auth.userId).in("status", ["active", "alert"]).select("id").maybeSingle();
    if (result.error) return json({ error: "Could not end session." }, 500);
    if (!result.data) return json({ error: "Active session not found." }, 404);
    return json({ status: "ended" });
  } catch { return json({ error: "Invalid request." }, 400); }
});
