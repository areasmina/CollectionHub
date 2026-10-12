-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Adds deck notes and tags to sync.
alter table decks add column if not exists extras jsonb;

