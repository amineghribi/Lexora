-- A1 (types de compte) : fondation INVISIBLE pour de nouveaux parcours (dcem1, dcem2) à côté de residanat et dcem3.
-- Règle d'or : aucun compte existant ne change de comportement. Les parcours dcem1/dcem2 restent inaccessibles tant qu'aucun cours
-- ne leur est attribué dans track_courses (choose_track les refuse : TRACK_UNAVAILABLE). Ouvrir un parcours = y insérer ses cours (action du propriétaire).
-- Équivalence prouvée par supabase/tests/a1_tracks_equivalence.sql (anciennes et nouvelles fonctions comparées sur tous les comptes, puis annulation).

-- 1. Cours par parcours. exclusive = cours réservé à ce parcours (le résidanat ne le voit pas). Les 44 cours DCEM3 actuels : exclusive=false (le résidanat les voit toujours).
create table if not exists public.track_courses (
  track text not null check (track in ('dcem1', 'dcem2', 'dcem3')),
  sn integer not null,
  exclusive boolean not null default false,
  primary key (track, sn)
);
alter table public.track_courses enable row level security;
revoke all on public.track_courses from anon, authenticated;

do $m$ begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'dcem3_courses' and c.relkind = 'r') then
    insert into public.track_courses (track, sn) select 'dcem3', sn from public.dcem3_courses on conflict do nothing;
    drop table public.dcem3_courses;
  end if;
end $m$;
-- Vue de compatibilité (plus lue par l'app) : peut être supprimée plus tard.
create or replace view public.dcem3_courses with (security_invoker = true) as
  select sn from public.track_courses where track = 'dcem3';
revoke all on public.dcem3_courses from anon, authenticated;

-- 2. Contraintes élargies
alter table public.profiles drop constraint if exists profiles_track_chk;
alter table public.profiles add constraint profiles_track_chk check (track in ('residanat', 'dcem1', 'dcem2', 'dcem3'));
alter table public.profiles drop constraint if exists profiles_track_faculty_chk;
alter table public.profiles add constraint profiles_track_faculty_chk check (track not in ('dcem1', 'dcem2') or faculty is not null);
alter table public.access_grants drop constraint if exists access_grants_scope_chk;
alter table public.access_grants add constraint access_grants_scope_chk check (scope in ('residanat', 'dcem1', 'dcem2', 'dcem3'));

-- 3. Filtre de contenu d'un parcours, calculé une fois par appel (jamais par ligne).
--    restricted=true  : parcours à liste fermée (dcem*) -> sns = cours autorisés.
--    restricted=false : residanat -> sns = cours exclusifs d'un autre parcours (à masquer ; vide aujourd'hui = aucun filtre).
create or replace function public.track_filter(trk text, out restricted boolean, out sns integer[])
returns record language plpgsql stable security definer set search_path = '' as $f$
begin
  restricted := trk <> 'residanat';
  if restricted then
    select coalesce(array_agg(c.sn order by c.sn), '{}') into sns from public.track_courses c where c.track = trk;
  else
    select coalesce(array_agg(c.sn order by c.sn), '{}') into sns from public.track_courses c where c.exclusive;
  end if;
end $f$;
revoke all on function public.track_filter(text) from public, anon, authenticated;

-- 4. Choix du parcours. Inchangé pour residanat/dcem3. Nouveaux : dcem1/dcem2 exigent une faculté et un parcours ouvert (cours attribués).
--    Verrou : un élève déjà sur un parcours dcem* ne passe pas à un autre par cette fonction (le passage dcem3 -> residanat se fait par grant_access, comme avant).
create or replace function public.choose_track(p_track text, p_faculty text default null) returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare u uuid := public.qb_uid_basic(); cur text; chosen timestamptz; fac text;
begin
  if p_track not in ('residanat', 'dcem1', 'dcem2', 'dcem3') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if p_faculty is not null and p_faculty not in ('monastir', 'tunis', 'sousse', 'sfax') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  select track, track_set_at, faculty into cur, chosen, fac from public.profiles where id = u;
  if p_track in ('dcem1', 'dcem2') then
    if not exists (select 1 from public.track_courses where track = p_track) then raise exception 'TRACK_UNAVAILABLE' using errcode = 'P0001'; end if;
    if coalesce(p_faculty, fac) is null then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  end if;
  if chosen is not null and cur in ('dcem1', 'dcem2', 'dcem3') and p_track <> cur then raise exception 'TRACK_LOCKED' using errcode = 'P0001'; end if;
  perform set_config('app.track_rpc', '1', true);
  update public.profiles set track = p_track, faculty = coalesce(p_faculty, faculty), track_set_at = coalesce(track_set_at, now()) where id = u;
  return public.my_scope();
end $f$;

create or replace function public.my_scope() returns jsonb
language plpgsql stable security definer set search_path = '' as $f$
declare u uuid := public.qb_uid_basic(); t text; f text; chosen timestamptz;
begin
  select track, faculty, track_set_at into t, f, chosen from public.profiles where id = u;
  t := coalesce(t, 'residanat');
  return jsonb_build_object('track', t, 'faculty', f, 'chosen', chosen is not null,
    'courses', case when t <> 'residanat' then (select coalesce(jsonb_agg(c.sn order by c.sn), '[]'::jsonb) from public.track_courses c where c.track = t) else null end);
