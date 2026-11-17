-- A3 (types de compte) : dimension FACULTÉ dans track_courses, INVISIBLE tant qu'aucune ligne n'a de faculté.
-- Règle d'or : aucun compte existant ne change de comportement. Toutes les lignes actuelles (44 cours DCEM3) restent faculty = NULL = « toutes les facultés ».
-- Aucune donnée n'est insérée ici : remplir les listes par faculté (Monastir, Tunis, Sousse, Sfax) est une décision du propriétaire, dans une migration séparée.
-- Équivalence prouvée par supabase/tests/a3_faculty_equivalence.sql (anciennes et nouvelles fonctions comparées sur tous les comptes, puis annulation).

-- 1. Colonne faculté (NULL = toutes les facultés). La clé primaire devient un index unique qui tient compte de la faculté.
alter table public.track_courses add column if not exists faculty text;
alter table public.track_courses drop constraint if exists track_courses_faculty_chk;
alter table public.track_courses add constraint track_courses_faculty_chk check (faculty is null or faculty in ('monastir', 'tunis', 'sousse', 'sfax'));
alter table public.track_courses drop constraint if exists track_courses_pkey;
create unique index if not exists track_courses_track_sn_faculty_uq on public.track_courses (track, sn, coalesce(faculty, ''));

-- La vue de compatibilité ne montre que les lignes valables pour toutes les facultés.
create or replace view public.dcem3_courses with (security_invoker = true) as
  select sn from public.track_courses where track = 'dcem3' and faculty is null;
revoke all on public.dcem3_courses from anon, authenticated;

-- 2. Faculté d'un compte (modèle : qb_track)
create or replace function public.qb_faculty(u uuid) returns text language sql stable security definer set search_path to ''
as $f$ select (select faculty from public.profiles where id = u) $f$;
revoke all on function public.qb_faculty(uuid) from public, anon, authenticated;
grant execute on function public.qb_faculty(uuid) to service_role;

-- 3. track_filter(trk, fac) : une ligne s'applique si sa faculté est NULL ou égale à celle du compte.
-- Résidanat : les cours exclusifs sont masqués quelle que soit la faculté de la ligne (un cours réservé à un parcours reste réservé).
create or replace function public.track_filter(trk text, fac text, out restricted boolean, out sns integer[])
returns record language plpgsql stable security definer set search_path to ''
as $f$
begin
  restricted := trk <> 'residanat';
  if restricted then
    select coalesce(array_agg(distinct c.sn order by c.sn), '{}') into sns from public.track_courses c
      where c.track = trk and (c.faculty is null or c.faculty = fac);
  else
    select coalesce(array_agg(distinct c.sn order by c.sn), '{}') into sns from public.track_courses c where c.exclusive;
  end if;
end $f$;
revoke all on function public.track_filter(text, text) from public, anon, authenticated;
grant execute on function public.track_filter(text, text) to service_role;

-- Ancienne forme conservée (faculté inconnue : seules les lignes « toutes facultés » s'appliquent).
create or replace function public.track_filter(trk text, out restricted boolean, out sns integer[])
returns record language plpgsql stable security definer set search_path to ''
as $f$
begin
  select * into restricted, sns from public.track_filter(trk, null);
end $f$;

-- 4. Appelants : on part de la définition réelle de chaque fonction et on remplace un motif exact (erreur si le motif est absent).
do $m$
declare r record; src text; nsrc text;
begin
  for r in select * from (values
    ('get_course_videos', 'public.track_filter(public.qb_track(u))', 'public.track_filter(public.qb_track(u), public.qb_faculty(u))'),
    ('question_meta', 'public.track_filter(public.qb_track(u))', 'public.track_filter(public.qb_track(u), public.qb_faculty(u))'),
    ('qb_serve', 'public.track_filter(trk)', 'public.track_filter(trk, public.qb_faculty(u))'),
    ('search_questions', 'public.track_filter(public.qb_track(public.qb_uid_basic()))', 'public.track_filter(public.qb_track(public.qb_uid_basic()), public.qb_faculty(public.qb_uid_basic()))'),
    ('similar_questions', 'public.track_filter(public.qb_track(public.qb_uid_basic()))', 'public.track_filter(public.qb_track(public.qb_uid_basic()), public.qb_faculty(public.qb_uid_basic()))'),
    ('choose_track', 'if not exists (select 1 from public.track_courses where track = p_track) then',
      'if not exists (select 1 from public.track_courses where track = p_track and (coalesce(p_faculty, fac) is null or faculty is null or faculty = coalesce(p_faculty, fac))) then'),
    ('my_scope', '(select coalesce(jsonb_agg(c.sn order by c.sn), ''[]''::jsonb) from public.track_courses c where c.track = t)',
      '(select coalesce(jsonb_agg(c.sn order by c.sn), ''[]''::jsonb) from (select distinct d.sn from public.track_courses d where d.track = t and (d.faculty is null or d.faculty = f)) c)')
  ) v(fn, a, b) loop
    select pg_get_functiondef(p.oid) into strict src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.fn;
    nsrc := replace(src, r.a, r.b);
    if nsrc = src then raise exception 'A3: motif introuvable dans %', r.fn; end if;
    execute nsrc;
  end loop;
end $m$;
