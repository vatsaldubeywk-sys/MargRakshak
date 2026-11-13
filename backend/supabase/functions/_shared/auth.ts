import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
export const preflight = (req: Request) => req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
export async function authorize(req: Request): Promise<{ userId: string; email: string; emailConfirmed: boolean; admin: SupabaseClient } | Response> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in required." }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !secretKey) return json({ error: "Server configuration is incomplete." }, 500);

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return json({ error: "Invalid session." }, 401);
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { userId: data.user.id, email: data.user.email?.toLowerCase() ?? "", emailConfirmed: Boolean(data.user.email_confirmed_at), admin };
}
export const isResponse = (value: unknown): value is Response => value instanceof Response;

