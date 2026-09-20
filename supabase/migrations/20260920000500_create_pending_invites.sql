-- D2026-09-20-08: a room exists only after an invitee accepts an invitation.
-- The old waiting rooms were test artifacts created before this boundary change.
delete from public.rooms where status = 'waiting';

drop function if exists public.create_room_with_invite(char(6), text);
drop function if exists public.accept_invite(char(6), text);
drop table if exists public.invites;

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms add constraint rooms_status_check check (status in ('active', 'closed'));
alter table public.rooms alter column status set default 'active';

create table public.pending_invites (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references public.profiles(id) on delete cascade,
  code char(6) not null unique check (code ~ '^[0-9]{6}$'),
  link_token_digest text not null unique,
  status text not null check (status in ('active', 'used', 'expired', 'revoked')) default 'active',
  expires_at timestamptz,
  used_by_user_id uuid references public.profiles(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index pending_invites_one_active_creator_idx
  on public.pending_invites(creator_user_id) where status = 'active';

alter table public.pending_invites enable row level security;
revoke all on table public.pending_invites from anon, authenticated;

create or replace function public.create_pending_invite(p_code char(6), p_token_digest text)
returns table(invite_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  if exists (
    select 1 from public.room_members m join public.rooms r on r.id = m.room_id
    where m.user_id = v_user and r.status = 'active'
  ) then return query select null::uuid, 'active_room_exists'; return; end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    return query select null::uuid, 'profile_not_found'; return;
  end if;

  select id into invite_id from public.pending_invites
    where creator_user_id = v_user and status = 'active' for update;
  if found then
    update public.pending_invites
      set code = p_code, link_token_digest = p_token_digest, created_at = now()
      where id = invite_id;
  else
    insert into public.pending_invites(creator_user_id, code, link_token_digest)
      values(v_user, p_code, p_token_digest) returning id into invite_id;
  end if;
  return query select invite_id, null::text;
exception when unique_violation then
  return query select null::uuid, 'invite_generation_failed';
end; $$;

create or replace function public.accept_pending_invite(p_code char(6), p_token_digest text)
returns table(room_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.pending_invites%rowtype;
  v_creator_name text;
  v_invitee_name text;
  v_creator_hash integer;
  v_user_hash integer;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  select * into v_invite from public.pending_invites
    where (p_code is not null and code = p_code)
       or (p_token_digest is not null and link_token_digest = p_token_digest)
    for update;
  if not found then return query select null::uuid, 'invalid_invite'; return; end if;
  if v_invite.status in ('expired', 'revoked')
     or (v_invite.expires_at is not null and v_invite.expires_at <= now()) then
    return query select null::uuid, 'invite_expired_or_revoked'; return;
  end if;
  if v_invite.status <> 'active' then return query select null::uuid, 'invite_used_or_full'; return; end if;
  if v_invite.creator_user_id = v_user then return query select null::uuid, 'invalid_invite'; return; end if;

  v_creator_hash := hashtext(v_invite.creator_user_id::text);
  v_user_hash := hashtext(v_user::text);
  if v_creator_hash < v_user_hash then
    perform pg_advisory_xact_lock(v_creator_hash); perform pg_advisory_xact_lock(v_user_hash);
  else
    perform pg_advisory_xact_lock(v_user_hash); perform pg_advisory_xact_lock(v_creator_hash);
  end if;
  if exists (
    select 1 from public.room_members m join public.rooms r on r.id = m.room_id
    where m.user_id = v_user and r.status = 'active'
  ) then return query select null::uuid, 'active_room_exists'; return; end if;
  if exists (
    select 1 from public.room_members m join public.rooms r on r.id = m.room_id
    where m.user_id = v_invite.creator_user_id and r.status = 'active'
  ) then return query select null::uuid, 'invite_used_or_full'; return; end if;
  select display_name into v_creator_name from public.profiles where id = v_invite.creator_user_id;
  select display_name into v_invitee_name from public.profiles where id = v_user;
  if v_creator_name is null or v_invitee_name is null then
    return query select null::uuid, 'invalid_invite'; return;
  end if;

  insert into public.rooms(creator_user_id, status, room_revision, activated_at)
    values(v_invite.creator_user_id, 'active', 1, now()) returning id into room_id;
  insert into public.room_members(room_id, user_id, role, room_display_name)
    values(room_id, v_invite.creator_user_id, 'creator', v_creator_name),
          (room_id, v_user, 'invitee', v_invitee_name);
  update public.pending_invites
    set status = 'used', used_by_user_id = v_user, used_at = now()
    where id = v_invite.id;
  return query select room_id, null::text;
exception when unique_violation then
  return query select null::uuid, 'invite_used_or_full';
end; $$;

revoke all on function public.create_pending_invite(char(6), text) from public;
revoke all on function public.accept_pending_invite(char(6), text) from public;
grant execute on function public.create_pending_invite(char(6), text) to authenticated;
grant execute on function public.accept_pending_invite(char(6), text) to authenticated;
