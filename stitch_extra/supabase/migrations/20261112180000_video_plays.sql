-- Compteur de lectures des vidéos de cours : une ligne « play » par vidéo lancée, une ligne « end » si elle va jusqu'au bout.
create table public.video_plays (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course int not null,
  episode int null,
  kind text not null default 'play' check (kind in ('play','end')),
  created_at timestamptz not null default now()
);
create index video_plays_video_idx on public.video_plays (course, episode, kind);
create index video_plays_user_idx on public.video_plays (user_id, created_at desc);
alter table public.video_plays enable row level security;
create policy video_plays_insert_own on public.video_plays for insert to authenticated with check (user_id = (select auth.uid()));
-- aucune lecture côté élève : les statistiques se lisent en administration (SQL)