end $f$;

-- 5. Droits : un abonnement vaut s'il est « residanat » ou du même parcours que l'élève (équivaut à l'ancienne règle tant qu'il n'y a que residanat et dcem3).
create or replace function public.my_access() returns jsonb
language plpgsql stable security definer set search_path = '' as $f$
declare u uuid := auth.uid(); tr timestamptz; pu timestamptz; paid boolean; trk text;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  trk := public.qb_track(u);
  select greatest(created_at + interval '7 days', public.promo_end()) into tr from auth.users where id = u;
  select max(ends_at) into pu from public.access_grants where user_id = u and ends_at > now() and (scope = 'residanat' or scope = trk);
  select exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now() and (g.scope = 'residanat' or g.scope = trk)) into paid;
  return jsonb_build_object('status', case when paid then 'paid' when tr > now() then 'trial' else 'expired' end,
    'trial_ends_at', tr, 'paid_until', pu, 'now', now(), 'track', trk);
end $f$;

create or replace function public.qb_has_access(u uuid) returns boolean
language sql stable security definer set search_path = '' as $f$
  select now() < public.promo_end()
      or exists (select 1 from auth.users x where x.id = u and x.created_at + interval '7 days' > now())
      or exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now()
                 and (g.scope = 'residanat' or g.scope = public.qb_track(u)))
$f$;

-- 6. Filtrage du contenu (même corps qu'avant, seule la condition « dcem3 » devient « filtre du parcours »)
create or replace function public.qb_serve(u uuid, ids text[]) returns void
language plpgsql security definer set search_path = '' as $f$
declare d date := public.qb_today(); cur int; cur2 int; newn int; calls int; trk text; fr boolean; fs integer[];
begin
  perform public.qb_guard();
  if exists (select 1 from auth.users x where x.id = u and x.banned_until is not null and x.banned_until > now()) then
    raise exception 'ACCOUNT_BLOCKED' using errcode = 'P0001';
  end if;
  trk := public.qb_track(u);
  select * into fr, fs from public.track_filter(trk);
  if exists (select 1 from public.qbank b where b.id = any(ids)
             and not (case when fr then b.sn = any(fs) else (b.sn is null or b.sn <> all(fs)) end)) then
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
end $f$;

create or replace function public.question_meta() returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare u uuid := public.qb_uid(); fr boolean; fs integer[];
begin
  select * into fr, fs from public.track_filter(public.qb_track(u));
  return coalesce((select jsonb_agg(jsonb_build_array(q.id, q.sn, case when q.p then 1 else 0 end, q.f, q.fr_n, q.fr_l, case when q.hc then 1 else 0 end) order by q.id)
    from public.qbank q where case when fr then q.sn = any(fs) else (q.sn is null or q.sn <> all(fs)) end), '[]'::jsonb);
end $f$;

create or replace function public.search_questions(p_words text[], p_sns integer[] default null, p_limit integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare u uuid := public.qb_uid(); ids text[]; pats text[]; fr boolean; fs integer[];
begin
  select * into fr, fs from public.track_filter(public.qb_track(public.qb_uid_basic()));
  if p_words is null or cardinality(p_words) = 0 or cardinality(p_words) > 6 then return '[]'::jsonb; end if;
  select array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%') into pats from unnest(p_words) as w where length(w) >= 2;
  if pats is null then return '[]'::jsonb; end if;
  select array_agg(id) into ids from (
    select b.id from public.qbank b
    where b.p and coalesce(b.f, '') <> 'x'
      and (p_sns is null or b.sn = any(p_sns))
      and (case when fr then b.sn = any(fs) else (b.sn is null or b.sn <> all(fs)) end)
      and b.search_text like all (pats)
    order by b.id limit least(greatest(coalesce(p_limit, 30), 1), 30)
  ) s;
  if ids is null then return '[]'::jsonb; end if;
  perform public.qb_serve(u, ids);
  return coalesce((select jsonb_agg(b.pub || b.sec order by array_position(ids, b.id)) from public.qbank b where b.id = any(ids)), '[]'::jsonb);
end $f$;

create or replace function public.similar_questions(p_wrong text[], p_exclude text[] default '{}'::text[], p_max integer default 20) returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare u uuid := public.qb_uid(); fr boolean; fs integer[];
begin
  select * into fr, fs from public.track_filter(public.qb_track(public.qb_uid_basic()));
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
          and (case when fr then e.sn = any(fs) else (e.sn is null or e.sn <> all(fs)) end)
      ) pr where pr.s >= 3 group by pr.id order by sum(pr.s) desc, pr.id limit least(greatest(coalesce(p_max, 20), 0), 60)
    ) t), '[]'::jsonb);
end $f$;

