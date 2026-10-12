-- Run once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists profiles (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slot int not null check (slot in (1, 2)),
  name text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

create table if not exists cards (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slot int not null check (slot in (1, 2)),
  card_id text not null,
  name text not null,
  qty int not null check (qty > 0),
  set_code text,
  collector_number text,
  foil boolean not null default false
);
create index if not exists cards_user on cards (user_id);

create table if not exists decks (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slot int not null check (slot in (1, 2)),
  name text not null,
  commander text,
  cards jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists decks_user on decks (user_id);

-- Row-level security: each signed-in user sees and changes only their own rows.
alter table profiles enable row level security;
alter table cards enable row level security;
alter table decks enable row level security;
create policy "own profiles" on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own cards" on cards for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own decks" on decks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
