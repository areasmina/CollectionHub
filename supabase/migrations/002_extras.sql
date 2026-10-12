-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Adds deck swaps + shopping-list checkmarks (per binder) and first-seen dates (per card) to sync.
alter table profiles add column if not exists extras jsonb;
alter table cards add column if not exists added timestamptz;
