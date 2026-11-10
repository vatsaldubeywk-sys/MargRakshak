import { authorize, isResponse, json, preflight } from "../_shared/auth.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  const auth = await authorize(req); if (isResponse(auth)) return auth;
  if (!auth.email || !auth.emailConfirmed) return json({ error: "Confirm your email before using contacts." }, 403);
  try {
    const b = await req.json();
    const name = typeof b.displayName === "string" ? b.displayName.trim() : "";
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!name || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === auth.email) return json({ error: "Enter a valid contact name and another person's email." }, 400);
    const result = await auth.admin.from("trusted_contacts").insert({ owner_id: auth.userId, display_name: name, invited_email: email, status: "pending" }).select("id,status").single();
    if (result.error) return json({ error: "Could not create contact invitation." }, 500);

    const inviteText = [
      `Hello,`,
      "",
      `${auth.email} invited you to be a trusted contact in Marg Rakshak.`,
      `Invitation ID: ${result.data.id}`,
      "",
      "To accept, create or sign in to your Marg Rakshak account with this email address, open Trusted contacts, choose Accept invitation ID, and enter the invitation ID above.",
      "You can view a safety session only after accepting the invitation and being selected for that session.",
      "",
      "Marg Rakshak does not contact emergency services. In India, call 112 for an emergency.",
    ].join("\n");
    const emailResult = await sendTransactionalEmail(email, "Trusted contact invitation · Marg Rakshak", inviteText, `mr-invite-${result.data.id}`);
    return json({
      contactId: result.data.id,
      status: "pending",
      invitationSent: emailResult.accepted,
      invitationStatus: emailResult.accepted ? "accepted_by_provider" : emailResult.configured ? "provider_rejected" : "not_configured",
    });
  } catch { return json({ error: "Invalid request." }, 400); }
});
