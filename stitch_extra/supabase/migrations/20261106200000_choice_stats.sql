-- Répartition des réponses des élèves par proposition (A-E), affichée après la correction.
-- Un élève compte une seule fois par question (sa première réponse non vide, comme user_answered).
-- Affichage à partir de 20 réponses. Aucune donnée individuelle exposée. Aucune notification.
create table if not exists public.choice_stats (
  qid text primary key,
  n int not null default 0,
  ca int not null default 0, cb int not null default 0, cc int not null default 0,
  cd int not null default 0, ce int not null default 0
);
alter table public.choice_stats enable row level security;
revoke all on table public.choice_stats from public, anon, authenticated;

-- Remplissage initial depuis les tentatives déjà synchronisées (première tentative non vide de chaque élève,
-- pour les questions que l'élève a déjà dans user_answered). Exécuté une seule fois (table vide).
do $$
begin
  if not exists (select 1 from public.choice_stats) then
    insert into public.choice_stats (qid, n, ca, cb, cc, cd, ce)
    select qid, count(*)::int,
      count(*) filter (where position('A' in ch) > 0)::int, count(*) filter (where position('B' in ch) > 0)::int,
      count(*) filter (where position('C' in ch) > 0)::int, count(*) filter (where position('D' in ch) > 0)::int,
      count(*) filter (where position('E' in ch) > 0)::int
    from (
      select distinct on (up.user_id, q.cid) up.user_id, q.cid as qid, upper(a->>'ch') as ch
      from public.user_progress up
      cross join lateral jsonb_array_elements(case when jsonb_typeof(up.data->'attempts') = 'array' then up.data->'attempts' else '[]'::jsonb end) a
      cross join lateral (select coalesce(b.canon, b.id) as cid from public.qbank b where b.id = a->>'q') q
      where btrim(coalesce(a->>'ch', '')) <> ''
        and exists (select 1 from public.user_answered ua where ua.user_id = up.user_id and ua.qid = q.cid)
      order by up.user_id, q.cid, coalesce(nullif(a->>'t', '')::numeric, 0)
    ) s
    group by qid;
  end if;
end $$;

-- check_answers : mêmes règles qu'avant, plus le comptage des NOUVELLES premières réponses.
create or replace function public.check_answers(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare u uuid := public.qb_uid_basic(); d date := public.qb_today(); res jsonb;
begin
  perform public.qb_guard();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 150 then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as t(i text, c text)
    where not exists (select 1 from public.question_views v where v.user_id = u and v.day >= d - 1 and v.qid = t.i)
  ) then
    raise exception 'NOT_SERVED' using errcode = 'P0001';
  end if;
  with ins as (
    insert into public.user_answered (user_id, qid)
    select distinct u, b.id from jsonb_to_recordset(p_items) as t(i text, c text) join public.qbank b on b.id = t.i
    where btrim(coalesce(t.c, '')) <> ''
    on conflict do nothing
    returning qid
  ), ch as (
    select distinct on (t.i) t.i as qid, upper(t.c) as c from jsonb_to_recordset(p_items) as t(i text, c text)
    where btrim(coalesce(t.c, '')) <> '' order by t.i
  )
  insert into public.choice_stats as s (qid, n, ca, cb, cc, cd, ce)
  select ins.qid, 1, (position('A' in ch.c) > 0)::int, (position('B' in ch.c) > 0)::int, (position('C' in ch.c) > 0)::int,
         (position('D' in ch.c) > 0)::int, (position('E' in ch.c) > 0)::int
  from ins join ch on ch.qid = ins.qid
  on conflict (qid) do update set n = s.n + 1, ca = s.ca + excluded.ca, cb = s.cb + excluded.cb, cc = s.cc + excluded.cc,
    cd = s.cd + excluded.cd, ce = s.ce + excluded.ce;
  select coalesce(jsonb_agg(jsonb_build_object('i', b.id, 'ok', public.qb_norm(t.c) = public.qb_norm(b.sec->>'c'), 'sec', b.sec)), '[]'::jsonb)
    into res
  from jsonb_to_recordset(p_items) as t(i text, c text) join public.qbank b on b.id = t.i;
  return res;
end $function$;

-- Lecture : seulement pour une question que l'élève a déjà répondue, et à partir de 20 réponses.
create or replace function public.get_choice_stats(p_qid text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; r public.choice_stats;
begin
  perform public.qb_guard();
  u := public.qb_uid_basic();
  if p_qid is null or length(p_qid) > 20 then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.user_answered where user_id = u and qid = p_qid) then
    return jsonb_build_object('n', 0, 'show', false);
  end if;
  select * into r from public.choice_stats where qid = p_qid;
  if not found or r.n < 20 then
    return jsonb_build_object('n', coalesce(r.n, 0), 'show', false);
  end if;
  return jsonb_build_object('n', r.n, 'show', true, 'pct', jsonb_build_object(
    'A', round(100.0 * r.ca / r.n), 'B', round(100.0 * r.cb / r.n), 'C', round(100.0 * r.cc / r.n),
    'D', round(100.0 * r.cd / r.n), 'E', round(100.0 * r.ce / r.n)));
end $$;
revoke all on function public.get_choice_stats(text) from public, anon;
grant execute on function public.get_choice_stats(text) to authenticated;
