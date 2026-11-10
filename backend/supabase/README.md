# Marg Rakshak Supabase backend

The Android-first application is a .NET MAUI app written in C#. Supabase Auth and seven authenticated Edge Functions back the app. The service-role key stays server-side; only the project URL and publishable key are configured in the app.

## Current deployment status

- Project: `mhdnpgzfpnthrrzuooek` (Mumbai / South Asia, Free plan).
- Migration `20261110000000_initial_schema.sql` is applied remotely and recorded in migration history.
- All seven Edge Functions are ACTIVE.
- `create-contact` and `create-sos` now have local Resend email integration, but those local updates are not deployed yet. The other five deployed functions matched their local source at the last audit.
- The Android app builds; a debug APK is produced under `SafePath/bin/Debug/net10.0-android/publish/`.
- `viewer/index.html` exists locally but is not hosted yet.

## Implemented endpoints

- `create-contact`: stores a pending invitation and emails the invitation ID when the mail provider is configured. Provider acceptance does not prove delivery.
- `accept-contact`: the invited, authenticated account accepts by matching its confirmed email.
- `revoke-contact`: removes an accepted responder from future and active session access.
- `start-session`: creates a session and authorizes only accepted responders.
- `update-location`: validates and stores idempotent location samples for an active session.
- `create-sos`: records an idempotent SOS event and attempts email alerts to the accepted responders for the session when the mail provider is configured.
- `end-session`: ends sharing; RLS stops responders from reading the session.

RLS permits authenticated owners and currently authorized responders to read session data. Client writes are revoked; mutations go through authenticated functions. The Firebase scaffold under `backend/functions` is legacy and is not the active backend design.

## Configure email alerts

The local Edge Functions use the Resend HTTPS API. Resend's current free tier lists 3,000 emails/month with a 100/day limit. Create a Resend account, verify a sender domain, and create an API key with sending access. A verified sender domain is required for sending to real trusted-contact addresses.

In **Supabase Dashboard → Edge Functions → Secrets**, add:

- `RESEND_API_KEY`: the Resend sending API key.
- `RESEND_FROM_EMAIL`: a sender on the verified domain, for example `Marg Rakshak <alerts@your-verified-domain>`.

Never put either value in the mobile app, source files, or chat. After both secrets are configured, run `.\deploy-email.ps1` from this folder and type `DEPLOY-EMAIL` when asked. It deploys only `create-contact` and `create-sos` using Supabase API bundling (Docker is not required).

The app reports when the email API accepts a request; that is not proof the email reached the inbox or that a responder saw it. No server-side missed-check-in timer, email delivery webhook/receipt, responder acknowledgement, push notification, or emergency dispatch is configured yet. For emergencies in India, call 112.

## Deploy a future database migration

The CLI must be signed in first (`npx --yes supabase@latest login`). Run `.\deploy.ps1` from this folder. When prompted, paste the full Session pooler URI from **Supabase Dashboard → MargRakshak → Connect → Session pooler**, replacing `[YOUR-PASSWORD]` locally. The password is hidden at the prompt. The script previews migrations and asks for exact uppercase `APPLY` before changing the database. It uses the IPv4-compatible Mumbai pooler; it does not require `supabase link`.

Function deployment is skipped by default in `deploy.ps1`. Use `-DeployFunctions` only when you intentionally need to redeploy all seven functions; it asks for `DEPLOY-FUNCTIONS` separately.

## Responder viewer

`viewer/index.html` is a static, read-only viewer. It must be hosted on a static HTTPS host before responders can use it. A responder signs in with the same confirmed email used to accept the invitation. The viewer polls RLS-protected session data every 15 seconds and labels locations older than 60 seconds as stale. It does not dispatch responders or confirm that help is coming.

## Local development

1. Install Docker Desktop and the Supabase CLI.
2. From this folder, run `supabase start` to use local Auth, Postgres, and Edge Functions.
3. Apply migrations with `supabase db reset`.
4. Serve functions locally with `supabase functions serve --env-file .env.local`.
5. Keep `.env.local` out of source control. Never put a service-role key in the mobile app.

