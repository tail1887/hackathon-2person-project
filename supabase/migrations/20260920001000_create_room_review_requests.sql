create table public.room_review_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  requester_user_id uuid not null references public.profiles(id),
  responder_user_id uuid not null references public.profiles(id),
  context_through_sequence integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'processing', 'ready', 'failed', 'cancelled')),
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  analysis_id uuid references public.ai_analyses(id)
);

create unique index room_review_requests_one_open_idx
  on public.room_review_requests(room_id)
  where status in ('pending', 'accepted', 'processing');

alter table public.room_review_requests enable row level security;
revoke all on public.room_review_requests from anon, authenticated;

create view public.room_review_request_public as
  select r.id, r.room_id, requester.public_member_key as requester_member_key,
    responder.public_member_key as responder_member_key, r.context_through_sequence,
    r.status, r.requested_at, r.accepted_at
  from public.room_review_requests r
  join public.room_members requester on requester.room_id = r.room_id and requester.user_id = r.requester_user_id
  join public.room_members responder on responder.room_id = r.room_id and responder.user_id = r.responder_user_id
  where public.is_room_member(r.room_id);

revoke all on public.room_review_request_public from anon, authenticated;
grant select on public.room_review_request_public to authenticated;

create or replace function public.create_room_review_request(p_room_id uuid)
returns table(request_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_responder uuid; v_sequence integer;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  select m.user_id into v_responder from public.room_members m where m.room_id = p_room_id and m.user_id <> v_user;
  if v_responder is null or not exists (select 1 from public.rooms r join public.room_members m on m.room_id=r.id where r.id=p_room_id and r.status='active' and m.user_id=v_user) then return query select null::uuid, 'room_not_active'; return; end if;
  select coalesce(max(sequence), 0) into v_sequence from public.messages where room_id=p_room_id;
  insert into public.room_review_requests(room_id, requester_user_id, responder_user_id, context_through_sequence) values(p_room_id, v_user, v_responder, v_sequence) returning id into request_id;
  return query select request_id, null::text;
exception when unique_violation then return query select null::uuid, 'review_already_open';
end; $$;

create or replace function public.accept_room_review_request(p_request_id uuid)
returns table(request_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_request public.room_review_requests%rowtype;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  select * into v_request from public.room_review_requests where id=p_request_id for update;
  if not found or v_request.responder_user_id <> v_user or v_request.status <> 'pending' then return query select null::uuid, 'review_not_acceptable'; return; end if;
  update public.room_review_requests set status='accepted', accepted_at=now() where id=p_request_id;
  return query select p_request_id, null::text;
end; $$;

revoke all on function public.create_room_review_request(uuid), public.accept_room_review_request(uuid) from public;
grant execute on function public.create_room_review_request(uuid), public.accept_room_review_request(uuid) to authenticated;
