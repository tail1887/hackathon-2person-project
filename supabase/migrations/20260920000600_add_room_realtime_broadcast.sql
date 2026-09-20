create or replace function public.can_receive_room_broadcast(p_topic text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.room_members m
    where m.user_id = (select auth.uid())
      and p_topic = 'room:' || m.room_id::text
  );
$$;

create or replace function public.can_receive_invite_broadcast(p_topic text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.pending_invites i
    where p_topic = 'invite:' || i.id::text
      and (i.creator_user_id = (select auth.uid()) or i.used_by_user_id = (select auth.uid()))
  );
$$;

revoke all on function public.can_receive_room_broadcast(text) from public;
revoke all on function public.can_receive_invite_broadcast(text) from public;
grant execute on function public.can_receive_room_broadcast(text) to authenticated;
grant execute on function public.can_receive_invite_broadcast(text) to authenticated;

create policy "room members receive room broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and public.can_receive_room_broadcast((select realtime.topic()))
);

create policy "invite participants receive invite broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and public.can_receive_invite_broadcast((select realtime.topic()))
);

create or replace function public.broadcast_message_sent()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_revision integer; v_sender_key uuid;
begin
  update public.rooms set room_revision = room_revision + 1
    where id = new.room_id returning room_revision into v_revision;
  select public_member_key into v_sender_key from public.room_members
    where room_id = new.room_id and user_id = new.sender_user_id;
  perform realtime.send(
    jsonb_build_object(
      'room_id', new.room_id,
      'room_revision', v_revision,
      'occurred_at', new.sent_at,
      'message_id', new.id,
      'sequence', new.sequence,
      'sender_member_key', v_sender_key
    ),
    'message.sent',
    'room:' || new.room_id::text,
    true
  );
  return new;
end;
$$;

drop trigger if exists messages_broadcast_sent on public.messages;
create trigger messages_broadcast_sent
after insert on public.messages
for each row execute function public.broadcast_message_sent();

create or replace function public.broadcast_invite_accepted(
  p_invite_id uuid,
  p_room_id uuid,
  p_member_key uuid,
  p_display_name text,
  p_occurred_at timestamptz
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_revision integer;
begin
  select room_revision into v_revision from public.rooms where id = p_room_id;
  perform realtime.send(
    jsonb_build_object('room_id', p_room_id, 'room_revision', v_revision, 'occurred_at', p_occurred_at),
    'room.member_joined', 'invite:' || p_invite_id::text, true
  );
  perform realtime.send(
    jsonb_build_object('room_id', p_room_id, 'room_revision', v_revision, 'occurred_at', p_occurred_at, 'public_member_key', p_member_key, 'room_display_name', p_display_name, 'member_label', p_display_name),
    'room.member_joined', 'room:' || p_room_id::text, true
  );
end;
$$;

create or replace function public.accept_pending_invite(p_code char(6), p_token_digest text)
returns table(room_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid(); v_invite public.pending_invites%rowtype;
  v_creator_name text; v_invitee_name text; v_creator_hash integer; v_user_hash integer;
  v_member_key uuid; v_now timestamptz := now();
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  select * into v_invite from public.pending_invites where (p_code is not null and code = p_code) or (p_token_digest is not null and link_token_digest = p_token_digest) for update;
  if not found then return query select null::uuid, 'invalid_invite'; return; end if;
  if v_invite.status in ('expired', 'revoked') or (v_invite.expires_at is not null and v_invite.expires_at <= v_now) then return query select null::uuid, 'invite_expired_or_revoked'; return; end if;
  if v_invite.status <> 'active' then return query select null::uuid, 'invite_used_or_full'; return; end if;
  if v_invite.creator_user_id = v_user then return query select null::uuid, 'invalid_invite'; return; end if;
  v_creator_hash := hashtext(v_invite.creator_user_id::text); v_user_hash := hashtext(v_user::text);
  if v_creator_hash < v_user_hash then perform pg_advisory_xact_lock(v_creator_hash); perform pg_advisory_xact_lock(v_user_hash); else perform pg_advisory_xact_lock(v_user_hash); perform pg_advisory_xact_lock(v_creator_hash); end if;
  if exists (select 1 from public.room_members m join public.rooms r on r.id = m.room_id where m.user_id = v_user and r.status = 'active') then return query select null::uuid, 'active_room_exists'; return; end if;
  if exists (select 1 from public.room_members m join public.rooms r on r.id = m.room_id where m.user_id = v_invite.creator_user_id and r.status = 'active') then return query select null::uuid, 'invite_used_or_full'; return; end if;
  select display_name into v_creator_name from public.profiles where id = v_invite.creator_user_id;
  select display_name into v_invitee_name from public.profiles where id = v_user;
  if v_creator_name is null or v_invitee_name is null then return query select null::uuid, 'invalid_invite'; return; end if;
  insert into public.rooms(creator_user_id, status, room_revision, activated_at) values(v_invite.creator_user_id, 'active', 1, v_now) returning id into room_id;
  insert into public.room_members(room_id, user_id, role, room_display_name) values(room_id, v_invite.creator_user_id, 'creator', v_creator_name);
  insert into public.room_members(room_id, user_id, role, room_display_name) values(room_id, v_user, 'invitee', v_invitee_name) returning public_member_key into v_member_key;
  update public.pending_invites set status = 'used', used_by_user_id = v_user, used_at = v_now where id = v_invite.id;
  perform public.broadcast_invite_accepted(v_invite.id, room_id, v_member_key, v_invitee_name, v_now);
  return query select room_id, null::text;
exception when unique_violation then return query select null::uuid, 'invite_used_or_full';
end; $$;
