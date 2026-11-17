-- Plafond de 250 questions/jour pour les comptes sans accès actif (essai gratuit ou expiré).
-- Les comptes avec un accès actif (access_grants : payant, fondateur, parrainage, custom) gardent qb_daily_limit() (5000).
create or replace function public.qb_daily_limit_for(u uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when exists (
      select 1 from public.access_grants g
      where g.user_id = u and g.starts_at <= now() and g.ends_at > now()
    ) then public.qb_daily_limit()
    else 250
  end
$$;

create or replace function public.qb_serve(u uuid, ids text[])
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare d date := public.qb_today(); cur int; cur2 int; newn int;
begin
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
