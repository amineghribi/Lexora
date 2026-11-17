create table public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_progress enable row level security;
create policy "progress_select_own" on public.user_progress for select to authenticated using (user_id = (select auth.uid()));
create policy "progress_insert_own" on public.user_progress for insert to authenticated with check (user_id = (select auth.uid()));
create policy "progress_update_own" on public.user_progress for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "progress_delete_own" on public.user_progress for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.user_progress to authenticated;
