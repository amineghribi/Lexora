-- Courbes de progression : journal des réponses, agrégat quotidien, RPC de lecture.
--
-- Principe : le journal `progress_events` est append-only et alimenté par `check_answers`
-- (déjà appelé pour chaque réponse, en mode immédiat comme en mode examen). Aucune clé de
-- question, aucun quota et aucun filtre `canon`/`p`/`f` ne sont modifiés : la fonction est
-- réécrite à l'identique, avec un bloc d'écriture ajouté en fin de traitement.
--
-- Une question comptée une seule fois par jour et par compte (`unique (user_id, qid, answered_on)`) :
-- les renvois successifs du même item dans une série d'examen ne gonflent pas la courbe.
--
-- Rien n'est appliqué par ce fichier : il est destiné à `apply_migration` sur le projet
-- wraxarmiohrhrlzlpqyy, après un « go » explicite.

-- 1. Journal des réponses ---------------------------------------------------------------
create table public.progress_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  qid text not null,
  sn integer,
  sp text,
  ok boolean not null,
  pts numeric(3, 2) not null default 0 check (pts >= 0 and pts <= 1),
  answered_on date not null,
  answered_at timestamptz not null default now(),
  source text not null default 'app' check (source in ('app', 'exam', 'arc', 'backfill')),
  unique (user_id, qid, answered_on)
);
create index progress_events_user_day_idx on public.progress_events (user_id, answered_on desc);
create index progress_events_user_sp_idx on public.progress_events (user_id, sp) where sp is not null;

-- 2. Agrégat quotidien (une ligne par compte et par jour) ---------------------------------
create table public.progress_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  answered integer not null default 0 check (answered >= 0),
  correct integer not null default 0 check (correct >= 0),
  points numeric(8, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Recalcule les journées touchées par l'écriture. Déclencheur au niveau instruction avec
-- table de transition : un lot de 150 réponses ne recalcule chaque journée qu'une fois.
create or replace function public.progress_events_rollup()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  delete from public.progress_daily d
  using (select distinct user_id, answered_on from delta) c
  where d.user_id = c.user_id and d.day = c.answered_on;

  insert into public.progress_daily (user_id, day, answered, correct, points, updated_at)
  select e.user_id, e.answered_on, count(*), count(*) filter (where ok), coalesce(sum(pts), 0), now()
  from public.progress_events e
  join (select distinct user_id, answered_on from delta) c
    on c.user_id = e.user_id and c.answered_on = e.answered_on
  group by e.user_id, e.answered_on;
  return null;
end $function$;

-- garde d'horodatage de l'agrégat
create or replace function public.progress_daily_touch()
returns trigger language plpgsql set search_path to ''
as $function$
begin
  new.updated_at := now();
  return new;
end $function$;

create trigger progress_events_rollup_ins after insert on public.progress_events
  referencing new table as delta
  for each statement execute function public.progress_events_rollup();
create trigger progress_events_rollup_del after delete on public.progress_events
  referencing old table as delta
  for each statement execute function public.progress_events_rollup();
create trigger progress_daily_touch before update on public.progress_daily
  for each row execute function public.progress_daily_touch();


-- 3. Alimentation : check_answers (corps d'origine conservé, écriture ajoutée) -------------
create or replace function public.check_answers(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
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

  -- Journal de progression : le score serveur est binaire (juste / faux) ; le score partiel
  -- d'une question à réponses multiples reste calculé côté client.
  begin
    insert into public.progress_events (user_id, qid, sn, sp, ok, pts, answered_on, answered_at, source)
    select u, b.id, b.sn, nullif(btrim(split_part(coalesce(b.sp, ''), ', ', 1)), ''),
           public.qb_norm(t.c) = public.qb_norm(b.sec->>'c'),
           case when public.qb_norm(t.c) = public.qb_norm(b.sec->>'c') then 1 else 0 end,
           d, now(), 'app'
    from jsonb_to_recordset(p_items) as t(i text, c text)
    join public.qbank b on b.id = t.i
    where btrim(coalesce(t.c, '')) <> ''
    on conflict (user_id, qid, answered_on) do nothing;
  exception when others then null; -- le journal ne doit jamais empêcher une correction
  end;

  return res;
end $function$;

-- 4. Lecture : séries quotidiennes, totaux, série de jours, spécialités -------------------
create or replace function public.my_progression(p_days integer default 90)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  u uuid := public.qb_uid_basic();
  n integer := greatest(7, least(coalesce(p_days, 90), 365));
  first_day date := public.qb_today() - (n - 1);
  daily jsonb; totals jsonb; bysp jsonb; streak integer; best jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', s.day, 'answered', coalesce(p.answered, 0),
           'correct', coalesce(p.correct, 0), 'points', coalesce(p.points, 0)) order by s.day), '[]'::jsonb)
    into daily
  from generate_series(first_day::timestamp, public.qb_today()::timestamp, interval '1 day') g
  cross join lateral (select g::date as day) s
  left join public.progress_daily p on p.user_id = u and p.day = s.day;

  select jsonb_build_object(
           'answered', coalesce(sum(answered), 0),
           'correct', coalesce(sum(correct), 0),
           'points', coalesce(sum(points), 0),
           'accuracy', case when coalesce(sum(answered), 0) > 0
                            then round(100.0 * sum(correct) / sum(answered)) else 0 end,
           'active_days', count(*) filter (where answered > 0))
    into totals
  from public.progress_daily
  where user_id = u and day >= first_day;

  select jsonb_build_object('day', day, 'answered', answered)
    into best
  from public.progress_daily
  where user_id = u and day >= first_day and answered > 0
  order by answered desc, day desc limit 1;

  -- série en cours : jours consécutifs avec au moins une réponse, se terminant aujourd'hui ou hier
  with d0 as (
    select day from public.progress_daily
    where user_id = u and day <= public.qb_today() and answered > 0
  ), grp as (
    select day, day - (row_number() over (order by day))::int as g from d0
  ), runs as (
    select g, count(*) as len, max(day) as last_day from grp group by g
  )
  select coalesce((select len from runs where last_day >= public.qb_today() - 1 order by last_day desc limit 1), 0)
    into streak;

  select coalesce(jsonb_agg(jsonb_build_object('sp', t.sp, 'answered', t.n, 'correct', t.c) order by t.n desc), '[]'::jsonb)
    into bysp
  from (
    select coalesce(nullif(sp, ''), 'Autres') as sp, count(*) as n, count(*) filter (where ok) as c
    from public.progress_events
    where user_id = u and answered_on >= first_day
    group by 1
  ) t;

  return jsonb_build_object(
    'days', n,
    'track', public.qb_track(u),
    'today', public.qb_today(),
    'daily', daily,
    'by_specialty', bysp,
    'totals', coalesce(totals, '{}'::jsonb) || jsonb_build_object('streak', streak, 'best_day', best));
