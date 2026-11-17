-- Quota : 1000 questions différentes par tranche de 2 h glissantes, 5000 par jour (jour à l'heure de Tunis).
-- Additif : ajoute la colonne served_at (NULL pour les anciennes lignes = non comptées dans la fenêtre de 2 h).
alter table public.question_views add column if not exists served_at timestamptz;
alter table public.question_views alter column served_at set default now();
create index if not exists question_views_recent_idx on public.question_views (user_id, served_at);

create or replace function public.qb_daily_limit() returns int
language sql immutable set search_path = '' as $$ select 5000 $$;
create or replace function public.qb_window_limit() returns int
language sql immutable set search_path = '' as $$ select 1000 $$;
revoke all on function public.qb_window_limit() from public, anon, authenticated;

create or replace function public.qb_serve(u uuid, ids text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare d date := public.qb_today(); cur int; cur2 int; newn int;
begin
  perform pg_advisory_xact_lock(hashtext(u::text));
  delete from public.question_views where user_id = u and day < d - 2;
  select count(*) into cur from public.question_views where user_id = u and day = d;
  select count(*) into cur2 from public.question_views where user_id = u and served_at > now() - interval '2 hours';
  select count(*) into newn from (select distinct x from unnest(ids) as x) s
   where exists (select 1 from public.qbank b where b.id = s.x)
     and not exists (select 1 from public.question_views v where v.user_id = u and v.day = d and v.qid = s.x);
  if cur + newn > public.qb_daily_limit() then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  if cur2 + newn > public.qb_window_limit() then
    raise exception 'QUOTA_2H' using errcode = 'P0001';
  end if;
  insert into public.question_views (user_id, day, qid)
  select u, d, b.id from public.qbank b where b.id = any(ids)
  on conflict do nothing;
end $$;
revoke all on function public.qb_serve(uuid, text[]) from public, anon, authenticated;
