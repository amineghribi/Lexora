-- ===== P1 : interfaces par type de compte, rôle enseignant appliqué en base, modèle de contenu ARC =====
-- Déjà appliquée en production (nom : p1_interfaces_roles_arc_content). Fichier ajouté pour que le dépôt reflète la base.

-- 1. Helpers de rôle ---------------------------------------------------------------------------
create or replace function public.is_teacher(u uuid)
returns boolean language sql stable security definer set search_path to ''
as $$ select exists (select 1 from public.account_roles where user_id = u and role = 'teacher') $$;
revoke execute on function public.is_teacher(uuid) from public, anon, authenticated;

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path to ''
as $$ select exists (select 1 from public.account_roles where user_id = auth.uid() and role = 'teacher') $$;

create or replace function public.my_specialties()
returns text[] language sql stable security definer set search_path to ''
as $$ select coalesce(array_agg(t.specialty order by t.specialty), '{}'::text[])
      from public.teacher_specialties t
      where t.user_id = auth.uid() and exists (select 1 from public.account_roles r where r.user_id = t.user_id and r.role = 'teacher') $$;

-- 2. Enseignant : aucun accès QCM / vidéos / PDF (appliqué en base, pas seulement dans l'interface) -----------
create or replace function public.qb_has_access(u uuid)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select not public.is_teacher(u) and (
         now() < public.promo_end()
      or exists (select 1 from auth.users x where x.id = u and x.created_at + interval '7 days' > now())
      or exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now()
                 and (g.scope = public.qb_track(u) or g.plan = 'founder')))
$function$;

create or replace function public.my_access()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := auth.uid(); tr timestamptz; pu timestamptz; paid boolean; trk text;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  trk := public.qb_track(u);
  if public.is_teacher(u) then
    return jsonb_build_object('status', 'teacher', 'trial_ends_at', null, 'paid_until', null, 'now', now(), 'track', trk);
  end if;
  select greatest(created_at + interval '7 days', public.promo_end()) into tr from auth.users where id = u;
  select max(ends_at) into pu from public.access_grants where user_id = u and ends_at > now() and (scope = trk or plan = 'founder');
  select exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now() and (g.scope = trk or g.plan = 'founder')) into paid;
  return jsonb_build_object('status', case when paid then 'paid' when tr > now() then 'trial' else 'expired' end,
    'trial_ends_at', tr, 'paid_until', pu, 'now', now(), 'track', trk);
end $function$;

create or replace function public.pdf_allow(p_course text)
returns text language plpgsql security definer set search_path to ''
as $function$
declare u uuid := auth.uid(); n_all int; n_min int; n_dist int; known boolean;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if public.is_teacher(u) then raise exception 'ACCESS_EXPIRED' using errcode = 'P0001'; end if;
  if p_course is null or p_course !~ '^[0-9]{1,3}(_[0-9])?$' then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if exists (select 1 from auth.users x where x.id = u and x.banned_until is not null and x.banned_until > now()) then
    raise exception 'ACCOUNT_BLOCKED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('pdf:' || u::text));
  delete from public.pdf_opens where user_id = u and at < now() - interval '2 days';
  select count(*), count(*) filter (where at > now() - interval '60 seconds'),
         count(distinct course), coalesce(bool_or(course = p_course), false)
    into n_all, n_min, n_dist, known
    from public.pdf_opens where user_id = u and at > now() - interval '24 hours';
  if n_min >= 30 or n_all >= 300 or (not known and n_dist >= 25) then return 'denied'; end if;
  insert into public.pdf_opens (user_id, course) values (u, p_course);
  return 'ok';
end $function$;

-- 3. choose_track : verrou de faculté, retour Résidanat pour les payants, faculté obligatoire en DCEM3 -----------
alter table public.profiles drop constraint if exists profiles_track_faculty_chk;
alter table public.profiles add constraint profiles_track_faculty_chk
  check (track <> all (array['dcem1','dcem2','dcem3s1','dcem3']) or faculty is not null);

create or replace function public.choose_track(p_track text, p_faculty text default null)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); cur text; chosen timestamptz; fac text;
        ord constant text[] := array['dcem1', 'dcem2', 'dcem3s1', 'dcem3'];