end $function$;

-- 5. Reprise de l'historique déjà stocké dans user_progress.data->'attempts' --------------
--    Format d'une tentative : {q, d: 'AAAA-MM-JJ', ok, p, ch, t: epoch ms}
--    Réservé au service_role : c'est une reprise ponctuelle, pas un droit client.
create or replace function public.progression_backfill(p_user uuid default null)
returns integer language plpgsql security definer set search_path to ''
as $function$
declare n integer;
begin
  with src as (
    select up.user_id,
           (a->>'q') as qid,
           case when (a->>'d') ~ '^\d{4}-\d{2}-\d{2}$' then (a->>'d')::date end as day,
           case when (a->>'t') ~ '^\d+$' then to_timestamp(((a->>'t')::bigint) / 1000.0) end as at,
           coalesce((a->>'ok')::boolean, false) as ok
    from public.user_progress up
    cross join lateral jsonb_array_elements(coalesce(up.data->'attempts', '[]'::jsonb)) a
    where (p_user is null or up.user_id = p_user)
      and coalesce(a->>'q', '') <> ''
  ), clean as (
    select s.user_id, s.qid, s.day, s.ok, coalesce(s.at, s.day::timestamptz + interval '12 hours') as at
    from src s
    where s.day is not null and s.day >= date '2025-01-01' and s.day <= public.qb_today()
  )
  insert into public.progress_events (user_id, qid, sn, sp, ok, pts, answered_on, answered_at, source)
  select c.user_id, b.id, b.sn, nullif(btrim(split_part(coalesce(b.sp, ''), ', ', 1)), ''),
         c.ok, case when c.ok then 1 else 0 end, c.day, c.at, 'backfill'
  from clean c
  join public.qbank b on b.id = c.qid
  on conflict (user_id, qid, answered_on) do nothing;
  get diagnostics n = row_count;
  return n;
end $function$;

-- 6. RLS et droits -----------------------------------------------------------------------
alter table public.progress_events enable row level security;
alter table public.progress_daily enable row level security;

create policy progress_events_select_own on public.progress_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy progress_daily_select_own on public.progress_daily
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.progress_events, public.progress_daily from anon, authenticated;
grant select on public.progress_events, public.progress_daily to authenticated;

revoke execute on function public.progress_events_rollup() from public, anon, authenticated;
revoke execute on function public.progress_daily_touch() from public, anon, authenticated;
revoke execute on function public.my_progression(integer) from public, anon;
grant execute on function public.my_progression(integer) to authenticated;
revoke execute on function public.progression_backfill(uuid) from public, anon, authenticated;
grant execute on function public.progression_backfill(uuid) to service_role;

comment on table public.progress_events is 'Journal des réponses (une ligne par question et par jour), alimenté par check_answers.';
comment on table public.progress_daily is 'Agrégat quotidien par compte, maintenu par trigger depuis progress_events.';
