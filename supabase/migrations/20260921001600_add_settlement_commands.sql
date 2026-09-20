-- M4 phase 1: atomic negotiation commands. Browser clients can only invoke these RPCs.

create or replace function public.broadcast_settlement_changed(p_room_id uuid, p_settlement_id uuid, p_event_type text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_revision integer;
begin
  update public.rooms set room_revision = room_revision + 1 where id = p_room_id returning room_revision into v_revision;
  perform realtime.send(
    jsonb_build_object('room_id', p_room_id, 'room_revision', v_revision, 'settlement_id', p_settlement_id, 'occurred_at', now()),
    p_event_type, 'room:' || p_room_id::text, true
  );
end;
$$;

create or replace function public.create_settlement_offer(p_room_id uuid, p_selection_mode text, p_terms jsonb)
returns table(offer_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid(); v_other uuid; v_settlement public.settlements%rowtype;
  v_current_offer public.settlement_offers%rowtype; v_offer_id uuid; v_revision integer;
  v_term jsonb; v_responsibility text; v_responsible_user_id uuid; v_count integer := 0; v_display_order integer := 0;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  if p_selection_mode not in ('single', 'multiple', 'none') or jsonb_typeof(p_terms) <> 'array' then return query select null::uuid, 'invalid_offer'; return; end if;
  select m.user_id into v_other from public.room_members m where m.room_id = p_room_id and m.user_id <> v_user;
  if v_other is null or not exists (select 1 from public.rooms r join public.room_members m on m.room_id = r.id where r.id = p_room_id and r.status = 'active' and m.user_id = v_user) then return query select null::uuid, 'room_not_active'; return; end if;
  select count(*) into v_count from jsonb_array_elements(p_terms);
  if (p_selection_mode = 'none' and v_count <> 0) or (p_selection_mode <> 'none' and (v_count < 1 or v_count > 5)) then return query select null::uuid, 'invalid_terms'; return; end if;
  perform pg_advisory_xact_lock(hashtext(p_room_id::text));
  select * into v_settlement from public.settlements where room_id = p_room_id and status = 'open' for update;
  if found then
    select * into v_current_offer from public.settlement_offers where id = v_settlement.active_offer_id for update;
    if v_current_offer.status <> 'counter_requested' or v_current_offer.proposer_user_id <> v_user then return query select null::uuid, 'offer_not_editable'; return; end if;
    v_revision := v_current_offer.revision + 1;
  else
    insert into public.settlements(room_id) values (p_room_id) returning * into v_settlement;
    v_revision := 1;
  end if;
  insert into public.settlement_offers(settlement_id, revision, proposer_user_id, selection_mode) values(v_settlement.id, v_revision, v_user, p_selection_mode) returning id into v_offer_id;
  for v_term in select value from jsonb_array_elements(p_terms) loop
    if jsonb_typeof(v_term) <> 'object' or char_length(trim(coalesce(v_term->>'text', ''))) not between 1 and 300 then return query select null::uuid, 'invalid_terms'; return; end if;
    v_responsibility := v_term->>'responsibility';
    if v_responsibility = 'proposer' then v_responsible_user_id := v_user;
    elsif v_responsibility = 'responder' then v_responsible_user_id := v_other;
    elsif v_responsibility = 'together' then v_responsible_user_id := null;
    else return query select null::uuid, 'invalid_terms'; return;
    end if;
    insert into public.settlement_terms(offer_id, text, mission_kind, responsible_user_id, display_order)
      values(v_offer_id, trim(v_term->>'text'), case when v_responsibility = 'together' then 'joint' else 'individual' end, v_responsible_user_id, v_display_order);
    v_display_order := v_display_order + 1;
  end loop;
  update public.settlements set active_offer_id = v_offer_id where id = v_settlement.id;
  perform public.broadcast_settlement_changed(p_room_id, v_settlement.id, 'settlement.offer_changed');
  return query select v_offer_id, null::text;
end;
$$;

create or replace function public.counter_settlement_offer(p_offer_id uuid, p_body text)
returns table(counter_message_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_offer public.settlement_offers%rowtype; v_settlement public.settlements%rowtype; v_id uuid;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 1000 then return query select null::uuid, 'invalid_counter_message'; return; end if;
  select * into v_offer from public.settlement_offers where id = p_offer_id for update;
  if not found then return query select null::uuid, 'offer_not_counterable'; return; end if;
  select * into v_settlement from public.settlements where id = v_offer.settlement_id for update;
  if v_settlement.status <> 'open' or v_settlement.active_offer_id <> p_offer_id or v_offer.status <> 'open' or v_offer.proposer_user_id = v_user or not exists (select 1 from public.rooms r join public.room_members m on m.room_id = r.id where r.id = v_settlement.room_id and r.status = 'active' and m.user_id = v_user) then return query select null::uuid, 'offer_not_counterable'; return; end if;
  insert into public.settlement_counter_messages(offer_id, author_user_id, body) values(p_offer_id, v_user, trim(p_body)) returning id into v_id;
  update public.settlement_offers set status = 'counter_requested' where id = p_offer_id;
  perform public.broadcast_settlement_changed(v_settlement.room_id, v_settlement.id, 'settlement.offer_changed');
  return query select v_id, null::text;
exception when unique_violation then return query select null::uuid, 'counter_already_sent';
end;
$$;

create or replace function public.continue_after_settlement_offer(p_offer_id uuid)
returns table(settlement_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_offer public.settlement_offers%rowtype; v_settlement public.settlements%rowtype;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  select * into v_offer from public.settlement_offers where id = p_offer_id for update;
  if not found then return query select null::uuid, 'offer_not_continuable'; return; end if;
  select * into v_settlement from public.settlements where id = v_offer.settlement_id for update;
  if v_settlement.status <> 'open' or v_settlement.active_offer_id <> p_offer_id or v_offer.status <> 'open' or v_offer.proposer_user_id = v_user then return query select null::uuid, 'offer_not_continuable'; return; end if;
  update public.settlement_offers set status = 'continued' where id = p_offer_id;
  update public.settlements set status = 'cancelled', resolved_at = now() where id = v_settlement.id;
  perform public.broadcast_settlement_changed(v_settlement.room_id, v_settlement.id, 'settlement.cancelled');
  return query select v_settlement.id, null::text;
end;
$$;

create or replace function public.accept_settlement_offer(p_offer_id uuid, p_term_ids uuid[] default '{}')
returns table(settlement_id uuid, error_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid(); v_offer public.settlement_offers%rowtype; v_settlement public.settlements%rowtype;
  v_count integer; v_valid_count integer; v_term public.settlement_terms%rowtype; v_mission_id uuid;
begin
  if v_user is null then return query select null::uuid, 'unauthenticated'; return; end if;
  select * into v_offer from public.settlement_offers where id = p_offer_id for update;
  if not found then return query select null::uuid, 'offer_not_acceptable'; return; end if;
  select * into v_settlement from public.settlements where id = v_offer.settlement_id for update;
  if v_settlement.status <> 'open' or v_settlement.active_offer_id <> p_offer_id or v_offer.status <> 'open' or v_offer.proposer_user_id = v_user or not exists (select 1 from public.rooms r join public.room_members m on m.room_id = r.id where r.id = v_settlement.room_id and r.status = 'active' and m.user_id = v_user) then return query select null::uuid, 'offer_not_acceptable'; return; end if;
  v_count := coalesce(cardinality(p_term_ids), 0);
  select count(*) into v_valid_count from public.settlement_terms where offer_id = p_offer_id and id = any(p_term_ids);
  if v_valid_count <> v_count or v_count <> (select count(distinct term_id) from unnest(p_term_ids) as term_id) then return query select null::uuid, 'invalid_selection'; return; end if;
  if (v_offer.selection_mode = 'none' and v_count <> 0) or (v_offer.selection_mode = 'single' and v_count <> 1) or (v_offer.selection_mode = 'multiple' and v_count < 1) then return query select null::uuid, 'invalid_selection'; return; end if;
  insert into public.settlement_term_selections(offer_id, selector_user_id, term_id) select p_offer_id, v_user, term_id from unnest(p_term_ids) as term_id;
  for v_term in select * from public.settlement_terms where offer_id = p_offer_id and id = any(p_term_ids) order by display_order loop
    insert into public.missions(room_id, settlement_id, source_term_id, kind, owner_user_id, text) values(v_settlement.room_id, v_settlement.id, v_term.id, v_term.mission_kind, v_term.responsible_user_id, v_term.text) returning id into v_mission_id;
    if v_term.mission_kind = 'joint' then insert into public.mission_participants(mission_id, user_id) select v_mission_id, user_id from public.room_members where room_id = v_settlement.room_id; end if;
    insert into public.mission_revisions(mission_id, revision, text, due_date, kind, owner_user_id) values(v_mission_id, 1, v_term.text, null, v_term.mission_kind, v_term.responsible_user_id);
  end loop;
  update public.settlement_offers set status = 'accepted' where id = p_offer_id;
  update public.settlements set status = 'agreed', agreed_offer_id = p_offer_id, resolved_at = now() where id = v_settlement.id;
  update public.rooms set status = 'closed', closed_at = now() where id = v_settlement.room_id;
  perform public.broadcast_settlement_changed(v_settlement.room_id, v_settlement.id, 'settlement.agreed');
  return query select v_settlement.id, null::text;
end;
$$;

revoke all on function public.broadcast_settlement_changed(uuid, uuid, text), public.create_settlement_offer(uuid, text, jsonb), public.counter_settlement_offer(uuid, text), public.continue_after_settlement_offer(uuid), public.accept_settlement_offer(uuid, uuid[]) from public;
grant execute on function public.create_settlement_offer(uuid, text, jsonb), public.counter_settlement_offer(uuid, text), public.continue_after_settlement_offer(uuid), public.accept_settlement_offer(uuid, uuid[]) to authenticated;
