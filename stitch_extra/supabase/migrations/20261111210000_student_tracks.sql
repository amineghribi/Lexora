-- Deux types d'élèves : « residanat » (accès complet) et « dcem3 » (accès limité aux cours du programme DCEM3).
-- Règle de sécurité : tout est décidé côté serveur. Les comptes existants restent « residanat » : aucun changement pour eux.
-- Un abonnement a un périmètre (access_grants.scope). Un abonnement « residanat » ouvre tout ; un abonnement « dcem3 » n'ouvre que le périmètre DCEM3.

-- 1. Type d'élève et faculté (la faculté sert à la page DCEM3 et aux statistiques)
alter table public.profiles add column if not exists track text not null default 'residanat';
alter table public.profiles add column if not exists faculty text;
alter table public.profiles add column if not exists track_set_at timestamptz;
alter table public.profiles drop constraint if exists profiles_track_chk;
alter table public.profiles add constraint profiles_track_chk check (track in ('residanat', 'dcem3'));
alter table public.profiles drop constraint if exists profiles_faculty_chk;
alter table public.profiles add constraint profiles_faculty_chk check (faculty is null or faculty in ('monastir', 'tunis', 'sousse', 'sfax'));

-- 2. Périmètre DCEM3 : numéros de cours (qbank.sn) du programme DCEM3
create table if not exists public.dcem3_courses (sn integer primary key);
alter table public.dcem3_courses enable row level security;
drop policy if exists "dcem3 courses readable" on public.dcem3_courses;
create policy "dcem3 courses readable" on public.dcem3_courses for select to authenticated using (true);
insert into public.dcem3_courses (sn) values
  (1),(2),(3),(4),(5),(7),(9),(10),(16),(17),(20),(22),(24),(26),(27),(28),(30),(33),(34),(35),(37),(38),(41),(43),(46),(48),(51),(52),(53),(54),(55),(56),(57),(58),(59),(60),(61),(62),(64),(67),(68),(71),(72),(75)
  on conflict do nothing;

-- 3. Périmètre d'un abonnement
alter table public.access_grants add column if not exists scope text not null default 'residanat';
alter table public.access_grants drop constraint if exists access_grants_scope_chk;
alter table public.access_grants add constraint access_grants_scope_chk check (scope in ('residanat', 'dcem3'));

-- 4. Empêcher un élève de changer son type directement (la politique « update own profile » le permettrait)
create or replace function public.profiles_guard_track() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.track is distinct from old.track or new.faculty is distinct from old.faculty or new.track_set_at is distinct from old.track_set_at)
     and auth.role() = 'authenticated' and coalesce(current_setting('app.track_rpc', true), '') <> '1' then
    raise exception 'TRACK_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_track on public.profiles;
create trigger profiles_guard_track before update on public.profiles for each row execute function public.profiles_guard_track();

create or replace function public.qb_track(u uuid) returns text
language sql stable security definer set search_path = '' as $$ select coalesce((select track from public.profiles where id = u), 'residanat') $$;

-- 5. Choix du type : libre au premier choix ; ensuite on peut seulement passer de residanat à dcem3 (jamais l'inverse sans l'administrateur)
create or replace function public.choose_track(p_track text, p_faculty text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid_basic(); cur text; chosen timestamptz;
begin
  if p_track not in ('residanat', 'dcem3') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if p_faculty is not null and p_faculty not in ('monastir', 'tunis', 'sousse', 'sfax') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  select track, track_set_at into cur, chosen from public.profiles where id = u;
  if chosen is not null and cur = 'dcem3' and p_track = 'residanat' then raise exception 'TRACK_LOCKED' using errcode = 'P0001'; end if;
  perform set_config('app.track_rpc', '1', true);
  update public.profiles set track = p_track, faculty = coalesce(p_faculty, faculty), track_set_at = coalesce(track_set_at, now()) where id = u;
  return public.my_scope();
end $$;

-- Périmètre de l'élève connecté : courses = null signifie « tout »
create or replace function public.my_scope() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public.qb_uid_basic(); t text; f text; chosen timestamptz;
begin
  select track, faculty, track_set_at into t, f, chosen from public.profiles where id = u;
  return jsonb_build_object('track', coalesce(t, 'residanat'), 'faculty', f, 'chosen', chosen is not null,
    'courses', case when coalesce(t, 'residanat') = 'dcem3' then (select coalesce(jsonb_agg(sn order by sn), '[]'::jsonb) from public.dcem3_courses) else null end);
end $$;

-- 6. Accès : un abonnement compte s'il est « residanat », ou « dcem3 » pour un élève dcem3
create or replace function public.my_access() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); tr timestamptz; pu timestamptz; paid boolean; trk text;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  trk := public.qb_track(u);
  select greatest(created_at + interval '7 days', public.promo_end()) into tr from auth.users where id = u;
  select max(ends_at) into pu from public.access_grants where user_id = u and ends_at > now() and (scope = 'residanat' or trk = 'dcem3');
  select exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now() and (g.scope = 'residanat' or trk = 'dcem3')) into paid;
  return jsonb_build_object('status', case when paid then 'paid' when tr > now() then 'trial' else 'expired' end,
    'trial_ends_at', tr, 'paid_until', pu, 'now', now(), 'track', trk);
