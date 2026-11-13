import { authorize, isResponse, json, preflight } from "../_shared/auth.ts";
Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  const auth = await authorize(req); if (isResponse(auth)) return auth;
  try {
    const expired = await auth.admin.rpc("expire_safety_sessions");
    if (expired.error) return json({ error: "Could not verify existing sessions." }, 503);
    const body = await req.json();
    const duration = Number(body.durationMinutes);
    if (![30, 60, 120].includes(duration)) return json({ error: "Choose 30, 60, or 120 minutes." }, 400);
    const ids: string[] = Array.isArray(body.contactIds) ? [...new Set(body.contactIds)].slice(0, 10) : [];
    if (ids.length === 0) return json({ error: "Select at least one accepted trusted contact." }, 400);
    let contacts: any[] = [];
    const result = await auth.admin.from("trusted_contacts").select("id,responder_id,status").eq("owner_id", auth.userId).in("id", ids).eq("status", "accepted");
    if (result.error || result.data.length !== ids.length || result.data.some((c) => !c.responder_id)) return json({ error: "All selected contacts must accept first." }, 409);
    contacts = result.data;
    const startedAt = Date.now();
    const expiresAt = new Date(startedAt + duration * 60000).toISOString();
    const nextCheckInAt = new Date(startedAt + Math.min(15, duration) * 60000).toISOString();
    const created = await auth.admin.from("safety_sessions").insert({
      owner_id: auth.userId,
      destination: typeof body.destination === "string" ? body.destination.slice(0, 160) : null,
      expires_at: expiresAt,
      check_in_interval_minutes: 15,
      check_in_grace_minutes: 5,
      next_check_in_at: nextCheckInAt,
    }).select("id").single();
    if (created.error?.code === "23505") return json({ error: "End your current safety session before starting another." }, 409);
    if (created.error) return json({ error: "Could not start session." }, 500);
    if (contacts.length) {
      const link = await auth.admin.from("session_responders").insert(contacts.map((c) => ({ session_id: created.data.id, owner_id: auth.userId, responder_id: c.responder_id, contact_id: c.id })));
      if (link.error) { await auth.admin.from("safety_sessions").delete().eq("id", created.data.id); return json({ error: "Could not authorize responders." }, 500); }
    }
    return json({ sessionId: created.data.id, expiresAt, nextCheckInAt });
  } catch { return json({ error: "Invalid request." }, 400); }
});
