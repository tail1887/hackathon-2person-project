-- The selected recommendation, not always the first one, must be sent.
drop function public.send_ai_mediated_message(uuid, text);

create function public.send_ai_mediated_message(
  p_analysis_id uuid,
  p_choice text,
  p_recommendation_index integer default null
)
returns table(message_id uuid, body text, sequence integer, sent_at timestamptz, error_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_analysis public.ai_analyses%rowtype;
  v_draft public.message_drafts%rowtype;
  v_body text;
  v_sequence integer;
  v_message_id uuid;
  v_sent_at timestamptz := now();
begin
  if v_user is null then return query select null::uuid, null::text, null::integer, null::timestamptz, 'unauthenticated'; return; end if;
  select * into v_analysis from public.ai_analyses where id = p_analysis_id for update;
  if not found or v_analysis.requester_user_id <> v_user or v_analysis.type <> 'message_mediation' or v_analysis.status <> 'ready' or v_analysis.result_type <> 'normal' then
    return query select null::uuid, null::text, null::integer, null::timestamptz, 'analysis_not_sendable'; return;
  end if;
  select * into v_draft from public.message_drafts where id = v_analysis.draft_id for update;
  if not found or v_draft.author_user_id <> v_user or v_draft.status <> 'active' or v_draft.revision <> v_analysis.draft_revision or encode(extensions.digest(v_draft.body::bytea, 'sha256'), 'hex') <> v_analysis.input_hash then
    return query select null::uuid, null::text, null::integer, null::timestamptz, 'analysis_stale'; return;
  end if;
  if not exists (select 1 from public.rooms r join public.room_members m on m.room_id = r.id where r.id = v_draft.room_id and r.status = 'active' and m.user_id = v_user) then
    return query select null::uuid, null::text, null::integer, null::timestamptz, 'room_not_active'; return;
  end if;
  if p_choice = 'original' then
    v_body := v_draft.body;
  elsif p_choice = 'recommendation' then
    if p_recommendation_index is null or p_recommendation_index < 0 then
      return query select null::uuid, null::text, null::integer, null::timestamptz, 'invalid_recommendation_index'; return;
    end if;
    v_body := v_analysis.result #>> array['recommendations', p_recommendation_index::text, 'text'];
  else
    return query select null::uuid, null::text, null::integer, null::timestamptz, 'invalid_choice'; return;
  end if;
  if v_body is null or char_length(trim(v_body)) = 0 then return query select null::uuid, null::text, null::integer, null::timestamptz, 'analysis_not_sendable'; return; end if;
  perform pg_advisory_xact_lock(hashtext(v_draft.room_id::text));
  select coalesce(max(msg.sequence), 0) + 1 into v_sequence from public.messages msg where msg.room_id = v_draft.room_id;
  insert into public.messages(room_id, sender_user_id, body, sequence, sent_at, send_choice, ai_analysis_id)
    values(v_draft.room_id, v_user, v_body, v_sequence, v_sent_at, p_choice, v_analysis.id) returning id into v_message_id;
  update public.message_drafts set status = 'sent', sent_message_id = v_message_id, saved_at = v_sent_at where id = v_draft.id;
  return query select v_message_id, v_body, v_sequence, v_sent_at, null::text;
end;
$$;

revoke all on function public.send_ai_mediated_message(uuid, text, integer) from public;
grant execute on function public.send_ai_mediated_message(uuid, text, integer) to authenticated;
