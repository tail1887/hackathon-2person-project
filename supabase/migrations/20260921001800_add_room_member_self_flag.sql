-- UI may identify the authenticated member without exposing an internal user id.
create or replace view public.room_member_public as
  select m.room_id, m.role, m.public_member_key, m.room_display_name, m.joined_at, m.last_seen_at,
    m.user_id = (select auth.uid()) as is_self
  from public.room_members m
  where public.is_room_member(m.room_id);

revoke all on public.room_member_public from anon, authenticated;
grant select on public.room_member_public to authenticated;
