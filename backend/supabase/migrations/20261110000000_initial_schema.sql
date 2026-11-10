create extension if not exists pgcrypto;

create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  responder_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  invited_email text not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create table if not exists public.safety_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','alert','ended','expired')),
  destination text check (destination is null or char_length(destination) <= 160),
  created_at timestamptz not null default now(), expires_at timestamptz not null, ended_at timestamptz,
  last_heartbeat_at timestamptz not null default now(), last_latitude double precision,
  last_longitude double precision, last_accuracy_m double precision, last_location_at timestamptz
);
create table if not exists public.session_responders (
  session_id uuid not null references public.safety_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  responder_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.trusted_contacts(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (session_id, responder_id)
);
create table if not exists public.location_samples (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.safety_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, sample_key uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision not null check (accuracy_m between 0 and 10000),
  observed_at timestamptz not null default now(), unique (session_id, sample_key)
);
create table if not exists public.safety_events (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.safety_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, event_key uuid not null,
  event_type text not null check (event_type in ('manual_sos','check_in','resolved')),
  status text not null default 'open' check (status in ('open','resolved')), created_at timestamptz not null default now(),
  unique (session_id, event_key)
);
create index if not exists safety_sessions_owner_status_idx on public.safety_sessions(owner_id, status);
create index if not exists session_responders_responder_idx on public.session_responders(responder_id, session_id);
create index if not exists location_samples_session_time_idx on public.location_samples(session_id, observed_at desc);

alter table public.trusted_contacts enable row level security;
alter table public.safety_sessions enable row level security;
alter table public.session_responders enable row level security;
alter table public.location_samples enable row level security;
alter table public.safety_events enable row level security;
revoke all on public.trusted_contacts, public.safety_sessions, public.session_responders, public.location_samples, public.safety_events from anon, authenticated;
grant select on public.trusted_contacts, public.safety_sessions, public.session_responders, public.location_samples, public.safety_events to authenticated;
create policy contacts_owner_read on public.trusted_contacts for select to authenticated using (owner_id = (select auth.uid()));
create policy sessions_owner_or_responder_read on public.safety_sessions for select to authenticated using (
 owner_id = (select auth.uid()) or (status in ('active','alert') and expires_at > now() and exists (
  select 1 from public.session_responders r where r.session_id = safety_sessions.id and r.responder_id = (select auth.uid())
 ))
);
create policy responders_participant_read on public.session_responders for select to authenticated using (
 owner_id = (select auth.uid()) or responder_id = (select auth.uid())
);
create policy locations_authorized_read on public.location_samples for select to authenticated using (
 owner_id = (select auth.uid()) or exists (
  select 1 from public.session_responders r join public.safety_sessions s on s.id = r.session_id
  where r.session_id = location_samples.session_id and r.responder_id = (select auth.uid()) and s.status in ('active','alert') and s.expires_at > now()
 )
);
create policy events_authorized_read on public.safety_events for select to authenticated using (
 owner_id = (select auth.uid()) or exists (
  select 1 from public.session_responders r join public.safety_sessions s on s.id = r.session_id
  where r.session_id = safety_events.session_id and r.responder_id = (select auth.uid()) and s.status in ('active','alert') and s.expires_at > now()
 )
);

