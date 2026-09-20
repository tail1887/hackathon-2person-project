create view public.room_review_public as
  select a.id, a.room_id, a.context_through_sequence, a.result, a.status, a.created_at, a.updated_at
  from public.ai_analyses a
  where a.type = 'room_review' and a.visibility = 'room'
    and public.is_room_member(a.room_id);

revoke all on public.room_review_public from anon, authenticated;
grant select on public.room_review_public to authenticated;

create or replace view public.room_review_request_public as
  select r.id, r.room_id, requester.public_member_key as requester_member_key,
    responder.public_member_key as responder_member_key, r.context_through_sequence,
    r.status, r.requested_at, r.accepted_at,
    r.requester_user_id = (select auth.uid()) as is_requester,
    r.responder_user_id = (select auth.uid()) as is_responder
  from public.room_review_requests r
  join public.room_members requester on requester.room_id = r.room_id and requester.user_id = r.requester_user_id
  join public.room_members responder on responder.room_id = r.room_id and responder.user_id = r.responder_user_id
  where public.is_room_member(r.room_id);

create or replace function public.broadcast_room_review_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_revision integer;
begin
  update public.rooms set room_revision = room_revision + 1
    where id = new.room_id returning room_revision into v_revision;
  perform realtime.send(
    jsonb_build_object('room_id', new.room_id, 'room_revision', v_revision, 'request_id', new.id, 'status', new.status),
    'room.review_changed', 'room:' || new.room_id::text, true
  );
  return new;
end;
$$;

drop trigger if exists room_review_requests_broadcast_changed on public.room_review_requests;
create trigger room_review_requests_broadcast_changed
after insert or update of status, analysis_id on public.room_review_requests
for each row execute function public.broadcast_room_review_changed();

drop function if exists public.accept_room_review_request(uuid);
create function public.accept_room_review_request(p_request_id uuid)
returns table(request_id uuid, room_id uuid, context_through_sequence integer, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_request public.room_review_requests%rowtype;
begin
  if v_user is null then return query select null::uuid, null::uuid, null::integer, 'unauthenticated'; return; end if;
  select * into v_request from public.room_review_requests where id = p_request_id for update;
  if not found or v_request.responder_user_id <> v_user or v_request.status <> 'pending' then
    return query select null::uuid, null::uuid, null::integer, 'review_not_acceptable'; return;
  end if;
  update public.room_review_requests set status = 'processing', accepted_at = now() where id = p_request_id;
  return query select p_request_id, v_request.room_id, v_request.context_through_sequence, null::text;
end;
$$;

revoke all on function public.accept_room_review_request(uuid) from public;
grant execute on function public.accept_room_review_request(uuid) to authenticated;
