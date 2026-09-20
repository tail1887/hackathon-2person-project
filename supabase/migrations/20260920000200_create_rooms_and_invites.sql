create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references public.profiles(id),
  status text not null check (status in ('waiting', 'active', 'closed')) default 'waiting',
  room_revision integer not null default 0 check (room_revision >= 0),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  closed_at timestamptz
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('creator', 'invitee')),
  public_member_key uuid not null default gen_random_uuid(),
  room_display_name text not null check (char_length(trim(room_display_name)) between 1 and 30),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (room_id, user_id),
  unique (room_id, public_member_key)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  code char(6) not null unique check (code ~ '^[0-9]{6}$'),
  link_token_digest text not null unique,
  status text not null check (status in ('active', 'used', 'expired', 'revoked')) default 'active',
  expires_at timestamptz,
  used_by_user_id uuid references public.profiles(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id),
  body text not null,
  sequence integer not null,
  sent_at timestamptz not null default now(),
  unique (room_id, sequence)
);

create index room_members_user_id_idx on public.room_members(user_id);
create index messages_room_sequence_idx on public.messages(room_id, sequence);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.invites enable row level security;
alter table public.messages enable row level security;

-- This helper runs without the caller's row policy to avoid the recursive
-- room_members policy that a membership subquery would otherwise create.
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = p_room_id
      and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

-- Base tables retain internal user IDs for server commands only. Browser
-- clients use the public projections below, which omit those IDs.
create policy "rooms_select_creator_only" on public.rooms for select to authenticated
  using (creator_user_id = (select auth.uid()));
create policy "room_members_select_own" on public.room_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy "messages_select_sender_only" on public.messages for select to authenticated
  using (sender_user_id = (select auth.uid()));

revoke select on public.rooms, public.room_members, public.messages from anon, authenticated;

create view public.room_public as
  select r.id, r.status, r.room_revision, r.created_at, r.activated_at, r.closed_at
  from public.rooms r
  where public.is_room_member(r.id);

create view public.room_member_public as
  select m.room_id, m.role, m.public_member_key, m.room_display_name, m.joined_at, m.last_seen_at
  from public.room_members m
  where public.is_room_member(m.room_id);

create view public.room_message_public as
  select msg.id, msg.room_id, sender.public_member_key as sender_member_key, msg.body, msg.sequence, msg.sent_at
  from public.messages msg
  join public.room_members sender on sender.room_id = msg.room_id and sender.user_id = msg.sender_user_id
  where public.is_room_member(msg.room_id);

grant select on public.room_public, public.room_member_public, public.room_message_public to authenticated;

create or replace function public.create_room_with_invite(p_code char(6), p_token_digest text)
returns table(room_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_name text;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  if exists (select 1 from room_members m join rooms r on r.id=m.room_id where m.user_id=v_user and r.status in ('waiting','active')) then
    return query select null::uuid, 'active_room_exists'; return;
  end if;
  select display_name into v_name from profiles where id=v_user;
  if v_name is null then return query select null::uuid, 'profile_not_found'; return; end if;
  insert into rooms(creator_user_id) values(v_user) returning id into room_id;
  insert into room_members(room_id,user_id,role,room_display_name) values(room_id,v_user,'creator',v_name);
  insert into invites(room_id,code,link_token_digest) values(room_id,p_code,p_token_digest);
  return query select room_id, null::text;
exception when unique_violation then return query select null::uuid, 'invite_generation_failed';
end; $$;

create or replace function public.accept_invite(p_code char(6), p_token_digest text)
returns table(room_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_invite invites%rowtype; v_name text; v_count int;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  if exists (select 1 from room_members m join rooms r on r.id=m.room_id where m.user_id=v_user and r.status in ('waiting','active')) then return query select null::uuid, 'active_room_exists'; return; end if;
  select * into v_invite from invites where (p_code is not null and code=p_code) or (p_token_digest is not null and link_token_digest=p_token_digest) for update;
  if not found then return query select null::uuid, 'invalid_invite'; return; end if;
  if v_invite.status in ('expired','revoked') or (v_invite.expires_at is not null and v_invite.expires_at <= now()) then return query select null::uuid, 'invite_expired_or_revoked'; return; end if;
  if v_invite.status <> 'active' then return query select null::uuid, 'invite_used_or_full'; return; end if;
  perform 1 from rooms where id=v_invite.room_id for update;
  select count(*) into v_count from room_members where room_id=v_invite.room_id;
  if v_count >= 2 then return query select null::uuid, 'invite_used_or_full'; return; end if;
  select display_name into v_name from profiles where id=v_user;
  if v_name is null then return query select null::uuid, 'invalid_invite'; return; end if;
  insert into room_members(room_id,user_id,role,room_display_name) values(v_invite.room_id,v_user,'invitee',v_name);
  update invites set status='used',used_by_user_id=v_user,used_at=now() where id=v_invite.id;
  update rooms set status='active',activated_at=now(),room_revision=room_revision+1 where id=v_invite.room_id;
  return query select v_invite.room_id, null::text;
exception when unique_violation then return query select null::uuid, 'invite_used_or_full';
end; $$;

revoke all on function public.create_room_with_invite(char(6), text) from public;
revoke all on function public.accept_invite(char(6), text) from public;
grant execute on function public.create_room_with_invite(char(6), text) to authenticated;
grant execute on function public.accept_invite(char(6), text) to authenticated;
