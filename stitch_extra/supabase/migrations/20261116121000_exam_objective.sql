-- Objectif de concours : cible de date (par parcours / faculté), objectifs personnels, lecture pour le widget J-xx.
--
-- Deux niveaux :
--   1. `exam_targets` — données de référence, écrites par l'équipe (service_role) : la date d'un
--      concours, éventuellement par parcours et par faculté. Une seule ligne globale (track et
--      faculty NULL) sert de repli pour tous les comptes.
--   2. `user_objectives` — réglage personnel : date propre si l'élève en a une, buts quotidien et
--      hebdomadaire. Écriture via RPC uniquement (aucun droit direct sur la table).
--
-- Le widget affiche `J-<jours>` : la date n'est jamais déduite d'un texte libre, elle vient d'ici.
-- `is_confirmed = false` fait afficher « date à confirmer » : une date provisoire ne doit pas
-- passer pour officielle.
--
-- Dépend de 20261116120000_progression_curves.sql pour le rythme hebdomadaire (lecture
-- conditionnelle : si l'agrégat quotidien n'existe pas, le rythme est calculé à zéro).

-- 1. Cibles de concours ------------------------------------------------------------------
create table public.exam_targets (
  id uuid primary key default gen_random_uuid(),
  track text check (track in ('residanat', 'dcem1', 'dcem2', 'dcem3s1', 'dcem3')),
  faculty text check (faculty in ('monastir', 'tunis', 'sousse', 'sfax')),
  label text not null check (length(btrim(label)) between 3 and 120),
  exam_date date not null,
  exam_end_date date,
  is_confirmed boolean not null default false,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (exam_end_date is null or exam_end_date >= exam_date)
);
-- une seule cible par couple (parcours, faculté) ; NULL = tous
create unique index exam_targets_scope_key
  on public.exam_targets ((coalesce(track, '*')), (coalesce(faculty, '*')));
create index exam_targets_date_idx on public.exam_targets (exam_date);

-- 2. Réglage personnel -------------------------------------------------------------------
create table public.user_objectives (
  user_id uuid primary key references auth.users (id) on delete cascade,
  exam_target_id uuid references public.exam_targets (id) on delete set null,
  exam_date date,
  daily_questions integer not null default 20 check (daily_questions between 5 and 500),
  weekly_questions integer not null default 140 check (weekly_questions between 10 and 3000),
  daily_minutes integer not null default 60 check (daily_minutes between 5 and 720),
  updated_at timestamptz not null default now()
);

-- 3. Lecture : tout ce qu'affiche le widget -------------------------------------------------
create or replace function public.my_objective()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  u uuid := public.qb_uid_basic();
  trk text := public.qb_track(u);
  fac text := public.qb_faculty(u);
  o public.user_objectives;
  d date; lbl text; conf boolean := false; src text;
  daily integer := 20; weekly integer := 140; minutes integer := 60;
  wk integer := 0; dq integer; avg numeric; need numeric; expected numeric; ontrack boolean;
begin
  select * into o from public.user_objectives where user_id = u;
  daily := coalesce(o.daily_questions, 20);
  weekly := coalesce(o.weekly_questions, 140);
  minutes := coalesce(o.daily_minutes, 60);

  -- cible explicite, puis la plus précise pour (parcours, faculté)
  if o.exam_target_id is not null then
    select t.exam_date, t.label, t.is_confirmed, t.source into d, lbl, conf, src
    from public.exam_targets t where t.id = o.exam_target_id;
  end if;
  if d is null then
    select t.exam_date, t.label, t.is_confirmed, t.source into d, lbl, conf, src
    from public.exam_targets t
    where (t.track is null or t.track = trk) and (t.faculty is null or t.faculty = fac)
    order by (t.faculty is not null) desc, (t.track is not null) desc, t.exam_date
    limit 1;
  end if;
  -- une date personnelle prime sur la cible
  if o.exam_date is not null then
    d := o.exam_date; lbl := 'Objectif personnel'; src := 'personnel'; conf := true;
  end if;

  -- volume de la semaine : lu sur l'agrégat quotidien quand il est déjà en place
  if to_regclass('public.progress_daily') is not null then
    execute 'select count(*) from public.progress_daily where user_id = $1 and day > $2'
      into wk using u, public.qb_today() - 7;
  end if;

  dq := greatest(1, extract(isodow from public.qb_today())::integer); -- 1 = lundi … 7 = dimanche
  avg := round(wk / 7.0, 1);
  need := ceil(weekly / 7.0);
  expected := weekly * dq / 7.0;
  ontrack := wk >= expected * 0.85;

  return jsonb_build_object(
    'exam_date', d,
    'label', coalesce(lbl, 'Concours — date à confirmer'),
    'is_confirmed', coalesce(conf, false),
    'source', src,
    'days_left', case when d is null then null else (d - public.qb_today()) end,
    'today', public.qb_today(),
    'track', trk,
    'faculty', fac,
    'goals', jsonb_build_object('daily_questions', daily, 'weekly_questions', weekly, 'daily_minutes', minutes),
    'week', jsonb_build_object('answered', wk, 'target', weekly,
      'pct', least(100, round(100.0 * wk / greatest(1, weekly)))),
    'pace', jsonb_build_object('avg_per_day', avg, 'needed_per_day', need, 'on_track', ontrack));
