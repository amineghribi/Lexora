-- Détection de rythme non humain : plus de 20 appels de service distincts en 60 s pour un même compte => pause d'une minute (RATE_LIMITED), sans bannissement.
-- Mesure sur 3 jours : un vrai élève fait 2 appels/min au maximum. Seuil 20 = 10x le rythme humain observé.
create or replace function public.qb_serve(u uuid, ids text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare d date := public.qb_today(); cur int; cur2 int; newn int; calls int;
begin
  perform public.qb_guard();
  if exists (select 1 from auth.users x where x.id = u and x.banned_until is not null and x.banned_until > now()) then
    raise exception 'ACCOUNT_BLOCKED' using errcode = 'P0001';
  end if;
  if public.qb_track(u) = 'dcem3' and exists (
       select 1 from public.qbank b where b.id = any(ids) and not exists (select 1 from public.dcem3_courses c where c.sn = b.sn)) then
    raise exception 'SCOPE_RESTRICTED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  select count(distinct served_at) into calls from public.question_views where user_id = u and served_at > now() - interval '60 seconds';
  if calls >= 20 then raise exception 'RATE_LIMITED' using errcode = 'P0001'; end if;
  delete from public.question_views where user_id = u and day < d - 2;
  select count(*) into cur from public.question_views where user_id = u and day = d;
  select count(*) into cur2 from public.question_views where user_id = u and served_at > now() - interval '2 hours';
  select count(*) into newn from (select distinct x from unnest(ids) as x) s
   where exists (select 1 from public.qbank b where b.id = s.x)
     and not exists (select 1 from public.question_views v where v.user_id = u and v.day = d and v.qid = s.x);
  if cur + newn > public.qb_daily_limit_for(u) then raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001'; end if;
  if cur2 + newn > public.qb_window_limit() then raise exception 'QUOTA_2H' using errcode = 'P0001'; end if;
  insert into public.question_views (user_id, day, qid) select u, d, b.id from public.qbank b where b.id = any(ids) on conflict do nothing;
end $$;
