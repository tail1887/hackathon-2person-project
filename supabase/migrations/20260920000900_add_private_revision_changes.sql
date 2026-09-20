create table public.private_changes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  private_revision integer not null check (private_revision > 0),
  event_type text not null,
  resource_type text not null,
  resource_id uuid not null,
  occurred_at timestamptz not null default now(),
  primary key (user_id, room_id, private_revision)
);

alter table public.private_changes enable row level security;
revoke all on public.private_changes from anon, authenticated;

create or replace function public.record_private_change(p_user_id uuid, p_room_id uuid, p_event_type text, p_resource_type text, p_resource_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_revision integer;
begin
  insert into public.user_room_private_states(room_id, user_id, private_revision, updated_at)
    values(p_room_id, p_user_id, 1, now())
  on conflict (room_id, user_id) do update
    set private_revision = public.user_room_private_states.private_revision + 1, updated_at = now()
  returning private_revision into v_revision;
  insert into public.private_changes(user_id, room_id, private_revision, event_type, resource_type, resource_id)
    values(p_user_id, p_room_id, v_revision, p_event_type, p_resource_type, p_resource_id);
  return v_revision;
end; $$;

revoke all on function public.record_private_change(uuid, uuid, text, text, uuid) from public;
