import { authorize, isResponse, json, preflight } from "../_shared/auth.ts";
Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  const auth = await authorize(req); if (isResponse(auth)) return auth;
  try {
    const { contactId } = await req.json();
    if (typeof contactId !== "string") return json({ error: "Invalid contact." }, 400);
    const result = await auth.admin.from("trusted_contacts").update({ status: "revoked", responder_id: null }).eq("id", contactId).eq("owner_id", auth.userId).select("id").maybeSingle();
    if (result.error) return json({ error: "Could not revoke contact." }, 500);
    if (!result.data) return json({ error: "Contact not found." }, 404);
    await auth.admin.from("session_responders").delete().eq("contact_id", contactId).eq("owner_id", auth.userId);
    return json({ status: "revoked" });
  } catch { return json({ error: "Invalid request." }, 400); }
});
