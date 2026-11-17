-- Nouveau parcours « dcem3s1 » : DCEM3 semestre 1, liste fermée propre à chaque faculté (Sousse 54, Tunis 24, Monastir 18, Sfax 11).
-- Sources : docs/programmes-facultes/DCEM3-FACULTES.md ; « go dcem3s1 » le 2026-11-15. Le parcours « dcem3 » (44 cours, sans faculté) est inchangé : c'est le DCEM3 S2 / révision.
-- Pourquoi un nouveau parcours : le filtre additionne les lignes sans faculté et celles de la faculté ; des lignes dcem3 par faculté s'ajouteraient aux 44.
-- Règles : faculté obligatoire ; indisponible si la faculté n'a pas de ligne ; plan custom seulement (prix non décidés), comme dcem1 et dcem2.
-- Changement de parcours : un élève peut désormais AVANCER (dcem1 -> dcem2 -> dcem3s1 -> dcem3). Reculer, ou revenir au Résidanat depuis un parcours DCEM, reste TRACK_LOCKED. Un abonnement reste lié à son périmètre : il ne suit pas l'élève.
alter table public.profiles drop constraint if exists profiles_track_chk;
alter table public.profiles add constraint profiles_track_chk check (track in ('residanat', 'dcem1', 'dcem2', 'dcem3s1', 'dcem3'));
alter table public.profiles drop constraint if exists profiles_track_faculty_chk;
alter table public.profiles add constraint profiles_track_faculty_chk check (track not in ('dcem1', 'dcem2', 'dcem3s1') or faculty is not null);
alter table public.access_grants drop constraint if exists access_grants_scope_chk;
alter table public.access_grants add constraint access_grants_scope_chk check (scope in ('residanat', 'dcem1', 'dcem2', 'dcem3s1', 'dcem3'));
alter table public.track_courses drop constraint if exists track_courses_track_check;
alter table public.track_courses add constraint track_courses_track_check check (track in ('dcem1', 'dcem2', 'dcem3s1', 'dcem3'));

create or replace function public.choose_track(p_track text, p_faculty text default null)
returns jsonb language plpgsql security definer set search_path = '' as $f$
declare u uuid := public.qb_uid_basic(); cur text; chosen timestamptz; fac text;
        ord constant text[] := array['dcem1', 'dcem2', 'dcem3s1', 'dcem3'];
begin
  if p_track not in ('residanat', 'dcem1', 'dcem2', 'dcem3s1', 'dcem3') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if p_faculty is not null and p_faculty not in ('monastir', 'tunis', 'sousse', 'sfax') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  select track, track_set_at, faculty into cur, chosen, fac from public.profiles where id = u;
  if p_track in ('dcem1', 'dcem2', 'dcem3s1') then
    if not exists (select 1 from public.track_courses where track = p_track and (coalesce(p_faculty, fac) is null or faculty is null or faculty = coalesce(p_faculty, fac))) then raise exception 'TRACK_UNAVAILABLE' using errcode = 'P0001'; end if;
    if coalesce(p_faculty, fac) is null then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  end if;
  -- Un élève déjà dans un parcours DCEM peut seulement avancer dans l'ordre dcem1 < dcem2 < dcem3s1 < dcem3.
  if chosen is not null and cur = any (ord) and p_track <> cur
     and coalesce(array_position(ord, p_track), 0) <= array_position(ord, cur) then
    raise exception 'TRACK_LOCKED' using errcode = 'P0001';
  end if;
  perform set_config('app.track_rpc', '1', true);
  update public.profiles set track = p_track, faculty = coalesce(p_faculty, faculty), track_set_at = coalesce(track_set_at, now()) where id = u;
  return public.my_scope();
end $f$;

create or replace function public.grant_access(p_email text, p_plan text, p_amount numeric default null, p_note text default null, p_days integer default null, p_scope text default null)
returns jsonb language plpgsql security definer set search_path = '' as $f$
declare u uuid; cur_end timestamptz; s timestamptz; e timestamptz; amt numeric; ls timestamp; tz constant text := 'Africa/Tunis'; sc text;
        credit numeric := 0; moved boolean := false;
begin
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Aucun compte avec cet e-mail : %', p_email; end if;
  sc := coalesce(p_scope, case when p_plan = 'dcem3' then 'dcem3' else public.qb_track(u) end);
  if sc not in ('residanat', 'dcem1', 'dcem2', 'dcem3s1', 'dcem3') then raise exception 'Périmètre inconnu : % (residanat, dcem1, dcem2, dcem3s1 ou dcem3)', sc; end if;
  if p_plan = 'dcem3' and sc <> 'dcem3' then raise exception 'Le plan dcem3 ne s''applique qu''au périmètre dcem3.'; end if;
  if sc = 'dcem3' and p_plan in ('month', 'semester') then raise exception 'Pour un élève DCEM3, utilise le plan dcem3 (50 DT jusqu''à fin juin) ou custom.'; end if;
  if sc in ('dcem1', 'dcem2', 'dcem3s1') and p_plan <> 'custom' then raise exception 'Périmètre % : seul le plan custom est disponible (prix non décidés).', sc; end if;
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

