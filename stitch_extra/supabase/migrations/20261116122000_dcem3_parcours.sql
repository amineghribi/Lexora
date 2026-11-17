-- Parcours DCEM3 : programme de révision structuré (modules par spécialité, étapes, avancement).
--
-- Le contenu n'est pas inventé : les modules sont dérivés des 44 cours du parcours dcem3
-- (`track_courses`), et la spécialité de chaque cours vient de `qbank.sp` — même règle que
-- `my_specialty_index()` : premier libellé réel, hors pseudo-spécialités « Examens blancs ».
-- Une vidéo n'apparaît que si `course_videos` en contient une pour ce cours.
--
-- Écriture : `parcours_mark()` seulement, sur ses propres lignes. Les définitions de parcours
-- (parcours / modules / items) sont en lecture seule pour les clients.

-- 1. Définitions ---------------------------------------------------------------------------
create table public.parcours (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('residanat', 'dcem1', 'dcem2', 'dcem3s1', 'dcem3')),
  faculty text check (faculty in ('monastir', 'tunis', 'sousse', 'sfax')),
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  title text not null check (length(btrim(title)) between 3 and 120),
  subtitle text,
  starts_on date,
  ends_on date,
  status text not null default 'live' check (status in ('draft', 'live', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_on is null or ends_on is null or ends_on >= starts_on)
);
create unique index parcours_scope_key on public.parcours (track, (coalesce(faculty, '*')), slug) where status <> 'archived';

create table public.parcours_modules (
  id uuid primary key default gen_random_uuid(),
  parcours_id uuid not null references public.parcours (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null check (length(btrim(title)) between 2 and 120),
  specialty text,
  specialty_slug text references public.specialty_map (slug) on delete set null,
  target_days integer check (target_days is null or target_days between 1 and 120),
  sort_order integer not null,
  unique (parcours_id, sort_order),
  unique (parcours_id, slug)
);

create table public.parcours_items (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.parcours_modules (id) on delete cascade,
  kind text not null check (kind in ('qcm', 'video', 'fiche', 'arc')),
  sn integer,
  label text not null check (length(btrim(label)) between 2 and 160),
  weight numeric(4, 2) not null default 1 check (weight > 0 and weight <= 10),
  sort_order integer not null,
  unique (module_id, sort_order)
);
create index parcours_items_sn_idx on public.parcours_items (sn);

create table public.parcours_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.parcours_items (id) on delete cascade,
  status text not null default 'todo' check (status in ('todo', 'started', 'done')),
  score numeric(5, 2) check (score is null or (score >= 0 and score <= 100)),
  minutes integer check (minutes is null or minutes >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- 2. Index d'un cours du parcours : spécialité réelle + titre réel -------------------------
--    La spécialité vient de `qbank.sp` (premier libellé réel, hors « Examens blancs ») ;
--    le titre vient de `qbank.tp` (libellé de programme), qui couvre les 44 cours, contrairement
--    aux titres de `course_videos` (31 cours). Sert à la graine et à l'affichage.
create or replace function public.parcours_course_specialty(p_track text default 'dcem3')
returns table (sn integer, sp text, title text)
language sql stable security definer set search_path to ''
as $function$
  with pairs as (
    select tc.sn, btrim(x) as sp, count(*) as n
    from public.track_courses tc
    join public.qbank b on b.sn = tc.sn and b.p and coalesce(b.f, '') <> 'x'
    cross join lateral unnest(string_to_array(coalesce(b.sp, ''), ', ')) x
    where tc.track = p_track and btrim(x) <> '' and btrim(x) not ilike 'Examens blancs%'
    group by tc.sn, btrim(x)
  ), rsp as (
    select p.sn, p.sp, row_number() over (partition by p.sn order by p.n desc, p.sp) as rn
    from pairs p
  ), titles as (
    select b.sn, btrim(b.tp) as title, count(*) as n
    from public.qbank b
    where b.sn in (select sn from public.track_courses where track = p_track)
      and b.p and coalesce(b.f, '') <> 'x'
      and btrim(coalesce(b.tp, '')) <> '' and btrim(b.tp) not ilike 'Examens blancs%'
    group by b.sn, btrim(b.tp)
  ), rt as (
    select t.sn, t.title, row_number() over (partition by t.sn order by t.n desc, t.title) as rn
    from titles t
  )
  select rsp.sn, rsp.sp, rt.title
  from rsp
  left join rt on rt.sn = rsp.sn and rt.rn = 1
  where rsp.rn = 1
$function$;

-- 3. Lecture : mon parcours, modules et avancement ------------------------------------------
create or replace function public.my_parcours()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  u uuid := public.qb_uid_basic();
  trk text := public.qb_track(u);
  fac text := public.qb_faculty(u);
  p public.parcours;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  select * into p
  from public.parcours
  where status = 'live' and track = trk and (faculty is null or faculty = fac)
  order by (faculty is not null) desc,
           (exists (select 1 from public.parcours_modules m where m.parcours_id = parcours.id)) desc,
           created_at
  limit 1;
  if p.id is null then return '{}'::jsonb; end if;

  return jsonb_build_object(
    'parcours', jsonb_build_object(
      'id', p.id, 'track', p.track, 'faculty', p.faculty, 'slug', p.slug,
      'title', p.title, 'subtitle', p.subtitle,
      'starts_on', p.starts_on, 'ends_on', p.ends_on),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'specialty', m.specialty, 'sort_order', m.sort_order,
        'target_days', m.target_days,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', i.id, 'kind', i.kind, 'label', i.label, 'sn', i.sn, 'sort_order', i.sort_order,
            'status', coalesce(pp.status, 'todo'), 'score', pp.score) order by i.sort_order)
          from public.parcours_items i
          left join public.parcours_progress pp on pp.item_id = i.id and pp.user_id = u
          where i.module_id = m.id), '[]'::jsonb)
      ) order by m.sort_order)
      from public.parcours_modules m
      where m.parcours_id = p.id), '[]'::jsonb));
