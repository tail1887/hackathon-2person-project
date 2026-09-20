-- Views inherit the project's default grants when created. Keep them read-only
-- and available only to signed-in room members through their predicates.
revoke all on table public.room_public, public.room_member_public, public.room_message_public from anon, authenticated;

grant select on public.room_public, public.room_member_public, public.room_message_public to authenticated;