end $$;

create or replace function public.qb_has_access(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select now() < public.promo_end()
      or exists (select 1 from auth.users x where x.id = u and x.created_at + interval '7 days' > now())
      or exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now()
                 and (g.scope = 'residanat' or public.qb_track(u) = 'dcem3'))
$$;

-- 7. Cloisonnement des questions : le point central est qb_serve (appelé par get_questions et search_questions)
create or replace function public.qb_serve(u uuid, ids text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare d date := public.qb_today(); cur int; cur2 int; newn int;
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

create or replace function public.search_questions(p_words text[], p_sns integer[] default null, p_limit integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid(); ids text[]; pats text[]; dc boolean := public.qb_track(public.qb_uid_basic()) = 'dcem3';
begin
  if p_words is null or cardinality(p_words) = 0 or cardinality(p_words) > 6 then return '[]'::jsonb; end if;
  select array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%') into pats from unnest(p_words) as w where length(w) >= 2;
  if pats is null then return '[]'::jsonb; end if;
  select array_agg(id) into ids from (
    select b.id from public.qbank b
    where b.p and coalesce(b.f, '') <> 'x'
      and (p_sns is null or b.sn = any(p_sns))
      and (not dc or b.sn in (select sn from public.dcem3_courses))
      and b.search_text like all (pats)
    order by b.id limit least(greatest(coalesce(p_limit, 30), 1), 30)
  ) s;
  if ids is null then return '[]'::jsonb; end if;
  perform public.qb_serve(u, ids);
  return coalesce((select jsonb_agg(b.pub || b.sec order by array_position(ids, b.id)) from public.qbank b where b.id = any(ids)), '[]'::jsonb);
end $$;

create or replace function public.similar_questions(p_wrong text[], p_exclude text[] default '{}'::text[], p_max integer default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid(); dc boolean := public.qb_track(public.qb_uid_basic()) = 'dcem3';
begin
  if p_wrong is null or cardinality(p_wrong) = 0 then return '[]'::jsonb; end if;
  if cardinality(p_wrong) > 150 then p_wrong := p_wrong[1:150]; end if;
  return coalesce((
    select jsonb_agg(id order by sc desc, id) from (
      select pr.id, sum(pr.s) as sc from (
        select e.id,
          (case when coalesce(w.ob, '') <> '' and e.ob = w.ob then 3 else 0 end)
          + (case when coalesce(w.tg, '') <> '' and e.tg = w.tg and e.tp = w.tp then 2 when coalesce(w.tg, '') <> '' and e.tg = w.tg then 1 else 0 end)
          + (case when w.cp0 is not null and e.cp0 = w.cp0 and e.cp1 is not null and w.cp1 is not null and abs(e.cp1 - w.cp1) <= 1 then 2 else 0 end) as s
        from public.qbank w
        join public.qbank e on e.sn = w.sn and e.p and coalesce(e.f, '') <> 'x'
        where w.id = any(p_wrong) and not (e.id = any(coalesce(p_exclude, '{}')))
          and (not dc or e.sn in (select sn from public.dcem3_courses))
      ) pr where pr.s >= 3 group by pr.id order by sum(pr.s) desc, pr.id limit least(greatest(coalesce(p_max, 20), 0), 60)
    ) t), '[]'::jsonb);
end $$;

create or replace function public.question_meta() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid(); dc boolean := public.qb_track(u) = 'dcem3';
begin
  return coalesce((select jsonb_agg(jsonb_build_array(id, sn, case when p then 1 else 0 end, f, fr_n, fr_l, case when hc then 1 else 0 end) order by id)
    from public.qbank where not dc or sn in (select c.sn from public.dcem3_courses c)), '[]'::jsonb);
end $$;

-- 8. Vidéos de balayage : abonnés du périmètre ; un élève DCEM3 ne voit que les cours de son périmètre
create or replace function public.get_course_videos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid; dc boolean;
begin
  perform public.qb_guard();
  u := public.qb_uid_basic();
  dc := public.qb_track(u) = 'dcem3';
  if coalesce((public.my_access())->>'status', '') <> 'paid' then raise exception 'PAID_ONLY' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('course', v.course, 'course_title', v.course_title, 'episode', v.episode, 'title', v.title,
      'duration_s', v.duration_s, 'url', v.url,
      'qids', coalesce((select jsonb_agg(q.qid order by q.rank) from public.course_video_qcm q where q.course = v.course and q.episode = v.episode), '[]'::jsonb))
      order by v.course, v.episode nulls last)
    from public.course_videos v where not dc or v.course in (select sn from public.dcem3_courses)), '[]'::jsonb);
