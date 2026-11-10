import { authorize, isResponse, json, preflight } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  const auth = await authorize(req);
  if (isResponse(auth)) return auth;

  try {
    const body = await req.json();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (typeof body.sessionId !== "string" || !uuid.test(body.sessionId)
        || typeof body.eventKey !== "string" || !uuid.test(body.eventKey)) {
      return json({ error: "Invalid check-in request." }, 400);
    }

    const result = await auth.admin.rpc("record_safety_check_in", {
      p_session_id: body.sessionId,
      p_owner_id: auth.userId,
      p_event_key: body.eventKey,
    });
    if (result.error) return json({ error: "Could not record check-in." }, 500);
    if (!result.data?.success) return json({ error: "This safety session is no longer active." }, 409);
    return json(result.data);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
});
