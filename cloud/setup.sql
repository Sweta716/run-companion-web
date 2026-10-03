-- Run once in your Supabase project's SQL Editor.
-- Completed activity summaries only. No raw activity files or GPS routes.
begin;
create table if not exists public.run_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null check (length(record_id) between 1 and 200),
  kind text not null check (kind in ('run', 'import')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
  created_at timestamptz not null default now(),
  primary key (user_id, record_id)
);
alter table public.run_records enable row level security;
revoke all on public.run_records from anon, authenticated;
grant select, insert on public.run_records to authenticated;
drop policy if exists "Read own runs" on public.run_records;
create policy "Read own runs" on public.run_records for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Save own runs" on public.run_records;
create policy "Save own runs" on public.run_records for insert to authenticated
  with check ((select auth.uid()) = user_id);
commit;
