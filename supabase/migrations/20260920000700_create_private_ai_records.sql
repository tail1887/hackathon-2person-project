create table public.user_room_private_states (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  private_revision integer not null default 0 check (private_revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.message_drafts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  revision integer not null default 1 check (revision > 0),
  status text not null default 'active' check (status in ('active', 'sent', 'discarded', 'private_record_deleted')),
  sent_message_id uuid,
  saved_at timestamptz not null default now(),
  private_record_deleted_at timestamptz,
  unique (room_id, author_user_id, revision)
);

create unique index message_drafts_one_active_per_author_idx
  on public.message_drafts(room_id, author_user_id)
  where status = 'active';

create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  draft_id uuid references public.message_drafts(id) on delete set null,
  draft_revision integer,
  type text not null check (type in ('message_mediation', 'private_position', 'room_review')),
  visibility text not null check (visibility in ('private', 'room')),
  input_hash text not null,
  context_through_sequence integer,
  result_type text check (result_type in ('normal', 'restricted')),
  result jsonb,
  status text not null default 'pending' check (status in ('pending', 'ready', 'stale', 'failed')),
  private_record_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (type = 'message_mediation' and visibility = 'private' and draft_id is not null and draft_revision is not null)
    or (type = 'private_position' and visibility = 'private' and draft_id is null and draft_revision is null)
    or (type = 'room_review' and visibility = 'room' and draft_id is null and draft_revision is null)
  )
);

alter table public.messages
  add column send_choice text check (send_choice in ('original', 'recommendation')),
  add column ai_analysis_id uuid references public.ai_analyses(id);

alter table public.message_drafts
  add constraint message_drafts_sent_message_id_fkey
  foreign key (sent_message_id) references public.messages(id);

create index message_drafts_private_lookup_idx on public.message_drafts(author_user_id, room_id, saved_at desc);
create index ai_analyses_private_lookup_idx on public.ai_analyses(requester_user_id, room_id, created_at desc);

alter table public.user_room_private_states enable row level security;
alter table public.message_drafts enable row level security;
alter table public.ai_analyses enable row level security;

revoke all on public.user_room_private_states, public.message_drafts, public.ai_analyses from anon, authenticated;

create view public.private_state_public as
  select room_id, private_revision, updated_at
  from public.user_room_private_states
  where user_id = (select auth.uid());

create view public.private_draft_public as
  select id, room_id, body, revision, status, sent_message_id, saved_at, private_record_deleted_at
  from public.message_drafts
  where author_user_id = (select auth.uid());

create view public.private_analysis_public as
  select id, room_id, draft_id, draft_revision, type, input_hash, context_through_sequence,
    result_type, result, status, private_record_deleted_at, created_at, updated_at
  from public.ai_analyses
  where requester_user_id = (select auth.uid()) and visibility = 'private';

revoke all on public.private_state_public, public.private_draft_public, public.private_analysis_public from anon, authenticated;
grant select on public.private_state_public, public.private_draft_public, public.private_analysis_public to authenticated;
