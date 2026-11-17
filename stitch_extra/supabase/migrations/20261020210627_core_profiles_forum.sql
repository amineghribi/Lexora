-- ===== Profiles (pseudo unique) =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles readable by everyone" on public.profiles for select to anon, authenticated using (true);
create policy "update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username) on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u text;
begin
  u := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  if u !~ '^[a-z0-9_]{3,20}$' or exists (select 1 from public.profiles where username = u) then
    u := 'etu_' || substr(md5(random()::text || new.id::text), 1, 8);
  end if;
  insert into public.profiles (id, username) values (new.id, u);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ===== Forum =====
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  qid text not null check (char_length(qid) between 2 and 20),
  title text not null check (char_length(title) between 3 and 140),
  body text not null default '' check (char_length(body) <= 4000),
  author_id uuid references public.profiles(id) on delete set null,
  seed boolean not null default false,
  score integer not null default 0,
  created_at timestamptz not null default now()
);
create index posts_qid_idx on public.posts (qid, created_at desc);
create index posts_author_idx on public.posts (author_id);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  author_id uuid references public.profiles(id) on delete set null,
  seed boolean not null default false,
  score integer not null default 0,
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_author_idx on public.comments (author_id);
create index comments_parent_idx on public.comments (parent_id);
alter table public.posts enable row level security;
alter table public.comments enable row level security;
create policy "posts readable" on public.posts for select to anon, authenticated using (true);
create policy "comments readable" on public.comments for select to anon, authenticated using (true);
create policy "create own post" on public.posts for insert to authenticated with check (author_id = (select auth.uid()));
create policy "create own comment" on public.comments for insert to authenticated with check (author_id = (select auth.uid()));
create policy "delete own post" on public.posts for delete to authenticated using (author_id = (select auth.uid()));
create policy "delete own comment" on public.comments for delete to authenticated using (author_id = (select auth.uid()));
revoke insert, update, delete on public.posts, public.comments from anon, authenticated;
grant insert (qid, title, body, author_id) on public.posts to authenticated;
grant insert (post_id, parent_id, body, author_id) on public.comments to authenticated;
grant delete on public.posts, public.comments to authenticated;

create table public.post_votes (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (user_id, post_id)
);
create table public.comment_votes (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (user_id, comment_id)
);
create index post_votes_post_idx on public.post_votes (post_id);
create index comment_votes_comment_idx on public.comment_votes (comment_id);
alter table public.post_votes enable row level security;
alter table public.comment_votes enable row level security;
create policy "own post votes" on public.post_votes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own comment votes" on public.comment_votes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.post_votes, public.comment_votes from anon;

create or replace function public.sync_post_score() returns trigger language plpgsql security definer set search_path = '' as $$
declare pid uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts set score = coalesce((select sum(value) from public.post_votes where post_id = pid), 0) where id = pid;
  return null;
end $$;
create or replace function public.sync_comment_score() returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid := coalesce(new.comment_id, old.comment_id);
begin
  update public.comments set score = coalesce((select sum(value) from public.comment_votes where comment_id = cid), 0) where id = cid;
  return null;
end $$;
revoke execute on function public.sync_post_score(), public.sync_comment_score() from public, anon, authenticated;
create trigger post_votes_sync after insert or update or delete on public.post_votes for each row execute function public.sync_post_score();
create trigger comment_votes_sync after insert or update or delete on public.comment_votes for each row execute function public.sync_comment_score();

-- Signalements
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);
create index reports_user_idx on public.reports (user_id);
alter table public.reports enable row level security;
create policy "create own report" on public.reports for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on public.reports from anon;
revoke update, delete, select on public.reports from authenticated;
grant insert (target_type, target_id, reason) on public.reports to authenticated;
