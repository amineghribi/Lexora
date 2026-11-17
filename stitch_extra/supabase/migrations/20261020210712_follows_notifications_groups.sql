-- ===== Suivi de questions =====
create table public.follows (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  qid text not null check (char_length(qid) between 2 and 20),
  created_at timestamptz not null default now(),
  primary key (user_id, qid)
);
create index follows_qid_idx on public.follows (qid);
alter table public.follows enable row level security;
create policy "own follows" on public.follows for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.follows from anon;

-- ===== Groupes d'étude =====
create table public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index study_groups_owner_idx on public.study_groups (owner_id);
create table public.group_members (
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','member')),
  role text not null default 'member' check (role in ('owner','member')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
create index group_members_inviter_idx on public.group_members (invited_by);
create table public.group_notes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  qid text not null check (char_length(qid) between 2 and 20),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index group_notes_group_idx on public.group_notes (group_id, qid, created_at);
create index group_notes_author_idx on public.group_notes (author_id);

create or replace function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = (select auth.uid()) and status = 'member')
$$;
create or replace function public.is_group_owner(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.study_groups where id = gid and owner_id = (select auth.uid()))
$$;
create or replace function public.is_group_invited(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = (select auth.uid()))
$$;
revoke execute on function public.is_group_member(uuid), public.is_group_owner(uuid), public.is_group_invited(uuid) from public, anon;
grant execute on function public.is_group_member(uuid), public.is_group_owner(uuid), public.is_group_invited(uuid) to authenticated;

alter table public.study_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_notes enable row level security;
revoke all on public.study_groups, public.group_members, public.group_notes from anon;
revoke insert, update, delete on public.study_groups, public.group_members, public.group_notes from authenticated;

create policy "see my groups" on public.study_groups for select to authenticated using (public.is_group_invited(id));
create policy "create group" on public.study_groups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owner renames" on public.study_groups for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner deletes" on public.study_groups for delete to authenticated using (owner_id = (select auth.uid()));
grant insert (name, owner_id) on public.study_groups to authenticated;
grant update (name) on public.study_groups to authenticated;
grant delete on public.study_groups to authenticated;

create policy "see roster" on public.group_members for select to authenticated using (user_id = (select auth.uid()) or public.is_group_member(group_id));
create policy "members invite" on public.group_members for insert to authenticated with check (public.is_group_member(group_id) and status = 'invited' and role = 'member' and invited_by = (select auth.uid()) and user_id <> (select auth.uid()));
create policy "accept own invite" on public.group_members for update to authenticated using (user_id = (select auth.uid()) and status = 'invited') with check (user_id = (select auth.uid()) and status = 'member' and role = 'member');
create policy "leave or remove" on public.group_members for delete to authenticated using (role <> 'owner' and (user_id = (select auth.uid()) or public.is_group_owner(group_id)));
grant insert (group_id, user_id, status, role, invited_by) on public.group_members to authenticated;
grant update (status) on public.group_members to authenticated;
grant delete on public.group_members to authenticated;

create policy "read group notes" on public.group_notes for select to authenticated using (public.is_group_member(group_id));
create policy "add group note" on public.group_notes for insert to authenticated with check (author_id = (select auth.uid()) and public.is_group_member(group_id));
create policy "delete group note" on public.group_notes for delete to authenticated using (author_id = (select auth.uid()) or public.is_group_owner(group_id));
grant insert (group_id, qid, body, author_id) on public.group_notes to authenticated;
grant delete on public.group_notes to authenticated;

-- ===== Notifications =====
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('new_post','reply','group_invite','group_join','group_note')),
  qid text,
  post_id uuid references public.posts(id) on delete cascade,
  group_id uuid references public.study_groups(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  body text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_post_idx on public.notifications (post_id);
create index notifications_group_idx on public.notifications (group_id);
create index notifications_actor_idx on public.notifications (actor_id);
alter table public.notifications enable row level security;
create policy "read own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "mark own read" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own notifications" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

-- ===== Triggers =====
create or replace function public.on_group_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_members (group_id, user_id, status, role) values (new.id, new.owner_id, 'member', 'owner');
  return new;
end $$;
create trigger group_owner_member after insert on public.study_groups for each row execute function public.on_group_created();

create or replace function public.on_post_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.author_id is null then return new; end if;
  insert into public.follows (user_id, qid) values (new.author_id, new.qid) on conflict do nothing;
  insert into public.notifications (user_id, kind, qid, post_id, actor_id, body)
    select f.user_id, 'new_post', new.qid, new.id, new.author_id, left(new.title, 120)
    from public.follows f where f.qid = new.qid and f.user_id <> new.author_id;
  return new;
end $$;
create trigger post_created after insert on public.posts for each row execute function public.on_post_created();

create or replace function public.on_comment_created() returns trigger language plpgsql security definer set search_path = '' as $$
declare q text;
begin
  if new.author_id is null then return new; end if;
  select qid into q from public.posts where id = new.post_id;
  insert into public.follows (user_id, qid) values (new.author_id, q) on conflict do nothing;
  insert into public.notifications (user_id, kind, qid, post_id, actor_id, body)
    select distinct r.uid, 'reply', q, new.post_id, new.author_id, left(new.body, 120)
    from (
      select author_id as uid from public.posts where id = new.post_id
      union select author_id from public.comments where post_id = new.post_id
    ) r where r.uid is not null and r.uid <> new.author_id;
  return new;
end $$;
create trigger comment_created after insert on public.comments for each row execute function public.on_comment_created();

create or replace function public.on_member_added() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'invited' then
    insert into public.notifications (user_id, kind, group_id, actor_id, body)
      values (new.user_id, 'group_invite', new.group_id, new.invited_by, (select name from public.study_groups where id = new.group_id));
  elsif tg_op = 'UPDATE' and old.status = 'invited' and new.status = 'member' and new.invited_by is not null then
    insert into public.notifications (user_id, kind, group_id, actor_id, body)
      values (new.invited_by, 'group_join', new.group_id, new.user_id, (select name from public.study_groups where id = new.group_id));
  end if;
  return new;
end $$;
create trigger member_added after insert or update on public.group_members for each row execute function public.on_member_added();

create or replace function public.on_group_note() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, qid, group_id, actor_id, body)
    select m.user_id, 'group_note', new.qid, new.group_id, new.author_id, left(new.body, 120)
    from public.group_members m where m.group_id = new.group_id and m.status = 'member' and m.user_id <> new.author_id;
  return new;
end $$;
create trigger group_note_created after insert on public.group_notes for each row execute function public.on_group_note();

revoke execute on function public.on_group_created(), public.on_post_created(), public.on_comment_created(), public.on_member_added(), public.on_group_note() from public, anon, authenticated;

alter publication supabase_realtime add table public.notifications;
