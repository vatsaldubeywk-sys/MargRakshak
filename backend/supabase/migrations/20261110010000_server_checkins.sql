alter table public.safety_sessions
  add column if not exists check_in_interval_minutes smallint not null default 15
    check (check_in_interval_minutes between 5 and 120),
  add column if not exists check_in_grace_minutes smallint not null default 5
    check (check_in_grace_minutes between 1 and 30),
  add column if not exists next_check_in_at timestamptz,
  add column if not exists missed_check_in_at timestamptz,
  add column if not exists missed_check_in_claimed_at timestamptz,
  add column if not exists missed_check_in_notified_at timestamptz;

alter table public.safety_events drop constraint if exists safety_events_event_type_check;
alter table public.safety_events
  add constraint safety_events_event_type_check
  check (event_type in ('manual_sos','check_in','missed_check_in','resolved'));

create index if not exists safety_sessions_checkin_due_idx
  on public.safety_sessions(status, next_check_in_at)
  where next_check_in_at is not null;

create or replace function public.record_safety_check_in(
  p_session_id uuid,
  p_owner_id uuid,
  p_event_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.safety_sessions%rowtype;
  v_event_id uuid;
  v_next_check_in_at timestamptz;
  v_manual_sos_open boolean;
  v_result_status text;
begin
  select * into v_session
  from public.safety_sessions
  where id = p_session_id and owner_id = p_owner_id
  for update;

  if not found or v_session.status not in ('active','alert') or v_session.expires_at <= now() then
    return jsonb_build_object('success', false, 'status', 'session_unavailable');
  end if;

  insert into public.safety_events(session_id, owner_id, event_key, event_type)
  values (p_session_id, p_owner_id, p_event_key, 'check_in')
  on conflict (session_id, event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'status', v_session.status,
      'nextCheckInAt', v_session.next_check_in_at
    );
  end if;

  v_next_check_in_at := least(
    now() + make_interval(mins => v_session.check_in_interval_minutes),
    v_session.expires_at
  );

  select exists (
    select 1 from public.safety_events
    where session_id = p_session_id
      and owner_id = p_owner_id
      and event_type = 'manual_sos'
      and status = 'open'
  ) into v_manual_sos_open;
  v_result_status := case when v_manual_sos_open then 'alert' else 'active' end;

  update public.safety_sessions
  set status = v_result_status,
      last_heartbeat_at = now(),
      next_check_in_at = v_next_check_in_at,
      missed_check_in_at = null,
      missed_check_in_claimed_at = null,
      missed_check_in_notified_at = null
  where id = p_session_id and owner_id = p_owner_id;

  update public.safety_events
  set status = 'resolved'
  where session_id = p_session_id
    and owner_id = p_owner_id
    and event_type = 'missed_check_in'
    and status = 'open';

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'status', v_result_status,
    'nextCheckInAt', v_next_check_in_at
  );
end;
$$;

create or replace function public.claim_overdue_checkins(p_now timestamptz default now())
returns table (
  session_id uuid,
  owner_id uuid,
  destination text,
  due_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  location_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.safety_sessions%rowtype;
  v_event_key uuid;
begin
  for v_session in
    select s.*
    from public.safety_sessions s
    where s.status in ('active','alert')
      and s.expires_at > p_now
      and s.next_check_in_at is not null
      and s.next_check_in_at + make_interval(mins => s.check_in_grace_minutes) <= p_now
      and s.missed_check_in_notified_at is null
      and (s.missed_check_in_claimed_at is null or s.missed_check_in_claimed_at < p_now - interval '5 minutes')
    order by s.next_check_in_at
    limit 50
    for update skip locked
  loop
    update public.safety_sessions s
    set status = 'alert',
        missed_check_in_at = coalesce(s.missed_check_in_at, p_now),
        missed_check_in_claimed_at = p_now
    where s.id = v_session.id;

    v_event_key := md5(v_session.id::text || ':' || extract(epoch from v_session.next_check_in_at)::text)::uuid;
    insert into public.safety_events(session_id, owner_id, event_key, event_type)
    values (v_session.id, v_session.owner_id, v_event_key, 'missed_check_in')
    on conflict (session_id, event_key) do nothing;

    session_id := v_session.id;
    owner_id := v_session.owner_id;
    destination := v_session.destination;
    due_at := v_session.next_check_in_at;
    latitude := v_session.last_latitude;
    longitude := v_session.last_longitude;
    accuracy_m := v_session.last_accuracy_m;
    location_at := v_session.last_location_at;
    return next;
  end loop;
end;
$$;

revoke all on function public.record_safety_check_in(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_overdue_checkins(timestamptz) from public, anon, authenticated;
grant execute on function public.record_safety_check_in(uuid, uuid, uuid) to service_role;
grant execute on function public.claim_overdue_checkins(timestamptz) to service_role;
