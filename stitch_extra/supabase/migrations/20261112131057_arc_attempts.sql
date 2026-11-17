create table public.arc_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  motif text not null check (char_length(motif) <= 64),
  case_id text not null check (char_length(case_id) <= 64),
  pct int not null check (pct between 0 and 100),
  dx_ok boolean not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index arc_attempts_user_idx on public.arc_attempts (user_id, created_at desc);
alter table public.arc_attempts enable row level security;
create policy arc_attempts_select_own on public.arc_attempts for select to authenticated using (user_id = (select auth.uid()));
create policy arc_attempts_insert_own on public.arc_attempts for insert to authenticated with check (user_id = (select auth.uid()));
