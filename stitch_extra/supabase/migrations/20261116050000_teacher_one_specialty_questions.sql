-- Espace enseignant : une seule spécialité par enseignant, étape « questions » dans un ARC
-- (questions de la banque + questions écrites par l'enseignant), recherche dans la banque limitée à sa spécialité.

-- 1. Une spécialité par enseignant -----------------------------------------------------------------------------
-- Ceux qui en avaient plusieurs gardent « cardiologie » si elle y est, sinon la première par ordre alphabétique
-- (aujourd'hui : un seul compte, créé pour les essais, avec les 18 spécialités).
delete from public.teacher_specialties t
 using (select user_id,
               coalesce(min(specialty) filter (where specialty = 'cardiologie'), min(specialty)) as keep
          from public.teacher_specialties group by user_id) k
 where t.user_id = k.user_id and t.specialty <> k.keep;
create unique index if not exists teacher_specialties_one_per_user on public.teacher_specialties (user_id);

-- grant_teacher remplace la spécialité au lieu d'en ajouter une (le second appel changeait rien à cause de l'index unique)
create or replace function public.grant_teacher(p_email text, p_specialty text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare u uuid;
begin
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Aucun compte avec cet e-mail : %', p_email; end if;
  if p_specialty is null or p_specialty !~ '^[a-z0-9_-]{2,40}$' then raise exception 'Spécialité invalide : % (minuscules, chiffres, - et _, 2 à 40 caractères)', p_specialty; end if;
  insert into public.account_roles (user_id, role) values (u, 'teacher') on conflict (user_id) do nothing;
  insert into public.teacher_specialties (user_id, specialty) values (u, p_specialty)
    on conflict (user_id) do update set specialty = excluded.specialty;
  return jsonb_build_object('email', lower(trim(p_email)), 'role', 'teacher',
    'specialties', (select jsonb_agg(specialty order by specialty) from public.teacher_specialties where user_id = u));
end $function$;

-- 2. Nouveau type d'étape : questions -----------------------------------------------------------------------------
do $$
declare cn text;
begin
  select conname into cn from pg_constraint
   where conrelid = 'public.arc_case_steps'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%presentation%';
  if cn is not null then execute format('alter table public.arc_case_steps drop constraint %I', cn); end if;
end $$;
alter table public.arc_case_steps add constraint arc_case_steps_kind_check
  check (kind in ('presentation', 'history', 'exam', 'investigation', 'differential', 'diagnosis', 'questions'));

-- Une question écrite par l'enseignant : { id, q, o: {A..E}, correct: [lettres], explanation }
create or replace function public.arc_custom_q_ok(c jsonb)
returns boolean language plpgsql immutable set search_path to ''
as $function$
declare x text;
begin
  if jsonb_typeof(c) <> 'object' then return false; end if;
  if btrim(coalesce(c->>'id', '')) = '' or btrim(coalesce(c->>'q', '')) = '' then return false; end if;
  if jsonb_typeof(c->'o') <> 'object' then return false; end if;
  if (select count(*) from jsonb_each_text(c->'o') e where btrim(e.value) <> '') < 2 then return false; end if;
  if jsonb_typeof(c->'correct') <> 'array' or jsonb_array_length(c->'correct') = 0 then return false; end if;
  for x in select jsonb_array_elements_text(c->'correct') loop
    if btrim(coalesce(c->'o'->>x, '')) = '' then return false; end if;
  end loop;
  return true;
end $function$;
revoke execute on function public.arc_custom_q_ok(jsonb) from public, anon, authenticated;

create or replace function public.arc_validate_steps(p_steps jsonb)
returns text language plpgsql stable set search_path to ''
as $function$
declare s jsonb; k text; bank jsonb; custom jsonb;
begin
  if coalesce(jsonb_typeof(p_steps), '') <> 'array' or jsonb_array_length(p_steps) = 0 then return 'STEPS_REQUIRED'; end if;
  if jsonb_array_length(p_steps) > 40 then return 'TOO_MANY_STEPS'; end if;
  if length(p_steps::text) > 200000 then return 'TOO_LARGE'; end if;
  for s in select value from jsonb_array_elements(p_steps) loop
    k := s->>'kind';
    if k is null or k not in ('presentation', 'history', 'exam', 'investigation', 'differential', 'diagnosis', 'questions') then return 'BAD_KIND'; end if;
    if k = 'presentation' then
      if btrim(coalesce(s->'payload'->>'text', '')) = '' then return 'PRESENTATION_TEXT'; end if;
    elsif k in ('history', 'investigation') then
      if coalesce(jsonb_typeof(s->'payload'->'items'), '') <> 'array' or jsonb_array_length(s->'payload'->'items') = 0 then return upper(k) || '_ITEMS'; end if;
      if exists (select 1 from jsonb_array_elements(s->'payload'->'items') i
                 where btrim(coalesce(i->>'id', '')) = '' or btrim(coalesce(i->>'label', '')) = ''
                    or (i->>(case when k = 'history' then 'answer' else 'result' end)) is null) then return upper(k) || '_ITEM_INVALID'; end if;
    elsif k = 'exam' then
      if coalesce(jsonb_typeof(s->'payload'->'regions'), '') <> 'array' or jsonb_array_length(s->'payload'->'regions') = 0 then return 'EXAM_REGIONS'; end if;
      if exists (select 1 from jsonb_array_elements(s->'payload'->'regions') i
                 where btrim(coalesce(i->>'id', '')) = '' or btrim(coalesce(i->>'label', '')) = '' or (i->>'finding') is null) then return 'EXAM_REGION_INVALID'; end if;
    elsif k = 'differential' then
      if coalesce(jsonb_typeof(s->'answer_key'->'expected'), '') <> 'array' or jsonb_array_length(s->'answer_key'->'expected') = 0 then return 'DIFFERENTIAL_EXPECTED'; end if;
      if exists (select 1 from jsonb_array_elements(s->'answer_key'->'expected') e where btrim(coalesce(e->>'dx', '')) = '') then return 'DIFFERENTIAL_DX'; end if;
    elsif k = 'diagnosis' then
      if coalesce(jsonb_typeof(s->'answer_key'->'accepted'), '') <> 'array' or jsonb_array_length(s->'answer_key'->'accepted') = 0 then return 'DIAGNOSIS_ACCEPTED'; end if;
    elsif k = 'questions' then
      bank := coalesce(s->'payload'->'bank', '[]'::jsonb); custom := coalesce(s->'payload'->'custom', '[]'::jsonb);
      if jsonb_typeof(bank) <> 'array' or jsonb_typeof(custom) <> 'array' then return 'QUESTIONS_INVALID'; end if;
      if jsonb_array_length(bank) + jsonb_array_length(custom) = 0 then return 'QUESTIONS_EMPTY'; end if;
      if jsonb_array_length(bank) > 30 or jsonb_array_length(custom) > 20 then return 'QUESTIONS_TOO_MANY'; end if;
      if exists (select 1 from jsonb_array_elements(bank) b where jsonb_typeof(b) <> 'string' or (b #>> '{}') !~ '^Q[0-9]{1,7}$') then return 'QUESTIONS_BANK_ID'; end if;
      if exists (select 1 from jsonb_array_elements_text(bank) i where not exists (select 1 from public.qbank q where q.id = i and q.p)) then return 'QUESTIONS_BANK_UNKNOWN'; end if;
      if exists (select 1 from jsonb_array_elements(custom) c where not public.arc_custom_q_ok(c)) then return 'QUESTIONS_CUSTOM_INVALID'; end if;
    end if;
  end loop;
  return null;
end $function$;

-- 3. Lecture élève : l'étape questions ne montre jamais les bonnes réponses --------------------------------------
create or replace function public.get_arc_case(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); c record; mine boolean; steps jsonb; media jsonb;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_id is null or not coalesce(p_id = any (public.arc_visible_ids(u)), false) then raise exception 'CASE_NOT_FOUND' using errcode = 'P0001'; end if;
  select c2.*, m.label as specialty_label into c from public.arc_cases c2 join public.specialty_map m on m.slug = c2.specialty_slug where c2.id = p_id;
  mine := c.author_id = u;
  if mine then
    select coalesce(jsonb_agg(jsonb_build_object('rank', s.rank, 'kind', s.kind, 'payload', s.payload, 'answer_key', s.answer_key, 'explanation', s.explanation) order by s.rank), '[]'::jsonb)
      into steps from public.arc_case_steps s where s.case_id = p_id;
  else
    select coalesce(jsonb_agg(
             jsonb_build_object('rank', s.rank, 'kind', s.kind, 'text', case when s.kind = 'presentation' then s.payload->>'text' end)
             || case when s.kind = 'questions' then jsonb_build_object(
                  'bank', coalesce(s.payload->'bank', '[]'::jsonb),
                  'custom', coalesce((select jsonb_agg(jsonb_build_object('id', q->>'id', 'q', q->>'q', 'o', q->'o', 'multi', jsonb_array_length(q->'correct') > 1))
                                        from jsonb_array_elements(coalesce(s.payload->'custom', '[]'::jsonb)) q), '[]'::jsonb))
                else '{}'::jsonb end
             order by s.rank), '[]'::jsonb)
      into steps from public.arc_case_steps s where s.case_id = p_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', md.id, 'kind', md.kind, 'caption', md.caption, 'rank', md.rank, 'r2_key', md.r2_key) order by md.rank, md.id), '[]'::jsonb)
    into media from public.arc_case_media md where md.case_id = p_id;
  return jsonb_build_object('id', c.id, 'title', c.title, 'motif', c.motif, 'specialty', c.specialty_label, 'specialty_slug', c.specialty_slug,
    'track', c.track, 'faculty', c.faculty, 'level', c.level, 'version', c.version, 'status', case when mine then c.status end, 'mine', mine,
    'steps', steps, 'media', media);
end $function$;

-- Correction d'une question de l'enseignant (la clé reste côté serveur)
create or replace function public.arc_check_custom(p_case uuid, p_qid text, p_chosen text[])
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); q jsonb; corr text[]; ch text[];
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then raise exception 'CASE_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_qid is null or length(p_qid) > 60 or p_chosen is null or cardinality(p_chosen) > 8 then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  select c into q from public.arc_case_steps s cross join lateral jsonb_array_elements(coalesce(s.payload->'custom', '[]'::jsonb)) c
   where s.case_id = p_case and s.kind = 'questions' and c->>'id' = p_qid limit 1;
  if q is null then raise exception 'CASE_NOT_FOUND' using errcode = 'P0001'; end if;
  select coalesce(array_agg(x order by x), '{}') into corr from jsonb_array_elements_text(q->'correct') x;
  select coalesce(array_agg(distinct x order by x), '{}') into ch from unnest(p_chosen) x;
  return jsonb_build_object('ok', ch = corr, 'correct', to_jsonb(corr), 'explanation', q->>'explanation');
end $function$;

-- 4. Banque de questions pour l'enseignant (sa spécialité, sans clé de réponse) -----------------------------------
create or replace function public.teacher_bank_questions(p_q text default null, p_limit integer default 20, p_offset integer default 0, p_ids text[] default null)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); lbl text; lim int; off int; tot int; needle text;
begin
  if not public.is_teacher(u) then raise exception 'TEACHER_ONLY' using errcode = 'P0001'; end if;
  select m.label into lbl from public.specialty_map m where m.slug = (public.my_specialties())[1];
  if lbl is null then return jsonb_build_object('total', 0, 'items', '[]'::jsonb); end if;
  lim := least(greatest(coalesce(p_limit, 20), 1), 20);
  off := least(greatest(coalesce(p_offset, 0), 0), 5000);
  needle := case when p_q is null or length(btrim(p_q)) < 2 then null else '%' || replace(replace(replace(left(btrim(p_q), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  if p_ids is not null and cardinality(p_ids) > 30 then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  select count(*) into tot from public.qbank b
   where b.p and coalesce(b.f, '') <> 'x' and lbl = any (string_to_array(b.sp, ', '))
     and (needle is null or (b.pub->>'q') ilike needle)
     and (p_ids is null or b.id = any (p_ids));
  return jsonb_build_object('total', tot, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('i', t.id, 'q', t.pub->>'q', 'o', t.pub->'o', 'tp', t.pub->>'tp') order by t.id)
    from (select b.id, b.pub from public.qbank b
           where b.p and coalesce(b.f, '') <> 'x' and lbl = any (string_to_array(b.sp, ', '))
             and (needle is null or (b.pub->>'q') ilike needle)
             and (p_ids is null or b.id = any (p_ids))
           order by b.id limit lim offset off) t), '[]'::jsonb));
end $function$;

revoke execute on function public.arc_check_custom(uuid, text, text[]), public.teacher_bank_questions(text, integer, integer, text[]), public.get_arc_case(uuid) from public, anon;
grant execute on function public.arc_check_custom(uuid, text, text[]), public.teacher_bank_questions(text, integer, integer, text[]), public.get_arc_case(uuid) to authenticated;
revoke execute on function public.arc_validate_steps(jsonb) from public, anon, authenticated;
