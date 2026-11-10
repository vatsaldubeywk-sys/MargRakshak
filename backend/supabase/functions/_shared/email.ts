const resendUrl = "https://api.resend.com/emails";

export type EmailAttempt = {
  configured: boolean;
  accepted: boolean;
};

export function isEmailConfigured(): boolean {
  return Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL"));
}

export async function sendTransactionalEmail(
  recipient: string,
  subject: string,
  text: string,
  idempotencyKey: string,
): Promise<EmailAttempt> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from) return { configured: false, accepted: false };

  try {
    const response = await fetch(resendUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from, to: [recipient], subject, text }),
    });
    if (!response.ok) {
      console.error(`Email API rejected a message (HTTP ${response.status}).`);
      return { configured: true, accepted: false };
    }
    return { configured: true, accepted: true };
  } catch {
    console.error("Email API request failed.");
    return { configured: true, accepted: false };
  }
}