insert into public.track_courses (track, sn, exclusive, faculty) values
  ('dcem3s1', 1, false, 'sousse'), ('dcem3s1', 2, false, 'sousse'), ('dcem3s1', 3, false, 'sousse'), ('dcem3s1', 5, false, 'sousse'), ('dcem3s1', 6, false, 'sousse'), ('dcem3s1', 7, false, 'sousse'), ('dcem3s1', 9, false, 'sousse'), ('dcem3s1', 10, false, 'sousse'), ('dcem3s1', 11, false, 'sousse'), ('dcem3s1', 12, false, 'sousse'), ('dcem3s1', 15, false, 'sousse'), ('dcem3s1', 16, false, 'sousse'), ('dcem3s1', 17, false, 'sousse'), ('dcem3s1', 18, false, 'sousse'), ('dcem3s1', 20, false, 'sousse'), ('dcem3s1', 21, false, 'sousse'), ('dcem3s1', 23, false, 'sousse'), ('dcem3s1', 24, false, 'sousse'), ('dcem3s1', 25, false, 'sousse'), ('dcem3s1', 26, false, 'sousse'), ('dcem3s1', 27, false, 'sousse'), ('dcem3s1', 28, false, 'sousse'), ('dcem3s1', 29, false, 'sousse'), ('dcem3s1', 30, false, 'sousse'), ('dcem3s1', 31, false, 'sousse'), ('dcem3s1', 33, false, 'sousse'), ('dcem3s1', 35, false, 'sousse'), ('dcem3s1', 36, false, 'sousse'), ('dcem3s1', 37, false, 'sousse'), ('dcem3s1', 41, false, 'sousse'), ('dcem3s1', 42, false, 'sousse'), ('dcem3s1', 44, false, 'sousse'), ('dcem3s1', 45, false, 'sousse'), ('dcem3s1', 46, false, 'sousse'), ('dcem3s1', 47, false, 'sousse'), ('dcem3s1', 48, false, 'sousse'), ('dcem3s1', 49, false, 'sousse'), ('dcem3s1', 50, false, 'sousse'), ('dcem3s1', 51, false, 'sousse'), ('dcem3s1', 52, false, 'sousse'), ('dcem3s1', 55, false, 'sousse'), ('dcem3s1', 56, false, 'sousse'), ('dcem3s1', 58, false, 'sousse'), ('dcem3s1', 59, false, 'sousse'), ('dcem3s1', 60, false, 'sousse'), ('dcem3s1', 61, false, 'sousse'), ('dcem3s1', 62, false, 'sousse'), ('dcem3s1', 64, false, 'sousse'), ('dcem3s1', 65, false, 'sousse'), ('dcem3s1', 66, false, 'sousse'), ('dcem3s1', 67, false, 'sousse'), ('dcem3s1', 68, false, 'sousse'), ('dcem3s1', 73, false, 'sousse'), ('dcem3s1', 75, false, 'sousse'),
  ('dcem3s1', 5, false, 'tunis'), ('dcem3s1', 10, false, 'tunis'), ('dcem3s1', 12, false, 'tunis'), ('dcem3s1', 13, false, 'tunis'), ('dcem3s1', 14, false, 'tunis'), ('dcem3s1', 17, false, 'tunis'), ('dcem3s1', 18, false, 'tunis'), ('dcem3s1', 27, false, 'tunis'), ('dcem3s1', 28, false, 'tunis'), ('dcem3s1', 29, false, 'tunis'), ('dcem3s1', 30, false, 'tunis'), ('dcem3s1', 32, false, 'tunis'), ('dcem3s1', 37, false, 'tunis'), ('dcem3s1', 42, false, 'tunis'), ('dcem3s1', 48, false, 'tunis'), ('dcem3s1', 53, false, 'tunis'), ('dcem3s1', 56, false, 'tunis'), ('dcem3s1', 59, false, 'tunis'), ('dcem3s1', 60, false, 'tunis'), ('dcem3s1', 61, false, 'tunis'), ('dcem3s1', 63, false, 'tunis'), ('dcem3s1', 67, false, 'tunis'), ('dcem3s1', 69, false, 'tunis'), ('dcem3s1', 70, false, 'tunis'),
  ('dcem3s1', 5, false, 'monastir'), ('dcem3s1', 8, false, 'monastir'), ('dcem3s1', 10, false, 'monastir'), ('dcem3s1', 17, false, 'monastir'), ('dcem3s1', 19, false, 'monastir'), ('dcem3s1', 27, false, 'monastir'), ('dcem3s1', 28, false, 'monastir'), ('dcem3s1', 29, false, 'monastir'), ('dcem3s1', 30, false, 'monastir'), ('dcem3s1', 37, false, 'monastir'), ('dcem3s1', 48, false, 'monastir'), ('dcem3s1', 59, false, 'monastir'), ('dcem3s1', 61, false, 'monastir'), ('dcem3s1', 63, false, 'monastir'), ('dcem3s1', 67, false, 'monastir'), ('dcem3s1', 69, false, 'monastir'), ('dcem3s1', 70, false, 'monastir'), ('dcem3s1', 75, false, 'monastir'),
  ('dcem3s1', 5, false, 'sfax'), ('dcem3s1', 10, false, 'sfax'), ('dcem3s1', 17, false, 'sfax'), ('dcem3s1', 27, false, 'sfax'), ('dcem3s1', 28, false, 'sfax'), ('dcem3s1', 30, false, 'sfax'), ('dcem3s1', 37, false, 'sfax'), ('dcem3s1', 48, false, 'sfax'), ('dcem3s1', 59, false, 'sfax'), ('dcem3s1', 61, false, 'sfax'), ('dcem3s1', 67, false, 'sfax')
on conflict do nothing;
