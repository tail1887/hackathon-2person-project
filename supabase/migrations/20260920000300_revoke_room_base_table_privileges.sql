-- Room state changes must pass through the security-definer command functions.
-- Browser clients read only the public projections that omit internal user IDs.
revoke all on table public.rooms, public.room_members, public.invites, public.messages from anon, authenticated;

grant select on public.room_public, public.room_member_public, public.room_message_public to authenticated;
