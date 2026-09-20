-- Correct the public member-key comparison in the phase 3 command.
create or replace function public.create_mission_change_offer(
  p_mission_id uuid,
  p_text text,
  p_due_date date,
  p_kind text,
  p_owner_member_key text default null
)
returns table(change_offer_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_mission public.missions%rowtype;
  v_owner_user_id uuid;
  v_id uuid;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  if char_length(trim(coalesce(p_text, ''))) not between 1 and 300
    or p_kind not in ('individual', 'joint')
    or (p_kind = 'individual' and nullif(trim(coalesce(p_owner_member_key, '')), '') is null)
    or (p_kind = 'joint' and p_owner_member_key is not null) then
    return query select null::uuid, 'invalid_mission_change'; return;
  end if;
  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found or v_mission.status not in ('in_progress', 'revision_requested') or not public.is_room_member(v_mission.room_id) then
    return query select null::uuid, 'mission_not_changeable'; return;
  end if;
  if p_kind = 'individual' then
    select user_id into v_owner_user_id from public.room_members
      where room_id = v_mission.room_id and public_member_key = trim(p_owner_member_key)::uuid;
    if v_owner_user_id is null then return query select null::uuid, 'invalid_mission_owner'; return; end if;
  end if;
  insert into public.mission_change_offers(
    mission_id, base_revision, proposer_user_id, proposed_text, proposed_due_date, proposed_kind, proposed_owner_user_id
  ) values (
    p_mission_id, v_mission.current_revision, v_user, trim(p_text), p_due_date, p_kind, v_owner_user_id
  ) returning id into v_id;
  perform public.broadcast_mission_changed(v_mission.room_id, p_mission_id, 'mission.change_offer_changed');
  return query select v_id, null::text;
exception when unique_violation then
  return query select null::uuid, 'mission_change_already_open';
end;
$$;
