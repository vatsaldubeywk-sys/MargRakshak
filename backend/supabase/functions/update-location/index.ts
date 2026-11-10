import { authorize, isResponse, json, preflight } from "../_shared/auth.ts";
Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  const auth = await authorize(req); if (isResponse(auth)) return auth;
  try {
    const b = await req.json();
    const lat = Number(b.latitude), lon = Number(b.longitude), accuracy = Number(b.accuracyM);
    if (typeof b.sessionId !== "string" || typeof b.sampleKey !== "string" || !/^[0-9a-f-]{36}$/i.test(b.sampleKey) || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000) return json({ error: "Invalid location sample." }, 400);
    const session = await auth.admin.from("safety_sessions").select("id,status").eq("id", b.sessionId).eq("owner_id", auth.userId).in("status", ["active", "alert"]).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!session.data) return json({ error: "Active session not found." }, 404);
    const sample = await auth.admin.from("location_samples").upsert({ session_id: b.sessionId, owner_id: auth.userId, sample_key: b.sampleKey, latitude: lat, longitude: lon, accuracy_m: accuracy }, { onConflict: "session_id,sample_key", ignoreDuplicates: true }).select("id");
    if (sample.error) return json({ error: "Could not save location." }, 500);
    if (!sample.data?.length) return json({ accepted: true, duplicate: true });
    const update = await auth.admin.from("safety_sessions").update({ last_latitude: lat, last_longitude: lon, last_accuracy_m: accuracy, last_location_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString() }).eq("id", b.sessionId).eq("owner_id", auth.userId);
    if (update.error) return json({ error: "Could not update session status." }, 500);
    return json({ accepted: true });
  } catch { return json({ error: "Invalid request." }, 400); }
});


