-- Journal des bannissements : on enregistre l'IP et le navigateur AVANT de supprimer les sessions.
create table if not exists public.banned_users_log (
  id bigserial primary key,
  user_id uuid,
  username text,
  email text,
  ip inet,
  user_agent text,
  reason text,
  banned_at timestamptz not null default now()
);
alter table public.banned_users_log enable row level security;

-- IP bloquées : toute nouvelle session (connexion) depuis ces adresses est refusée.
create table if not exists public.blocked_ips (
  ip inet primary key,
  reason text,
  added_at timestamptz not null default now()
);
alter table public.blocked_ips enable row level security;

create or replace function public.block_banned_ip()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.ip is not null and exists (select 1 from public.blocked_ips b where b.ip = new.ip) then
    raise exception 'IP_BLOCKED' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists block_banned_ip_trg on auth.sessions;
create trigger block_banned_ip_trg
  before insert on auth.sessions
  for each row execute function public.block_banned_ip();

-- qb_serve : refuse aussi les comptes bannis qui ont encore un jeton d'accès valide.
create or replace function public.qb_serve(u uuid, ids text[])
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare d date := public.qb_today(); cur int; cur2 int; newn int;
begin
  if exists (select 1 from auth.users x where x.id = u and x.banned_until is not null and x.banned_until > now()) then
    raise exception 'ACCOUNT_BLOCKED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  delete from public.question_views where user_id = u and day < d - 2;
  select count(*) into cur from public.question_views where user_id = u and day = d;
  select count(*) into cur2 from public.question_views where user_id = u and served_at > now() - interval '2 hours';
  select count(*) into newn from (select distinct x from unnest(ids) as x) s
   where exists (select 1 from public.qbank b where b.id = s.x)
     and not exists (select 1 from public.question_views v where v.user_id = u and v.day = d and v.qid = s.x);
  if cur + newn > public.qb_daily_limit_for(u) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  if cur2 + newn > public.qb_window_limit() then
    raise exception 'QUOTA_2H' using errcode = 'P0001';
  end if;
  insert into public.question_views (user_id, day, qid)
  select u, d, b.id from public.qbank b where b.id = any(ids)
  on conflict do nothing;
end $function$;
