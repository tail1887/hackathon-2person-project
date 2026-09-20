-- M4 phase 1: mission execution and bilateral change-offer commands.

create or replace function public.broadcast_mission_changed(p_room_id uuid, p_mission_id uuid, p_event_type text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_revision integer;
begin
  update public.rooms set room_revision = room_revision + 1 where id = p_room_id returning room_revision into v_revision;
  perform realtime.send(
    jsonb_build_object('room_id', p_room_id, 'room_revision', v_revision, 'mission_id', p_mission_id, 'occurred_at', now()),
    p_event_type, 'room:' || p_room_id::text, true
  );
end;
$$;

create or replace function public.record_mission_action(p_mission_id uuid, p_action text, p_note text default null)
returns table(status text, error_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid(); v_mission public.missions%rowtype; v_other uuid;
  v_checkins integer;
begin
  if v_user is null then return query select null::text, 'unauthenticated'; return; end if;
  if p_action not in ('complete_request', 'confirm', 'request_revision', 'resume', 'abandon', 'joint_checkin') or (p_note is not null and char_length(trim(p_note)) > 1000) then return query select null::text, 'invalid_mission_action'; return; end if;
  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found or not public.is_room_member(v_mission.room_id) then return query select null::text, 'mission_not_available'; return; end if;
  if v_mission.kind = 'individual' then
    select user_id into v_other from public.room_members where room_id = v_mission.room_id and user_id <> v_mission.owner_user_id;
    if p_action = 'complete_request' and v_user = v_mission.owner_user_id and v_mission.status = 'in_progress' then
      update public.missions set status = 'completion_requested', updated_at = now() where id = p_mission_id;
    elsif p_action = 'confirm' and v_user = v_other and v_mission.status = 'completion_requested' then
      update public.missions set status = 'completed', updated_at = now() where id = p_mission_id;
    elsif p_action = 'request_revision' and v_user = v_other and v_mission.status = 'completion_requested' then
      update public.missions set status = 'revision_requested', updated_at = now() where id = p_mission_id;
    elsif p_action = 'resume' and v_user = v_mission.owner_user_id and v_mission.status = 'revision_requested' then
      update public.missions set status = 'in_progress', updated_at = now() where id = p_mission_id;
    elsif p_action = 'abandon' and v_user = v_mission.owner_user_id and v_mission.status in ('in_progress', 'revision_requested') then
      update public.missions set status = 'abandoned', updated_at = now() where id = p_mission_id;
    else
      return query select null::text, 'mission_action_not_allowed'; return;
    end if;
  elsif v_mission.kind = 'joint' then
    if not exists (select 1 from public.mission_participants where mission_id = p_mission_id and user_id = v_user) then return query select null::text, 'mission_action_not_allowed'; return; end if;
    if p_action = 'joint_checkin' and v_mission.status = 'in_progress' then
      if exists (select 1 from public.mission_actions where mission_id = p_mission_id and revision = v_mission.current_revision and actor_user_id = v_user and type = 'joint_checkin') then return query select null::text, 'joint_checkin_exists'; return; end if;
      insert into public.mission_actions(mission_id, revision, actor_user_id, type, note) values(p_mission_id, v_mission.current_revision, v_user, p_action, nullif(trim(coalesce(p_note, '')), ''));
      select count(*) into v_checkins from public.mission_actions where mission_id = p_mission_id and revision = v_mission.current_revision and type = 'joint_checkin';
      if v_checkins = 2 then update public.missions set status = 'completed', updated_at = now() where id = p_mission_id; end if;
      select m.status into v_mission.status from public.missions m where m.id = p_mission_id;
      perform public.broadcast_mission_changed(v_mission.room_id, p_mission_id, 'mission.updated');
      return query select v_mission.status, null::text; return;
    elsif p_action = 'abandon' and v_mission.status = 'in_progress' then
      update public.missions set status = 'abandoned', updated_at = now() where id = p_mission_id;
    else
      return query select null::text, 'mission_action_not_allowed'; return;
    end if;
  else
    return query select null::text, 'mission_action_not_allowed'; return;
  end if;
  insert into public.mission_actions(mission_id, revision, actor_user_id, type, note) values(p_mission_id, v_mission.current_revision, v_user, p_action, nullif(trim(coalesce(p_note, '')), ''));
  select m.status into v_mission.status from public.missions m where m.id = p_mission_id;
  perform public.broadcast_mission_changed(v_mission.room_id, p_mission_id, 'mission.updated');
  return query select v_mission.status, null::text;
end;
$$;

create or replace function public.create_mission_change_offer(p_mission_id uuid, p_text text, p_due_date date, p_kind text, p_owner_user_id uuid default null)
returns table(change_offer_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_mission public.missions%rowtype; v_id uuid;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  if char_length(trim(coalesce(p_text, ''))) not between 1 and 300 or p_kind not in ('individual', 'joint') or (p_kind = 'individual' and p_owner_user_id is null) or (p_kind = 'joint' and p_owner_user_id is not null) then return query select null::uuid, 'invalid_mission_change'; return; end if;
  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found or v_mission.status not in ('in_progress', 'revision_requested') or not public.is_room_member(v_mission.room_id) then return query select null::uuid, 'mission_not_changeable'; return; end if;
  if p_kind = 'individual' and not exists (select 1 from public.room_members where room_id = v_mission.room_id and user_id = p_owner_user_id) then return query select null::uuid, 'invalid_mission_owner'; return; end if;
  insert into public.mission_change_offers(mission_id, base_revision, proposer_user_id, proposed_text, proposed_due_date, proposed_kind, proposed_owner_user_id) values(p_mission_id, v_mission.current_revision, v_user, trim(p_text), p_due_date, p_kind, p_owner_user_id) returning id into v_id;
  perform public.broadcast_mission_changed(v_mission.room_id, p_mission_id, 'mission.change_offer_changed');
  return query select v_id, null::text;
exception when unique_violation then return query select null::uuid, 'mission_change_already_open';
end;
$$;

create or replace function public.resolve_mission_change_offer(p_change_offer_id uuid, p_resolution text)
returns table(mission_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_offer public.mission_change_offers%rowtype; v_mission public.missions%rowtype; v_next_revision integer;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  if p_resolution not in ('accept', 'reject', 'cancel') then return query select null::uuid, 'invalid_resolution'; return; end if;
  select * into v_offer from public.mission_change_offers where id = p_change_offer_id for update;
  if not found or v_offer.status <> 'open' then return query select null::uuid, 'change_offer_not_open'; return; end if;
  select * into v_mission from public.missions where id = v_offer.mission_id for update;
  if not public.is_room_member(v_mission.room_id) then return query select null::uuid, 'mission_not_available'; return; end if;
  if p_resolution = 'cancel' and v_offer.proposer_user_id = v_user then
    update public.mission_change_offers set status = 'cancelled', resolved_at = now() where id = p_change_offer_id;
  elsif p_resolution = 'reject' and v_offer.proposer_user_id <> v_user then
    update public.mission_change_offers set status = 'rejected', resolved_at = now() where id = p_change_offer_id;
  elsif p_resolution = 'accept' and v_offer.proposer_user_id <> v_user then
    if v_mission.status not in ('in_progress', 'revision_requested') or v_mission.current_revision <> v_offer.base_revision then
      update public.mission_change_offers set status = 'stale', resolved_at = now() where id = p_change_offer_id;
      perform public.broadcast_mission_changed(v_mission.room_id, v_mission.id, 'mission.change_offer_changed');
      return query select null::uuid, 'mission_change_stale'; return;
    end if;
    v_next_revision := v_mission.current_revision + 1;
    update public.missions set current_revision = v_next_revision, text = v_offer.proposed_text, due_date = v_offer.proposed_due_date, kind = v_offer.proposed_kind, owner_user_id = v_offer.proposed_owner_user_id, status = 'in_progress', updated_at = now() where id = v_mission.id;
    delete from public.mission_participants p where p.mission_id = v_mission.id;
    if v_offer.proposed_kind = 'joint' then insert into public.mission_participants(mission_id, user_id) select v_mission.id, user_id from public.room_members where room_id = v_mission.room_id; end if;
    insert into public.mission_revisions(mission_id, revision, text, due_date, kind, owner_user_id) values(v_mission.id, v_next_revision, v_offer.proposed_text, v_offer.proposed_due_date, v_offer.proposed_kind, v_offer.proposed_owner_user_id);
    update public.mission_change_offers set status = 'accepted', resolved_at = now() where id = p_change_offer_id;
  else
    return query select null::uuid, 'change_offer_not_resolvable'; return;
  end if;
  perform public.broadcast_mission_changed(v_mission.room_id, v_mission.id, 'mission.change_offer_changed');
  return query select v_mission.id, null::text;
end;
$$;

create view public.mission_change_offer_public as
  select o.id, m.room_id, o.mission_id, o.base_revision, proposer.public_member_key as proposer_member_key,
    o.proposed_text, o.proposed_due_date, o.proposed_kind, owner_member.public_member_key as proposed_owner_member_key,
    o.status, o.created_at, o.resolved_at
  from public.mission_change_offers o
  join public.missions m on m.id = o.mission_id
  join public.room_members proposer on proposer.room_id = m.room_id and proposer.user_id = o.proposer_user_id
  left join public.room_members owner_member on owner_member.room_id = m.room_id and owner_member.user_id = o.proposed_owner_user_id
  where public.is_room_member(m.room_id);

revoke all on public.mission_change_offer_public from anon, authenticated;
grant select on public.mission_change_offer_public to authenticated;
revoke all on function public.broadcast_mission_changed(uuid, uuid, text), public.record_mission_action(uuid, text, text), public.create_mission_change_offer(uuid, text, date, text, uuid), public.resolve_mission_change_offer(uuid, text) from public;
grant execute on function public.record_mission_action(uuid, text, text), public.create_mission_change_offer(uuid, text, date, text, uuid), public.resolve_mission_change_offer(uuid, text) to authenticated;
