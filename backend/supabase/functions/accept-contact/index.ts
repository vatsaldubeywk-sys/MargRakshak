import { authorize, isResponse, json, preflight } from "../_shared/auth.ts";
Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  const auth = await authorize(req); if (isResponse(auth)) return auth;
  if (!auth.email || !auth.emailConfirmed) return json({ error: "Confirm your email before using contacts." }, 403);
  try {
    const { contactId } = await req.json();
    if (typeof contactId !== "string") return json({ error: "Invalid invitation." }, 400);
    const result = await auth.admin.from("trusted_contacts").update({ responder_id: auth.userId, status: "accepted", accepted_at: new Date().toISOString() }).eq("id", contactId).eq("invited_email", auth.email).eq("status", "pending").select("id").maybeSingle();
    if (result.error) return json({ error: "Could not accept invitation." }, 500);
    if (!result.data) return json({ error: "Invitation not found for this account." }, 404);
    return json({ status: "accepted" });
  } catch { return json({ error: "Invalid request." }, 400); }
});