end $function$;

-- 4. Écriture de l'avancement --------------------------------------------------------------
create or replace function public.parcours_mark(
  p_item uuid,
  p_status text,
  p_score numeric default null,
  p_minutes integer default null)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  u uuid := public.qb_uid_basic();
  trk text := public.qb_track(u);
  ok_item boolean;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_status not in ('todo', 'started', 'done') then raise exception 'BAD_STATUS' using errcode = 'P0001'; end if;
  if p_score is not null and (p_score < 0 or p_score > 100) then raise exception 'BAD_SCORE' using errcode = 'P0001'; end if;

  select exists (
    select 1 from public.parcours_items i
    join public.parcours_modules m on m.id = i.module_id
    join public.parcours p on p.id = m.parcours_id
    where i.id = p_item and p.status = 'live' and p.track = trk
      and (p.faculty is null or p.faculty = public.qb_faculty(u))
  ) into ok_item;
  if not ok_item then raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.parcours_progress as pp (user_id, item_id, status, score, minutes, completed_at, updated_at)
  values (u, p_item, p_status, p_score, p_minutes,
          case when p_status = 'done' then now() else null end, now())
  on conflict (user_id, item_id) do update set
    status = excluded.status,
    score = coalesce(excluded.score, pp.score),
    minutes = coalesce(excluded.minutes, pp.minutes),
    completed_at = excluded.completed_at,
    updated_at = now();

  return jsonb_build_object('item', p_item, 'status', p_status);
end $function$;

-- 5. RLS et droits --------------------------------------------------------------------------
alter table public.parcours enable row level security;
alter table public.parcours_modules enable row level security;
alter table public.parcours_items enable row level security;
alter table public.parcours_progress enable row level security;

create policy parcours_select_mine on public.parcours
  for select to authenticated
  using (status = 'live' and (track = public.qb_track(auth.uid()) or public.is_teacher(auth.uid())));

create policy parcours_modules_select_mine on public.parcours_modules
  for select to authenticated
  using (exists (
    select 1 from public.parcours p
    where p.id = parcours_id and p.status = 'live'
      and (p.track = public.qb_track(auth.uid()) or public.is_teacher(auth.uid()))));

create policy parcours_items_select_mine on public.parcours_items
  for select to authenticated
  using (exists (
    select 1 from public.parcours_modules m
    join public.parcours p on p.id = m.parcours_id
    where m.id = module_id and p.status = 'live'
      and (p.track = public.qb_track(auth.uid()) or public.is_teacher(auth.uid()))));

create policy parcours_progress_select_own on public.parcours_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy parcours_progress_insert_own on public.parcours_progress
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy parcours_progress_update_own on public.parcours_progress
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy parcours_progress_delete_own on public.parcours_progress
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.parcours, public.parcours_modules, public.parcours_items, public.parcours_progress from anon, authenticated;
grant select on public.parcours, public.parcours_modules, public.parcours_items to authenticated;
grant select, insert, update, delete on public.parcours_progress to authenticated;

revoke execute on function public.parcours_course_specialty(text) from public, anon, authenticated;
revoke execute on function public.my_parcours() from public, anon;
grant execute on function public.my_parcours() to authenticated;
revoke execute on function public.parcours_mark(uuid, text, numeric, integer) from public, anon;
grant execute on function public.parcours_mark(uuid, text, numeric, integer) to authenticated;