end $$;

-- 9. Octroi d'un abonnement avec périmètre (par défaut : le type de l'élève)
drop function if exists public.grant_access(text, text, numeric, text, integer);
create or replace function public.grant_access(p_email text, p_plan text, p_amount numeric default null, p_note text default null, p_days integer default null, p_scope text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; cur_end timestamptz; s timestamptz; e timestamptz; amt numeric; ls timestamp; tz constant text := 'Africa/Tunis'; sc text;
begin
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Aucun compte avec cet e-mail : %', p_email; end if;
  sc := coalesce(p_scope, public.qb_track(u));
  if sc not in ('residanat', 'dcem3') then raise exception 'Périmètre inconnu : % (residanat ou dcem3)', sc; end if;
  select max(ends_at) into cur_end from public.access_grants where user_id = u and ends_at > now() and scope = sc;
  s := greatest(now(), coalesce(cur_end, now()));
  if p_plan = 'month' then e := s + interval '30 days'; amt := 29;
  elsif p_plan = 'semester' then
    ls := s at time zone tz;
    if extract(month from ls) <= 6 then e := make_timestamp(extract(year from ls)::int, 7, 1, 0, 0, 0) at time zone tz;
    else e := make_timestamp(extract(year from ls)::int + 1, 1, 1, 0, 0, 0) at time zone tz; end if;
    amt := 140;
  elsif p_plan = 'custom' then
    if p_days is null or p_days <= 0 then raise exception 'Plan custom : indique un nombre de jours (5e paramètre).'; end if;
    e := s + p_days * interval '1 day'; amt := null;
  else raise exception 'Plan inconnu : % (month, semester ou custom)', p_plan; end if;
  amt := coalesce(p_amount, amt);
  insert into public.access_grants (user_id, plan, starts_at, ends_at, amount_dt, note, scope) values (u, p_plan, s, e, amt, p_note, sc);
  return jsonb_build_object('email', lower(trim(p_email)), 'plan', p_plan, 'perimetre', sc, 'montant_dt', amt,
    'debut', to_char(s at time zone tz, 'DD/MM/YYYY HH24:MI'), 'fin', to_char((e - interval '1 second') at time zone tz, 'DD/MM/YYYY HH24:MI'));
end $$;

-- 10. Droits d'exécution
revoke all on function public.choose_track(text, text) from public, anon;
revoke all on function public.my_scope() from public, anon;
revoke all on function public.qb_track(uuid) from public, anon, authenticated;
revoke all on function public.grant_access(text, text, numeric, text, integer, text) from public, anon, authenticated;
grant execute on function public.choose_track(text, text) to authenticated;
grant execute on function public.my_scope() to authenticated;