end $function$;

-- 4. Écriture : objectif personnel ---------------------------------------------------------
create or replace function public.set_my_objective(
  p_exam_date date default null,
  p_daily_questions integer default null,
  p_weekly_questions integer default null,
  p_daily_minutes integer default null,
  p_exam_target uuid default null)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic();
begin
  if p_exam_target is not null and not exists (select 1 from public.exam_targets where id = p_exam_target) then
    raise exception 'UNKNOWN_TARGET' using errcode = 'P0001';
  end if;
  insert into public.user_objectives as o (user_id, exam_target_id, exam_date, daily_questions, weekly_questions, daily_minutes, updated_at)
  values (u,
          p_exam_target,
          p_exam_date,
          coalesce(p_daily_questions, 20),
          coalesce(p_weekly_questions, 140),
          coalesce(p_daily_minutes, 60),
          now())
  on conflict (user_id) do update set
    exam_target_id = coalesce(excluded.exam_target_id, o.exam_target_id),
    exam_date = excluded.exam_date,
    daily_questions = excluded.daily_questions,
    weekly_questions = excluded.weekly_questions,
    daily_minutes = excluded.daily_minutes,
    updated_at = now();
  return public.my_objective();
end $function$;

-- 5. Administration des dates (service_role uniquement) -------------------------------------
create or replace function public.exam_target_upsert(
  p_id uuid,
  p_track text,
  p_faculty text,
  p_label text,
  p_exam_date date,
  p_end date default null,
  p_confirmed boolean default false,
  p_source text default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare r uuid;
begin
  if p_label is null or length(btrim(p_label)) not between 3 and 120 then raise exception 'BAD_LABEL' using errcode = 'P0001'; end if;
  if p_exam_date is null then raise exception 'BAD_DATE' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into public.exam_targets (track, faculty, label, exam_date, exam_end_date, is_confirmed, source)
    values (p_track, p_faculty, btrim(p_label), p_exam_date, p_end, coalesce(p_confirmed, false), p_source)
    returning id into r;
  else
    update public.exam_targets set
      track = p_track, faculty = p_faculty, label = btrim(p_label), exam_date = p_exam_date,
      exam_end_date = p_end, is_confirmed = coalesce(p_confirmed, false), source = p_source, updated_at = now()
    where id = p_id returning id into r;
    if r is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  return r;
end $function$;

-- 6. Graine : date officielle confirmée, unique si la table est vide --------------------------
-- Date communiquée par l'équipe le 2026-11-16 : 2026-12-23 (J-37 le jour de la saisie).
-- `is_confirmed = true` : le widget affiche la date sans mention « à confirmer ».
insert into public.exam_targets (track, faculty, label, exam_date, is_confirmed, source)
select null, null, 'Concours national de résidanat', date '2026-12-23', true,
       'Date officielle confirmée par l''équipe (2026-11-16)'
where not exists (select 1 from public.exam_targets);

-- 7. RLS et droits -------------------------------------------------------------------------
alter table public.exam_targets enable row level security;
alter table public.user_objectives enable row level security;

create policy exam_targets_select_auth on public.exam_targets
  for select to authenticated using (true);
create policy user_objectives_select_own on public.user_objectives
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_objectives_insert_own on public.user_objectives
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_objectives_update_own on public.user_objectives
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_objectives_delete_own on public.user_objectives
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.exam_targets, public.user_objectives from anon, authenticated;
grant select on public.exam_targets to authenticated;
grant select, insert, update, delete on public.user_objectives to authenticated;

revoke execute on function public.my_objective() from public, anon;
grant execute on function public.my_objective() to authenticated;
revoke execute on function public.set_my_objective(date, integer, integer, integer, uuid) from public, anon;
grant execute on function public.set_my_objective(date, integer, integer, integer, uuid) to authenticated;
revoke execute on function public.exam_target_upsert(uuid, text, text, text, date, date, boolean, text) from public, anon, authenticated;
grant execute on function public.exam_target_upsert(uuid, text, text, text, date, date, boolean, text) to service_role;

comment on table public.exam_targets is 'Dates de concours par parcours/faculté (NULL = tous). Écriture réservée à service_role.';
comment on table public.user_objectives is 'Objectif personnel : date, but quotidien et hebdomadaire. Écriture via set_my_objective().';