comment on table public.parcours is 'Parcours de révision (programme) : un par parcours/faculté, statut live|draft|archived.';
comment on table public.parcours_progress is 'Avancement d''un élève sur les étapes d''un parcours (écriture via parcours_mark).';

-- 6. Graine : parcours DCEM3 S2 dérivé du programme réel ------------------------------------
--    Une fonction de synchronisation plutôt qu'une graine figée : elle est rejouable, et elle
--    répare un parcours créé avant l'import des cours (modules ou étapes manquants).
create or replace function public.parcours_dcem3_sync()
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  pid uuid;
  n_mod integer := 0;
  n_qcm integer := 0;
  n_vid integer := 0;
begin
  insert into public.parcours (track, slug, title, subtitle, status)
  select 'dcem3', 'dcem3-s2', 'Parcours DCEM3 — S2',
         'Les cours du semestre regroupés par spécialité : QCM, puis la vidéo quand elle existe.',
         'live'
  where not exists (select 1 from public.parcours where track = 'dcem3' and slug = 'dcem3-s2');
  select id into pid from public.parcours where track = 'dcem3' and slug = 'dcem3-s2' order by created_at limit 1;
  if pid is null then return jsonb_build_object('error', 'NO_PARCOURS'); end if;

  -- modules : une par spécialité réelle des cours du parcours
  with sp as (
    select distinct s.sp from public.parcours_course_specialty('dcem3') s
  ), ready as (
    select sp.sp,
           regexp_replace(translate(lower(sp.sp), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'), '[^a-z0-9]+', '-', 'g') as slug,
           (select sm.slug from public.specialty_map sm where sm.label = sp.sp limit 1) as sp_slug
    from sp
  )
  insert into public.parcours_modules (parcours_id, slug, title, specialty, specialty_slug, sort_order)
  select pid, r.slug, r.sp, r.sp, r.sp_slug, row_number() over (order by r.sp)
  from ready r
  on conflict (parcours_id, slug) do nothing;
  get diagnostics n_mod = row_count;

  -- étapes QCM : une par cours, nommée par le titre réel du programme
  with cs as (
    select s.sn, s.sp, s.title from public.parcours_course_specialty('dcem3') s
  ), mods as (
    select m.id, m.title from public.parcours_modules m where m.parcours_id = pid
  )
  insert into public.parcours_items (module_id, kind, sn, label, sort_order)
  select m.id, 'qcm', c.sn,
         coalesce(nullif(btrim(c.title), ''), 'Cours ' || c.sn),
         row_number() over (partition by m.id order by coalesce(c.title, 'Cours ' || c.sn), c.sn)
  from cs c
  join mods m on m.title = c.sp
  where not exists (select 1 from public.parcours_items i where i.module_id = m.id and i.kind = 'qcm');
  get diagnostics n_qcm = row_count;

  -- étapes vidéo : seulement pour les cours qui ont des épisodes servis par /api/video
  with cs as (
    select s.sn, s.sp, s.title from public.parcours_course_specialty('dcem3') s
  ), mods as (
    select m.id, m.title from public.parcours_modules m where m.parcours_id = pid
  ), vids as (
    select distinct v.course,
           count(*) over (partition by v.course) as eps,
           (select v2.course_title from public.course_videos v2 where v2.course = v.course order by v2.episode limit 1) as title
    from public.course_videos v
    where v.url is not null and btrim(v.url) <> ''
  )
  insert into public.parcours_items (module_id, kind, sn, label, sort_order)
  select m.id, 'video', c.sn,
         'Vidéo — ' || coalesce(nullif(btrim(c.title), ''), v.title, 'cours ' || c.sn) || ' (' || v.eps || ' ép.)',
         100 + row_number() over (partition by m.id order by coalesce(c.title, 'Cours ' || c.sn), c.sn)
  from cs c
  join mods m on m.title = c.sp
  join vids v on v.course = c.sn
  where not exists (select 1 from public.parcours_items i where i.module_id = m.id and i.kind = 'video');
  get diagnostics n_vid = row_count;

  return jsonb_build_object('parcours', pid, 'modules', n_mod, 'qcm', n_qcm, 'video', n_vid,
                            'total_modules', (select count(*) from public.parcours_modules where parcours_id = pid),
                            'total_items', (select count(*) from public.parcours_items i join public.parcours_modules m on m.id = i.module_id where m.parcours_id = pid));
end $function$;

revoke execute on function public.parcours_dcem3_sync() from public, anon, authenticated;
grant execute on function public.parcours_dcem3_sync() to service_role;

-- La graine est jouée ici ; rejouable plus tard par l'équipe si les cours changent.
select public.parcours_dcem3_sync();
