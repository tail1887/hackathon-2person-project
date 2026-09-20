alter table public.room_review_requests
  add column retry_count integer not null default 0 check (retry_count between 0 and 1);

create or replace view public.room_review_request_public as
  select r.id, r.room_id, requester.public_member_key as requester_member_key,
    responder.public_member_key as responder_member_key, r.context_through_sequence,
    r.status, r.requested_at, r.accepted_at,
    r.requester_user_id = (select auth.uid()) as is_requester,
    r.responder_user_id = (select auth.uid()) as is_responder,
    r.status = 'failed' and r.requester_user_id = (select auth.uid()) and r.retry_count = 0 as can_retry,
    r.status = 'failed' and r.requester_user_id = (select auth.uid()) as can_cancel
  from public.room_review_requests r
  join public.room_members requester on requester.room_id = r.room_id and requester.user_id = r.requester_user_id
  join public.room_members responder on responder.room_id = r.room_id and responder.user_id = r.responder_user_id
  where public.is_room_member(r.room_id);

create function public.retry_room_review_request(p_request_id uuid)
returns table(request_id uuid, room_id uuid, context_through_sequence integer, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_request public.room_review_requests%rowtype;
begin
  if v_user is null then return query select null::uuid, null::uuid, null::integer, 'unauthenticated'; return; end if;
  select * into v_request from public.room_review_requests where id = p_request_id for update;
  if not found or v_request.requester_user_id <> v_user then return query select null::uuid, null::uuid, null::integer, 'not_review_requester'; return; end if;
  if v_request.status <> 'failed' then return query select null::uuid, null::uuid, null::integer, 'review_not_failed'; return; end if;
  if v_request.retry_count >= 1 then return query select null::uuid, null::uuid, null::integer, 'review_retry_used'; return; end if;
  update public.room_review_requests set status = 'processing', retry_count = retry_count + 1 where id = p_request_id;
  return query select p_request_id, v_request.room_id, v_request.context_through_sequence, null::text;
end;
$$;

create function public.cancel_room_review_request(p_request_id uuid)
returns table(request_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_request public.room_review_requests%rowtype;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  select * into v_request from public.room_review_requests where id = p_request_id for update;
  if not found or v_request.requester_user_id <> v_user then return query select null::uuid, 'not_review_requester'; return; end if;
  if v_request.status <> 'failed' then return query select null::uuid, 'review_not_failed'; return; end if;
  update public.room_review_requests set status = 'cancelled' where id = p_request_id;
  return query select p_request_id, null::text;
end;
$$;

revoke all on function public.retry_room_review_request(uuid), public.cancel_room_review_request(uuid) from public;
grant execute on function public.retry_room_review_request(uuid), public.cancel_room_review_request(uuid) to authenticated;