begin
  if public.is_teacher(u) then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if p_track not in ('residanat', 'dcem1', 'dcem2', 'dcem3s1', 'dcem3') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if p_faculty is not null and p_faculty not in ('monastir', 'tunis', 'sousse', 'sfax') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  select track, track_set_at, faculty into cur, chosen, fac from public.profiles where id = u;
  if p_track in ('dcem1', 'dcem2', 'dcem3s1') then
    if not exists (select 1 from public.track_courses where track = p_track and (coalesce(p_faculty, fac) is null or faculty is null or faculty = coalesce(p_faculty, fac))) then
      raise exception 'TRACK_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end if;
  if p_track = any (ord) and coalesce(p_faculty, fac) is null then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  -- la faculté ne change plus une fois le niveau DCEM choisi
  if chosen is not null and cur = any (ord) and fac is not null and p_faculty is not null and p_faculty <> fac then
    raise exception 'FACULTY_LOCKED' using errcode = 'P0001';
  end if;
  -- pas de retour en arrière, sauf vers Résidanat pour un payant Résidanat ou dans les 24 h suivant le choix
  if chosen is not null and cur = any (ord) and p_track <> cur then
    if p_track = 'residanat' then
      if not (exists (select 1 from public.access_grants g where g.user_id = u and g.scope = 'residanat' and g.starts_at <= now() and g.ends_at > now())
              or now() < chosen + interval '24 hours') then
        raise exception 'TRACK_LOCKED' using errcode = 'P0001';
      end if;
    elsif array_position(ord, p_track) <= array_position(ord, cur) then
      raise exception 'TRACK_LOCKED' using errcode = 'P0001';
    end if;
  end if;
  perform set_config('app.track_rpc', '1', true);
  update public.profiles
     set track = p_track, faculty = coalesce(p_faculty, faculty),
         track_set_at = case when track_set_at is null or p_track is distinct from cur then now() else track_set_at end
   where id = u;
  return public.my_scope();
end $function$;

-- 4. Routage et accès ARC -------------------------------------------------------------------------------
create or replace function public.my_interface()
returns text language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); st text; trk text;
begin
  if public.is_teacher(u) then return 'teacher'; end if;
  st := (public.my_access())->>'status';
  if st = 'expired' then return 'expired'; end if;
  trk := public.qb_track(u);
  return case trk when 'residanat' then 'residanat' when 'dcem3' then 'dcem3' else 'level' end;
end $function$;

create or replace function public.arc_access()
returns boolean language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := auth.uid();
begin
  if u is null then return false; end if;
  if exists (select 1 from auth.users x where x.id = u and ((x.banned_until is not null and x.banned_until > now()) or x.email_confirmed_at is null)) then return false; end if;
  if public.is_teacher(u) then return true; end if;
  return coalesce((public.my_access())->>'status', '') = 'paid';
end $function$;

-- 5. Index des spécialités du niveau/faculté de l'élève (interface C et filtre du catalogue ARC) ---------------
create or replace function public.my_specialty_index()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid(); fr boolean; fs integer[];
begin
  perform public.qb_guard();
  select * into fr, fs from public.track_filter(public.qb_track(u), public.qb_faculty(u));
  return coalesce((
    select jsonb_agg(jsonb_build_object('sp', t.sp, 'questions', t.q, 'courses', t.c) order by t.q desc, t.sp)
    from (
      select s.sp, count(*) as q, count(distinct b.sn) as c
      from public.qbank b cross join lateral unnest(string_to_array(b.sp, ', ')) as s(sp)
      where b.p and coalesce(b.f, '') <> 'x'
        and (case when fr then b.sn = any (fs) else (b.sn is null or b.sn <> all (fs)) end)
        and btrim(s.sp) <> '' and s.sp not ilike 'Examens blancs%'
      group by s.sp
    ) t), '[]'::jsonb);
end $function$;

-- 6. Modèle de contenu ARC ------------------------------------------------------------------------------------
create table public.specialty_map (
  slug text primary key check (slug ~ '^[a-z0-9_-]{2,40}$'),
  label text not null unique,
  sort_order integer not null default 0
);
comment on table public.specialty_map is 'Pont entre teacher_specialties.specialty (slug) et qbank.sp (libellé). Un libellé peut exister à plusieurs niveaux : le niveau est porté par arc_cases.track, pas ici. Alimentée en P2.';

create table public.arc_cases (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id),
  specialty_slug text not null references public.specialty_map (slug),
  track text not null check (track in ('dcem1', 'dcem2', 'dcem3s1', 'dcem3')),
  faculty text check (faculty is null or faculty in ('monastir', 'tunis', 'sousse', 'sfax')),
  motif text not null check (length(btrim(motif)) between 2 and 120),
  title text not null check (length(btrim(title)) between 2 and 200),
  level text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index arc_cases_author_idx on public.arc_cases (author_id);
create index arc_cases_specialty_idx on public.arc_cases (specialty_slug, status);

