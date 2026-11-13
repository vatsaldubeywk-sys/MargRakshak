-- Ensure one live session per owner and clean up stale records/precise location data.
-- Any duplicate or expired sessions are closed before the invariant is enforced.
update public.safety_sessions
set status = 'expired', ended_at = coalesce(ended_at, now())
where status in ('active', 'alert') and expires_at <= now();

with ranked as (
  select id, row_number() over (partition by owner_id order by created_at desc, id desc) as position
  from public.safety_sessions
  where status in ('active', 'alert') and expires_at > now()
)
update public.safety_sessions s
set status = 'ended', ended_at = coalesce(s.ended_at, now())
from ranked r
where s.id = r.id and r.position > 1;

create unique index if not exists safety_sessions_one_live_per_owner_idx
  on public.safety_sessions(owner_id)
  where status in ('active', 'alert');

create table if not exists public.alert_deliveries (
  session_id uuid not null references public.safety_sessions(id) on delete cascade,
  contact_id uuid not null references public.trusted_contacts(id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'failed')),
  attempted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (session_id, contact_id, due_at)
);
create index if not exists safety_sessions_retention_idx
  on public.safety_sessions(ended_at)
  where status in ('ended', 'expired');
alter table public.alert_deliveries enable row level security;
revoke all on public.alert_deliveries from anon, authenticated;

create or replace function public.expire_safety_sessions(p_now timestamptz default now())
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  update public.safety_sessions
  set status = 'expired', ended_at = coalesce(ended_at, p_now)
  where status in ('active', 'alert') and expires_at <= p_now;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.purge_expired_location_samples(p_now timestamptz default now())
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  delete from public.location_samples l
  using public.safety_sessions s
  where l.session_id = s.id
    and s.status in ('ended', 'expired')
    and s.ended_at <= p_now - interval '24 hours';
  get diagnostics v_count = row_count;
  delete from public.safety_sessions
  where status in ('ended', 'expired')
    and ended_at <= p_now - interval '90 days';
  return v_count;
end;
$$;

revoke all on function public.expire_safety_sessions(timestamptz) from public, anon, authenticated;
revoke all on function public.purge_expired_location_samples(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_safety_sessions(timestamptz) to service_role;
grant execute on function public.purge_expired_location_samples(timestamptz) to service_role;

create policy contacts_active_responder_read on public.trusted_contacts for select to authenticated using (
  exists (
    select 1 from public.session_responders r
    join public.safety_sessions s on s.id = r.session_id
    where r.contact_id = trusted_contacts.id
      and r.responder_id = (select auth.uid())
      and s.status in ('active', 'alert')
      and s.expires_at > now()
  )
);
