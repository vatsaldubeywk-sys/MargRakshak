import { createClient } from "npm:@supabase/supabase-js@2";
import { isEmailConfigured, sendTransactionalEmail } from "../_shared/email.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function hasCronSecret(req: Request): boolean {
  const expected = Deno.env.get("CHECKIN_CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!expected || !provided) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(expected);
  const b = encoder.encode(provided);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  if (!hasCronSecret(req)) return json({ error: "Cron authentication required." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const adminKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !adminKey) return json({ error: "Server configuration is incomplete." }, 500);

  const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const expired = await admin.rpc("expire_safety_sessions");
  const purged = await admin.rpc("purge_expired_location_samples");
  if (expired.error || purged.error) {
    console.error("Could not perform session cleanup.");
    return json({ error: "Could not perform session cleanup." }, 500);
  }
  const claimed = await admin.rpc("claim_overdue_checkins", { p_now: new Date().toISOString() });
  if (claimed.error) {
    console.error("Could not claim overdue sessions.");
    return json({ error: "Could not process overdue sessions." }, 500);
  }

  let processed = 0;
  let emailsAccepted = 0;
  for (const session of claimed.data ?? []) {
    processed++;
    const responders = await admin.from("session_responders")
      .select("contact_id").eq("session_id", session.session_id).eq("owner_id", session.owner_id);
    if (responders.error) continue;

    const ids = [...new Set((responders.data ?? []).map((row) => row.contact_id))];
    const contacts = ids.length
      ? await admin.from("trusted_contacts").select("id,display_name,invited_email")
        .eq("owner_id", session.owner_id).eq("status", "accepted").in("id", ids)
      : { data: [], error: null };
    if (contacts.error) continue;

    if (!contacts.data?.length) {
      await admin.from("safety_sessions").update({ missed_check_in_notified_at: new Date().toISOString() })
        .eq("id", session.session_id).eq("next_check_in_at", session.due_at);
      continue;
    }
    if (!isEmailConfigured()) continue;

    const deliveryRows = await admin.from("alert_deliveries")
      .select("contact_id,status")
      .eq("session_id", session.session_id)
      .eq("due_at", session.due_at)
      .in("contact_id", contacts.data.map((contact) => contact.id));
    if (deliveryRows.error) continue;
    const acceptedContactIds = new Set((deliveryRows.data ?? [])
      .filter((delivery) => delivery.status === "accepted")
      .map((delivery) => delivery.contact_id));
    const pendingContacts = contacts.data.filter((contact) => !acceptedContactIds.has(contact.id));
    if (pendingContacts.length === 0) {
      await admin.from("safety_sessions").update({ missed_check_in_notified_at: new Date().toISOString() })
        .eq("id", session.session_id).eq("next_check_in_at", session.due_at);
      continue;
    }

    const hasLocation = Number.isFinite(session.latitude) && Number.isFinite(session.longitude);
    const mapUrl = hasLocation
      ? `https://www.openstreetmap.org/?mlat=${session.latitude}&mlon=${session.longitude}#map=16/${session.latitude}/${session.longitude}`
      : "No recent location was available.";
    const text = [
      "MARG RAKSHAK MISSED CHECK-IN ALERT",
      "",
      "A safety session missed its 15-minute check-in and the 5-minute grace period has passed.",
      `Last expected check-in: ${new Date(session.due_at).toISOString()}`,
      `Destination: ${session.destination || "Not provided"}`,
      hasLocation
        ? `Last location: ${session.latitude}, ${session.longitude}${Number.isFinite(session.accuracy_m) ? ` (±${Math.round(session.accuracy_m)} m)` : ""}${session.location_at ? `; sampled ${new Date(session.location_at).toISOString()}` : ""}`
        : "Last location: unavailable.",
      `Map: ${mapUrl}`,
      "",
      "Please try to contact the person directly. This alert is not proof of an emergency or a request dispatching emergency services. Call 112 in India if you believe urgent help is needed.",
    ].join("\n");

    const dueKey = String(session.due_at).replace(/[^0-9A-Za-z]/g, "-");
    const attempts = await Promise.all(pendingContacts.map(async (contact) => {
      const key = `mr-missed-${session.session_id}-${dueKey}-${contact.id}`;
      const started = await admin.from("alert_deliveries").upsert({
        session_id: session.session_id,
        contact_id: contact.id,
        due_at: session.due_at,
        status: "pending",
        attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "session_id,contact_id,due_at" });
      if (started.error) return false;
      const attempt = await sendTransactionalEmail(contact.invited_email, "Marg Rakshak: missed check-in", text, key);
      const finished = await admin.from("alert_deliveries").upsert({
        session_id: session.session_id,
        contact_id: contact.id,
        due_at: session.due_at,
        status: attempt.accepted ? "accepted" : "failed",
        attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "session_id,contact_id,due_at" });
      return attempt.accepted && !finished.error;
    }));
    const accepted = attempts.filter(Boolean).length;
    emailsAccepted += accepted;
    if (acceptedContactIds.size + accepted === contacts.data.length) {
      await admin.from("safety_sessions").update({ missed_check_in_notified_at: new Date().toISOString() })
        .eq("id", session.session_id).eq("next_check_in_at", session.due_at);
    }
  }

  return json({ processed, emailsAccepted, deliveryConfirmed: false });
});
