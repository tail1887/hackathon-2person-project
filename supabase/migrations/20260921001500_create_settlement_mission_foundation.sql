-- M4 phase 1: negotiation and mission records. Mutations remain server-command only.

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'agreed', 'cancelled')),
  active_offer_id uuid,
  agreed_offer_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index settlements_one_open_per_room_idx on public.settlements(room_id) where status = 'open';

create table public.settlement_offers (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  revision integer not null check (revision > 0),
  proposer_user_id uuid not null references public.profiles(id),
  selection_mode text not null check (selection_mode in ('single', 'multiple', 'none')),
  status text not null default 'open' check (status in ('open', 'counter_requested', 'accepted', 'continued')),
  created_at timestamptz not null default now(),
  unique (settlement_id, revision)
);

alter table public.settlements
  add constraint settlements_active_offer_id_fkey foreign key (active_offer_id) references public.settlement_offers(id),
  add constraint settlements_agreed_offer_id_fkey foreign key (agreed_offer_id) references public.settlement_offers(id);

create table public.settlement_terms (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.settlement_offers(id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 300),
  mission_kind text not null check (mission_kind in ('individual', 'joint')),
  responsible_user_id uuid references public.profiles(id),
  display_order integer not null check (display_order >= 0),
  unique (offer_id, display_order),
  check ((mission_kind = 'individual' and responsible_user_id is not null) or (mission_kind = 'joint' and responsible_user_id is null))
);

create table public.settlement_term_selections (
  offer_id uuid not null references public.settlement_offers(id) on delete cascade,
  selector_user_id uuid not null references public.profiles(id),
  term_id uuid not null references public.settlement_terms(id) on delete cascade,
  selected_at timestamptz not null default now(),
  primary key (offer_id, term_id)
);

create table public.settlement_counter_messages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.settlement_offers(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (offer_id)
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  settlement_id uuid not null references public.settlements(id),
  source_term_id uuid not null references public.settlement_terms(id),
  current_revision integer not null default 1 check (current_revision > 0),
  kind text not null check (kind in ('individual', 'joint')),
  owner_user_id uuid references public.profiles(id),
  text text not null check (char_length(trim(text)) between 1 and 300),
  due_date date,
  status text not null default 'in_progress' check (status in ('in_progress', 'completion_requested', 'completed', 'revision_requested', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'individual' and owner_user_id is not null) or (kind = 'joint' and owner_user_id is null))
);

create table public.mission_participants (
  mission_id uuid not null references public.missions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  primary key (mission_id, user_id)
);

create table public.mission_revisions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  revision integer not null check (revision > 0),
  text text not null check (char_length(trim(text)) between 1 and 300),
  due_date date,
  kind text not null check (kind in ('individual', 'joint')),
  owner_user_id uuid references public.profiles(id),
  applied_at timestamptz not null default now(),
  unique (mission_id, revision)
);

create table public.mission_actions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  revision integer not null check (revision > 0),
  actor_user_id uuid not null references public.profiles(id),
  type text not null check (type in ('complete_request', 'confirm', 'request_revision', 'resume', 'abandon', 'joint_checkin')),
  note text check (note is null or char_length(trim(note)) <= 1000),
  created_at timestamptz not null default now()
);

create table public.mission_change_offers (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  base_revision integer not null check (base_revision > 0),
  proposer_user_id uuid not null references public.profiles(id),
  proposed_text text not null check (char_length(trim(proposed_text)) between 1 and 300),
  proposed_due_date date,
  proposed_kind text not null check (proposed_kind in ('individual', 'joint')),
  proposed_owner_user_id uuid references public.profiles(id),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected', 'cancelled', 'stale')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((proposed_kind = 'individual' and proposed_owner_user_id is not null) or (proposed_kind = 'joint' and proposed_owner_user_id is null))
);

create unique index mission_change_offers_one_open_idx on public.mission_change_offers(mission_id) where status = 'open';

alter table public.settlements enable row level security;
alter table public.settlement_offers enable row level security;
alter table public.settlement_terms enable row level security;
alter table public.settlement_term_selections enable row level security;
alter table public.settlement_counter_messages enable row level security;
alter table public.missions enable row level security;
alter table public.mission_participants enable row level security;
alter table public.mission_revisions enable row level security;
alter table public.mission_actions enable row level security;
alter table public.mission_change_offers enable row level security;

revoke all on public.settlements, public.settlement_offers, public.settlement_terms, public.settlement_term_selections, public.settlement_counter_messages, public.missions, public.mission_participants, public.mission_revisions, public.mission_actions, public.mission_change_offers from anon, authenticated;

create view public.settlement_public as
  select s.id, s.room_id, s.status, s.active_offer_id, s.agreed_offer_id, s.created_at, s.resolved_at
  from public.settlements s where public.is_room_member(s.room_id);

create view public.settlement_offer_public as
  select o.id, s.room_id, o.settlement_id, o.revision, proposer.public_member_key as proposer_member_key,
    o.selection_mode, o.status, o.created_at
  from public.settlement_offers o
  join public.settlements s on s.id = o.settlement_id
  join public.room_members proposer on proposer.room_id = s.room_id and proposer.user_id = o.proposer_user_id
  where public.is_room_member(s.room_id);

create view public.settlement_term_public as
  select t.id, s.room_id, t.offer_id, t.text, t.mission_kind,
    responsible.public_member_key as responsible_member_key, t.display_order
  from public.settlement_terms t
  join public.settlement_offers o on o.id = t.offer_id
  join public.settlements s on s.id = o.settlement_id
  left join public.room_members responsible on responsible.room_id = s.room_id and responsible.user_id = t.responsible_user_id
  where public.is_room_member(s.room_id);

create view public.settlement_counter_message_public as
  select c.id, s.room_id, c.offer_id, author.public_member_key as author_member_key, c.body, c.created_at
  from public.settlement_counter_messages c
  join public.settlement_offers o on o.id = c.offer_id
  join public.settlements s on s.id = o.settlement_id
  join public.room_members author on author.room_id = s.room_id and author.user_id = c.author_user_id
  where public.is_room_member(s.room_id);

create view public.mission_public as
  select m.id, m.room_id, m.settlement_id, m.source_term_id, m.current_revision, m.kind,
    owner_member.public_member_key as owner_member_key, m.text, m.due_date, m.status, m.created_at, m.updated_at
  from public.missions m
  left join public.room_members owner_member on owner_member.room_id = m.room_id and owner_member.user_id = m.owner_user_id
  where public.is_room_member(m.room_id);

create view public.mission_participant_public as
  select p.mission_id, m.room_id, member.public_member_key
  from public.mission_participants p
  join public.missions m on m.id = p.mission_id
  join public.room_members member on member.room_id = m.room_id and member.user_id = p.user_id
  where public.is_room_member(m.room_id);

create view public.mission_action_public as
  select a.id, m.room_id, a.mission_id, a.revision, actor.public_member_key as actor_member_key, a.type, a.note, a.created_at
  from public.mission_actions a
  join public.missions m on m.id = a.mission_id
  join public.room_members actor on actor.room_id = m.room_id and actor.user_id = a.actor_user_id
  where public.is_room_member(m.room_id);

revoke all on public.settlement_public, public.settlement_offer_public, public.settlement_term_public, public.settlement_counter_message_public, public.mission_public, public.mission_participant_public, public.mission_action_public from anon, authenticated;
grant select on public.settlement_public, public.settlement_offer_public, public.settlement_term_public, public.settlement_counter_message_public, public.mission_public, public.mission_participant_public, public.mission_action_public to authenticated;
