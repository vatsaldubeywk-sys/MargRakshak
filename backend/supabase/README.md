# Marg Rakshak Supabase backend

The Android-first application is a .NET MAUI app written in C#. Supabase Auth and nine Edge Functions back the app. The mobile app uses only the project URL and publishable key; secret API keys stay server-side.

## Current deployment status

- Project: `mhdnpgzfpnthrrzuooek` (Mumbai / South Asia, Free plan).
- Migrations `20261110000000_initial_schema.sql`, `20261110010000_server_checkins.sql`, and `20261113000000_safety_hardening.sql` are applied and recorded remotely.
- All nine Edge Functions are deployed. They enforce one live session per owner, require an accepted responder for a new session, and track missed-check-in delivery per contact.
- Cron job `marg-rakshak-missed-checkins` is active every minute. It processes missed check-ins, closes expired sessions, and purges location samples after 24 hours and ended-session records after 90 days.
- `CHECKIN_CRON_SECRET` is stored in Edge Function Secrets, and its matching token plus the project URL are stored in Vault.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are not configured yet. Until they are added, no contact email can be sent.
- Android local reminder notifications are implemented. The user must grant notification permission for the phone reminder to appear.
- Android location sampling uses available GPS and network providers. SOS requires a 2.5-second hold.
- Continuous background safety sessions are Android-only. The iOS target does not implement background location and must not be used to start a safety session.
- Android build succeeds. Distribute a standalone Release APK; Debug Fast Deployment APKs are for development and will not run by themselves.
- `viewer/index.html` exists locally but is not hosted yet.

## Implemented endpoints

- `create-contact`: stores a pending invitation and emails the invitation ID when the mail provider is configured. Provider acceptance does not prove delivery.
- `accept-contact`: the invited, authenticated account accepts by matching its confirmed email.
- `revoke-contact`: removes an accepted responder from future and active session access.
- `start-session`: creates a session and authorizes only accepted responders.
- `update-location`: validates and stores idempotent location samples for an active session.
- `create-sos`: records an idempotent SOS event and attempts email alerts to the accepted responders for the session when the mail provider is configured.
- `check-in`: records a check-in transactionally and resets the next due time.
- `process-missed-checkins`: a Cron-token-protected scheduled function that claims overdue sessions and sends idempotent email alerts.
- `end-session`: ends sharing; RLS stops responders from reading the session.

RLS permits authenticated owners and currently authorized responders to read session data. Client writes are revoked; mutations go through authenticated functions. The Firebase scaffold under `backend/functions` is legacy and is not the active backend design.

## Configure email alerts

The local Edge Functions use the Resend HTTPS API. Resend's current free tier lists 3,000 emails/month with a 100/day limit. Create a Resend account, verify a sender domain, and create an API key with sending access. A verified sender domain is required for sending to real trusted-contact addresses.

In **Supabase Dashboard → Edge Functions → Secrets**, add:

- `RESEND_API_KEY`: the Resend sending API key.
- `RESEND_FROM_EMAIL`: a sender on the verified domain, for example `Marg Rakshak <alerts@your-verified-domain>`.

Never put either value in the mobile app, source files, or chat. Add both secrets in **Supabase Dashboard → Edge Functions → Secrets**. The functions are already deployed and read secrets at runtime, so adding them does not require another deployment. Run `.\deploy-email.ps1` only after future local function changes, then confirm with `DEPLOY-EMAIL`.

The app reports when the email API accepts a request; that is not proof the email reached the inbox or that a responder saw it. The Android phone reminder appears at the scheduled check-in time when notification permission is allowed. Contact email alerts remain unavailable until the Resend secrets are configured. No email delivery receipt, responder acknowledgement, remote push notification, or emergency dispatch is configured. For emergencies in India, call 112.

## Schedule missed-check-in processing

The production job is already active every minute. The block below is for a fresh project or a deliberate job recreation; do not rerun its `vault.create_secret` statements on this project. Enable `pg_cron`, `pg_net`, and `supabase_vault` in **Database → Extensions**. Add a random `CHECKIN_CRON_SECRET` in **Edge Functions → Secrets**, then store that token and the project URL in Vault before scheduling. This dedicated token does not grant database access; the function checks it before using its server-side Supabase client. Never put it in the mobile app or migration.

```sql
select vault.create_secret('https://mhdnpgzfpnthrrzuooek.supabase.co', 'marg_rakshak_project_url');
select vault.create_secret('PASTE_THE_SAME_CHECKIN_CRON_SECRET_HERE', 'marg_rakshak_cron_token');

select cron.schedule(
  'marg-rakshak-missed-checkins',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'marg_rakshak_project_url') || '/functions/v1/process-missed-checkins',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'marg_rakshak_cron_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $$
);

select jobname, schedule, active from cron.job where jobname = 'marg-rakshak-missed-checkins';

-- Inspect recent runs:
select start_time, end_time, status, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'marg-rakshak-missed-checkins')
order by start_time desc limit 10;

-- Stop the job later:
-- select cron.unschedule('marg-rakshak-missed-checkins');
```

Run `vault.create_secret` once per name. Review Cron run history and Edge Function logs after enabling it. Cron invokes the function every minute, so a late-check-in email may be attempted about five to six minutes after its due time. The alert is an attempt to contact trusted people; it cannot verify delivery or confirm that help is coming.

## Deploy a future database migration

The CLI must be signed in first (`npx --yes supabase@latest login`). Run `.\deploy.ps1` from this folder. When prompted, paste the full Session pooler URI from **Supabase Dashboard → MargRakshak → Connect → Session pooler**, replacing `[YOUR-PASSWORD]` locally. The password is hidden at the prompt. The script previews migrations and asks for exact uppercase `APPLY` before changing the database. It uses the IPv4-compatible Mumbai pooler; it does not require `supabase link`.

Function deployment is skipped by default in `deploy.ps1`. Use `-DeployFunctions` only when you intentionally need to deploy all nine local functions; it asks for `DEPLOY-FUNCTIONS` separately.

## Responder viewer

`viewer/index.html` is a static, read-only viewer. It must be hosted on a static HTTPS host before responders can use it. A responder signs in with the same confirmed email used to accept the invitation. The viewer polls RLS-protected session data every 15 seconds and warns when the last location is older than 90 seconds. It does not dispatch responders or confirm that help is coming.

## Local development

1. Install Docker Desktop and the Supabase CLI.
2. From this folder, run `supabase start` to use local Auth, Postgres, and Edge Functions.
3. Apply migrations with `supabase db reset`.
4. Serve functions locally with `supabase functions serve --env-file .env.local`.
5. Keep `.env.local` out of source control. Never put a service-role key in the mobile app.