create or replace function public.get_course_videos() returns jsonb
language plpgsql stable security definer set search_path = '' as $f$
declare u uuid; fr boolean; fs integer[]; st text;
begin
  perform public.qb_guard();
  u := public.qb_uid_basic();
  select * into fr, fs from public.track_filter(public.qb_track(u));
  st := coalesce((public.my_access())->>'status', '');
  if st not in ('paid', 'trial') then raise exception 'PAID_ONLY' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('course', v.course, 'course_title', v.course_title, 'episode', v.episode, 'title', v.title,
      'duration_s', v.duration_s, 'url', v.url,
      'qids', coalesce((select jsonb_agg(q.qid order by q.rank) from public.course_video_qcm q where q.course = v.course and q.episode = v.episode), '[]'::jsonb))
      order by v.course, v.episode nulls last)
    from public.course_videos v
    where (case when fr then v.course = any(fs) else (v.course is null or v.course <> all(fs)) end)
      and (st = 'paid' or v.episode = 1)), '[]'::jsonb);
end $f$;

-- 7. grant_access : mêmes règles ; périmètres dcem1/dcem2 acceptés mais seulement en plan « custom » tant que les prix ne sont pas décidés.
create or replace function public.grant_access(p_email text, p_plan text, p_amount numeric default null, p_note text default null, p_days integer default null, p_scope text default null) returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare u uuid; cur_end timestamptz; s timestamptz; e timestamptz; amt numeric; ls timestamp; tz constant text := 'Africa/Tunis'; sc text;
        credit numeric := 0; moved boolean := false;
begin
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Aucun compte avec cet e-mail : %', p_email; end if;
  sc := coalesce(p_scope, case when p_plan = 'dcem3' then 'dcem3' else public.qb_track(u) end);
  if sc not in ('residanat', 'dcem1', 'dcem2', 'dcem3') then raise exception 'Périmètre inconnu : % (residanat, dcem1, dcem2 ou dcem3)', sc; end if;
  if p_plan = 'dcem3' and sc <> 'dcem3' then raise exception 'Le plan dcem3 ne s''applique qu''au périmètre dcem3.'; end if;
  if sc = 'dcem3' and p_plan in ('month', 'semester') then raise exception 'Pour un élève DCEM3, utilise le plan dcem3 (50 DT jusqu''à fin juin) ou custom.'; end if;
  if sc in ('dcem1', 'dcem2') and p_plan <> 'custom' then raise exception 'Périmètre % : seul le plan custom est disponible (prix non décidés).', sc; end if;
  select max(ends_at) into cur_end from public.access_grants where user_id = u and ends_at > now() and scope = sc;
  s := greatest(now(), coalesce(cur_end, now()));
  if p_plan = 'month' then e := s + interval '30 days'; amt := 29;
  elsif p_plan = 'semester' then
    ls := s at time zone tz;
    if extract(month from ls) <= 6 then e := make_timestamp(extract(year from ls)::int, 7, 1, 0, 0, 0) at time zone tz;
    else e := make_timestamp(extract(year from ls)::int + 1, 1, 1, 0, 0, 0) at time zone tz; end if;
    amt := 140;
    if sc = 'residanat' and p_amount is null then
      select coalesce(sum(least(amount_dt, 50)), 0) into credit from public.access_grants where user_id = u and scope = 'dcem3' and plan = 'dcem3' and not credited and coalesce(amount_dt, 0) > 0;
      amt := amt - credit;
    end if;
  elsif p_plan = 'dcem3' then
    ls := s at time zone tz;
    if extract(month from ls) <= 6 then e := make_timestamp(extract(year from ls)::int, 7, 1, 0, 0, 0) at time zone tz;
    else e := make_timestamp(extract(year from ls)::int + 1, 7, 1, 0, 0, 0) at time zone tz; end if;
    amt := 50;
  elsif p_plan = 'custom' then
    if p_days is null or p_days <= 0 then raise exception 'Plan custom : indique un nombre de jours (5e paramètre).'; end if;
    e := s + p_days * interval '1 day'; amt := null;
  else raise exception 'Plan inconnu : % (month, semester, dcem3 ou custom)', p_plan; end if;
  amt := coalesce(p_amount, amt);
  insert into public.access_grants (user_id, plan, starts_at, ends_at, amount_dt, note, scope) values (u, p_plan, s, e, amt, p_note, sc);
  if credit > 0 then
    update public.access_grants set credited = true where user_id = u and scope = 'dcem3' and plan = 'dcem3' and not credited and coalesce(amount_dt, 0) > 0;
  end if;
  if sc = 'residanat' and public.qb_track(u) = 'dcem3' then
    perform set_config('app.track_rpc', '1', true);
    update public.profiles set track = 'residanat' where id = u;
    moved := true;
  end if;
  return jsonb_build_object('email', lower(trim(p_email)), 'plan', p_plan, 'perimetre', sc, 'montant_dt', amt, 'deduction_dt', credit, 'passe_en_residanat', moved,
    'debut', to_char(s at time zone tz, 'DD/MM/YYYY HH24:MI'), 'fin', to_char((e - interval '1 second') at time zone tz, 'DD/MM/YYYY HH24:MI'));
end $f$;
