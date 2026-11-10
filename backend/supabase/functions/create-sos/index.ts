import { authorize, isResponse, json, preflight } from "../_shared/auth.ts";
import { isEmailConfigured, sendTransactionalEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  const auth = await authorize(req); if (isResponse(auth)) return auth;
  try {
    const { sessionId, eventKey } = await req.json();
    if (typeof sessionId !== "string" || typeof eventKey !== "string" || !/^[0-9a-f-]{36}$/i.test(eventKey)) return json({ error: "Invalid event." }, 400);
    const session = await auth.admin.from("safety_sessions")
      .select("id,status,destination")
      .eq("id", sessionId).eq("owner_id", auth.userId)
      .in("status", ["active", "alert"]).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!session.data) return json({ error: "Active session not found." }, 404);

    const upserted = await auth.admin.from("safety_events").upsert(
      { session_id: sessionId, owner_id: auth.userId, event_key: eventKey, event_type: "manual_sos" },
      { onConflict: "session_id,event_key", ignoreDuplicates: true },
    );
    if (upserted.error) return json({ error: "Could not record SOS." }, 500);
    const event = await auth.admin.from("safety_events").select("id,created_at")
      .eq("session_id", sessionId).eq("event_key", eventKey).maybeSingle();
    if (event.error || !event.data) return json({ error: "Could not confirm SOS event." }, 500);

    const statusUpdate = await auth.admin.from("safety_sessions").update({ status: "alert" })
      .eq("id", sessionId).eq("owner_id", auth.userId).in("status", ["active", "alert"]);
    if (statusUpdate.error) console.error("SOS was recorded but session alert status could not be updated.");

    const links = await auth.admin.from("session_responders").select("contact_id").eq("session_id", sessionId).eq("owner_id", auth.userId);
    if (links.error) return json({ recorded: true, notificationStatus: "lookup_failed", emailsAccepted: 0, emailsAttempted: 0, deliveryConfirmed: false });
    const contactIds = [...new Set((links.data ?? []).map((link) => link.contact_id))];
    if (!contactIds.length) return json({ recorded: true, notificationStatus: "no_accepted_contacts", emailsAccepted: 0, emailsAttempted: 0, deliveryConfirmed: false });
    const contacts = await auth.admin.from("trusted_contacts").select("id,display_name,invited_email")
      .eq("owner_id", auth.userId).eq("status", "accepted").in("id", contactIds);
    if (contacts.error) return json({ recorded: true, notificationStatus: "lookup_failed", emailsAccepted: 0, emailsAttempted: 0, deliveryConfirmed: false });
    if (!contacts.data?.length) return json({ recorded: true, notificationStatus: "no_accepted_contacts", emailsAccepted: 0, emailsAttempted: 0, deliveryConfirmed: false });
    if (!isEmailConfigured()) return json({ recorded: true, notificationStatus: "not_configured", emailsAccepted: 0, emailsAttempted: 0, deliveryConfirmed: false });

    const location = await auth.admin.from("location_samples")
      .select("latitude,longitude,accuracy_m,observed_at")
      .eq("session_id", sessionId).eq("owner_id", auth.userId)
      .lte("observed_at", event.data.created_at).order("observed_at", { ascending: false }).limit(1).maybeSingle();
    const point = location.data && Number.isFinite(location.data.latitude) && Number.isFinite(location.data.longitude)
      ? location.data : null;
    const mapUrl = point
      ? `https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=16/${point.latitude}/${point.longitude}`
      : "No location sample was available before this alert.";
    const eventTime = new Date(event.data.created_at).toISOString();
    const text = [
      "MARG RAKSHAK SAFETY ALERT",
      "",
      `${auth.email || "The account owner"} triggered a manual SOS.`,
      `Alert recorded at: ${eventTime}`,
      `Destination: ${session.data.destination || "Not provided"}`,
      point ? `Last location at alert time: ${point.latitude}, ${point.longitude} (±${Math.round(point.accuracy_m)} m; sampled ${new Date(point.observed_at).toISOString()})` : "Last location: unavailable.",
      `Map: ${mapUrl}`,
      "",
      "This email is an alert attempt, not proof of receipt or rescue. Contact the person and call 112 in India if emergency services are needed.",
    ].join("\n");

    const attempts = await Promise.all(contacts.data.map((contact) =>
      sendTransactionalEmail(contact.invited_email, "Marg Rakshak: manual SOS alert", text, `mr-sos-${eventKey}-${contact.id}`)
    ));
    const accepted = attempts.filter((attempt) => attempt.accepted).length;
    const attempted = attempts.filter((attempt) => attempt.configured).length;
    const notificationStatus = accepted === contacts.data.length ? "accepted_by_provider"
      : accepted > 0 ? "partially_accepted" : "provider_rejected";
    return json({ recorded: true, notificationStatus, emailsAccepted: accepted, emailsAttempted: attempted, deliveryConfirmed: false });
  } catch { return json({ error: "Invalid request." }, 400); }
});