create table public.arc_case_steps (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.arc_cases (id) on delete cascade,
  rank integer not null,
  kind text not null check (kind in ('presentation', 'history', 'exam', 'investigation', 'differential', 'diagnosis')),
  payload jsonb not null default '{}'::jsonb,
  answer_key jsonb,
  explanation text,
  unique (case_id, rank)
);
comment on table public.arc_case_steps is 'Étapes d''un ARC. kind: presentation | history (interrogatoire à questions saisies, synonymes, réponse par défaut "non") | exam (schéma du corps, constats par région) | investigation (examens complémentaires, résultat normal par défaut) | differential (pour/contre) | diagnosis. payload et answer_key sont réservés à l''auteur : l''élève passe uniquement par les RPC (P2).';

create table public.arc_case_media (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.arc_cases (id) on delete cascade,
  kind text not null check (kind in ('image', 'audio', 'video', 'pdf')),
  r2_key text not null,
  caption text,
  rank integer not null default 0
);
comment on table public.arc_case_media is 'Médias d''un ARC dans le bucket R2 privé (lien signé côté serveur). r2_key = clé d''objet, jamais une URL publique.';
create index arc_case_media_case_idx on public.arc_case_media (case_id);

alter table public.arc_attempts add column case_uuid uuid references public.arc_cases (id), add column case_version integer;
create index arc_attempts_case_uuid_idx on public.arc_attempts (case_uuid);

-- 7. Garde-fous sur arc_cases ---------------------------------------------------------------------------------
create or replace function public.arc_cases_guard()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(auth.role(), '') = 'authenticated' then new.author_id := auth.uid(); end if;
    new.version := 1; new.created_at := now(); new.updated_at := now();
  else
    if new.author_id is distinct from old.author_id then raise exception 'AUTHOR_LOCKED' using errcode = 'P0001'; end if;
    new.version := old.version + 1; new.updated_at := now();
  end if;
  if coalesce(auth.role(), '') = 'authenticated'
     and new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and coalesce(current_setting('app.arc_rpc', true), '') <> '1' then
    raise exception 'USE_PUBLISH_RPC' using errcode = 'P0001';
  end if;
  return new;
end $function$;
create trigger arc_cases_guard before insert or update on public.arc_cases for each row execute function public.arc_cases_guard();

-- 8. RLS ------------------------------------------------------------------------------------------------------
alter table public.specialty_map enable row level security;
alter table public.arc_cases enable row level security;
alter table public.arc_case_steps enable row level security;
alter table public.arc_case_media enable row level security;

create policy "specialty_map read" on public.specialty_map for select to authenticated using (true);

create policy "teacher reads own cases" on public.arc_cases for select to authenticated
  using (author_id = (select auth.uid()) and (select public.is_teacher()));
create policy "teacher creates own cases" on public.arc_cases for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_teacher()) and (select public.my_specialties()) @> array[specialty_slug]);
create policy "teacher edits own cases" on public.arc_cases for update to authenticated
  using (author_id = (select auth.uid()) and (select public.is_teacher()))
  with check (author_id = (select auth.uid()) and (select public.is_teacher()) and (select public.my_specialties()) @> array[specialty_slug]);
create policy "teacher deletes own drafts" on public.arc_cases for delete to authenticated
  using (author_id = (select auth.uid()) and (select public.is_teacher()) and status = 'draft');

create policy "teacher manages own steps" on public.arc_case_steps for all to authenticated
  using (exists (select 1 from public.arc_cases c where c.id = case_id and c.author_id = (select auth.uid()) and (select public.is_teacher())))
  with check (exists (select 1 from public.arc_cases c where c.id = case_id and c.author_id = (select auth.uid()) and (select public.is_teacher())));
create policy "teacher manages own media" on public.arc_case_media for all to authenticated
  using (exists (select 1 from public.arc_cases c where c.id = case_id and c.author_id = (select auth.uid()) and (select public.is_teacher())))
  with check (exists (select 1 from public.arc_cases c where c.id = case_id and c.author_id = (select auth.uid()) and (select public.is_teacher())));

create policy "teacher_specialties own read" on public.teacher_specialties for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.specialty_map, public.arc_cases, public.arc_case_steps, public.arc_case_media from anon;

-- 9. Droits d'exécution des nouvelles fonctions (jamais anon) -------------------------------------------------
revoke execute on function public.is_teacher(), public.my_specialties(), public.my_interface(), public.arc_access(), public.my_specialty_index() from public, anon;
grant execute on function public.is_teacher(), public.my_specialties(), public.my_interface(), public.arc_access(), public.my_specialty_index() to authenticated;
revoke execute on function public.arc_cases_guard() from public, anon, authenticated;
