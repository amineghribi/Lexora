-- ===== P2 : seed specialty_map + RPC élèves / enseignants =====
-- Déjà appliquée en production (nom : p2_arc_rpc_and_specialty_seed). Fichier ajouté pour que le dépôt reflète la base.

-- 1. Seed depuis qbank.sp (libellés composés séparés, « Examens blancs » exclus) -------------------------------
insert into public.specialty_map (slug, label, sort_order)
select slug, label, row_number() over (order by label)::int
from (
  select label, left(trim(both '-' from regexp_replace(lower(translate(label, 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc')), '[^a-z0-9]+', '-', 'g')), 40) as slug
  from (
    select distinct btrim(s.sp) as label
    from public.qbank b cross join lateral unnest(string_to_array(b.sp, ', ')) as s(sp)
    where b.sp is not null and btrim(s.sp) <> '' and s.sp not ilike 'Examens blancs%'
  ) l
) x
on conflict (slug) do nothing;

alter table public.teacher_specialties
  add constraint teacher_specialties_slug_fk foreign key (specialty) references public.specialty_map (slug);

-- 2. Anti-triche : une tentative liée à un cas ne s'écrit que via submit_arc_attempt ----------------------------
create or replace function public.arc_attempts_guard()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if coalesce(auth.role(), '') = 'authenticated' and new.case_uuid is not null
     and coalesce(current_setting('app.arc_rpc', true), '') <> '1' then
    raise exception 'USE_SUBMIT_RPC' using errcode = 'P0001';
  end if;
  return new;
end $function$;
create trigger arc_attempts_guard before insert on public.arc_attempts for each row execute function public.arc_attempts_guard();

-- 3. Fonctions internes (jamais exposées) ------------------------------------------------------------------------
create or replace function public.arc_norm(t text)
returns text language sql immutable set search_path to ''
as $$ select btrim(regexp_replace(regexp_replace(translate(lower(coalesce(t, '')), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'), '[^a-z0-9 ]+', ' ', 'g'), '\s+', ' ', 'g')) $$;

create or replace function public.arc_validate_steps(p_steps jsonb)
returns text language plpgsql immutable set search_path to ''
as $function$
declare s jsonb; k text;
begin
  if coalesce(jsonb_typeof(p_steps), '') <> 'array' or jsonb_array_length(p_steps) = 0 then return 'STEPS_REQUIRED'; end if;
  if jsonb_array_length(p_steps) > 40 then return 'TOO_MANY_STEPS'; end if;
  if length(p_steps::text) > 200000 then return 'TOO_LARGE'; end if;
  for s in select value from jsonb_array_elements(p_steps) loop
    k := s->>'kind';
    if k is null or k not in ('presentation', 'history', 'exam', 'investigation', 'differential', 'diagnosis') then return 'BAD_KIND'; end if;
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
    end if;
  end loop;
  return null;
end $function$;

create or replace function public.arc_visible_ids(u uuid)
returns uuid[] language plpgsql stable security definer set search_path to ''
as $function$
declare trk text; fac text; fr boolean; fs integer[]; labels text[]; ids uuid[];
begin
  if public.is_teacher(u) then
    select coalesce(array_agg(c.id), '{}') into ids from public.arc_cases c
     where c.author_id = u
        or (c.status = 'published' and c.specialty_slug in (select t.specialty from public.teacher_specialties t where t.user_id = u));
    return ids;
  end if;
  trk := public.qb_track(u); fac := public.qb_faculty(u);
  if trk = 'residanat' then
    select coalesce(array_agg(c.id), '{}') into ids from public.arc_cases c where c.status = 'published';
    return ids;
  end if;
  select * into fr, fs from public.track_filter(trk, fac);
  select coalesce(array_agg(distinct btrim(s.sp)), '{}') into labels
    from public.qbank b cross join lateral unnest(string_to_array(b.sp, ', ')) as s(sp)
   where b.p and coalesce(b.f, '') <> 'x' and (case when fr then b.sn = any (fs) else (b.sn is null or b.sn <> all (fs)) end);
  select coalesce(array_agg(c.id), '{}') into ids
    from public.arc_cases c join public.specialty_map m on m.slug = c.specialty_slug
   where c.status = 'published' and c.track = trk and (c.faculty is null or c.faculty = fac) and m.label = any (labels);
  return ids;
end $function$;

create or replace function public.arc_grade(p_case uuid, p_answers jsonb)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare st record; comp jsonb := '{}'::jsonb; fb jsonb := '[]'::jsonb; w numeric; sc numeric; tot_w numeric := 0; tot numeric := 0; dx boolean := null;
        sel text[]; rel text[]; hits int; miss int; arr jsonb; missed jsonb; exp jsonb; listed text[]; n_exp int; n_hit int; acc text[]; ans text; ra jsonb;
begin
  for st in select kind, payload, answer_key, explanation, rank from public.arc_case_steps where case_id = p_case order by rank loop
    sc := null; w := 0; missed := '[]'::jsonb;
    if st.kind in ('history', 'exam', 'investigation') then
      arr := coalesce(case when st.kind = 'exam' then st.payload->'regions' else st.payload->'items' end, '[]'::jsonb);
      ra := case when jsonb_typeof(p_answers->st.kind) = 'array' then p_answers->st.kind else '[]'::jsonb end;
      select coalesce(array_agg(i->>'id'), '{}') into rel from jsonb_array_elements(arr) i where coalesce((i->>'relevant')::boolean, false);
      select coalesce(array_agg(distinct x), '{}') into sel from jsonb_array_elements_text(ra) x;
      if cardinality(rel) > 0 then
        select count(*) into hits from unnest(sel) s where s = any (rel);
        select count(*) into miss from unnest(sel) s where s <> all (rel) and exists (select 1 from jsonb_array_elements(arr) i where i->>'id' = s);
        sc := least(1, greatest(0, hits - 0.5 * miss)::numeric / cardinality(rel));
        select coalesce(jsonb_agg(i->>'label'), '[]'::jsonb) into missed from jsonb_array_elements(arr) i
         where coalesce((i->>'relevant')::boolean, false) and (i->>'id') <> all (sel);
      end if;
      w := case st.kind when 'history' then 0.2 else 0.15 end;
    elsif st.kind = 'differential' then
      exp := coalesce(st.answer_key->'expected', '[]'::jsonb);
      n_exp := jsonb_array_length(exp);
      select coalesce(array_agg(public.arc_norm(x)), '{}') into listed
        from jsonb_array_elements_text(case when jsonb_typeof(p_answers->'differential') = 'array' then p_answers->'differential' else '[]'::jsonb end) x;
      if n_exp > 0 then
        select count(*) into n_hit from jsonb_array_elements(exp) e where public.arc_norm(e->>'dx') = any (listed);
        sc := n_hit::numeric / n_exp;
        select coalesce(jsonb_agg(e), '[]'::jsonb) into missed from jsonb_array_elements(exp) e where public.arc_norm(e->>'dx') <> all (listed);
      end if;
      w := 0.2;
    elsif st.kind = 'diagnosis' then
      select coalesce(array_agg(public.arc_norm(x)), '{}') into acc from jsonb_array_elements_text(coalesce(st.answer_key->'accepted', '[]'::jsonb)) x;
      ans := public.arc_norm(p_answers->>'diagnosis');
      dx := (ans <> '' and ans = any (acc));
      sc := case when dx then 1 else 0 end;
      w := 0.3;
    end if;
    if sc is not null then
      comp := jsonb_set(comp, array[st.kind], to_jsonb(round(sc, 2)));
      tot_w := tot_w + w; tot := tot + w * sc;
    end if;
    fb := fb || jsonb_build_array(jsonb_build_object('rank', st.rank, 'kind', st.kind, 'missed', missed, 'explanation', st.explanation,
            'accepted', case when st.kind = 'diagnosis' then st.answer_key->'accepted' end));
  end loop;
  return jsonb_build_object('pct', case when tot_w = 0 then 0 else round(100 * tot / tot_w)::int end, 'dx_ok', dx, 'components', comp, 'feedback', fb);
end $function$;

revoke execute on function public.arc_norm(text), public.arc_validate_steps(jsonb), public.arc_visible_ids(uuid), public.arc_grade(uuid, jsonb), public.arc_attempts_guard() from public, anon, authenticated;

-- 4. RPC élèves : spécialités et questions par spécialité (interface C) -------------------------------------------
create or replace function public.get_specialties()
returns jsonb language sql stable security definer set search_path to ''
as $$ select public.my_specialty_index() $$;

create or replace function public.get_questions_by_specialty(p_sp text, p_limit integer default 30, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid(); fr boolean; fs integer[]; ids text[]; lim int; off int; tot int;
begin
  perform public.qb_guard();
  if p_sp is null or btrim(p_sp) = '' or length(p_sp) > 80 then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  lim := least(greatest(coalesce(p_limit, 30), 1), 30);
  off := least(greatest(coalesce(p_offset, 0), 0), 20000);
  select * into fr, fs from public.track_filter(public.qb_track(u), public.qb_faculty(u));
  select count(*) into tot from public.qbank b
   where b.p and coalesce(b.f, '') <> 'x' and (case when fr then b.sn = any (fs) else (b.sn is null or b.sn <> all (fs)) end)
     and p_sp = any (string_to_array(b.sp, ', '));
  select array_agg(s.id order by s.id) into ids from (
    select b.id from public.qbank b
     where b.p and coalesce(b.f, '') <> 'x' and (case when fr then b.sn = any (fs) else (b.sn is null or b.sn <> all (fs)) end)
       and p_sp = any (string_to_array(b.sp, ', '))
     order by b.id limit lim offset off) s;
  if ids is null then return jsonb_build_object('total', tot, 'items', '[]'::jsonb); end if;
  perform public.qb_serve(u, ids);
  return jsonb_build_object('total', tot, 'items', coalesce((select jsonb_agg(b.pub order by array_position(ids, b.id)) from public.qbank b where b.id = any (ids)), '[]'::jsonb));
end $function$;

-- 5. RPC ARC : lecture (élèves et enseignants) -----------------------------------------------------------------------
create or replace function public.list_arc_cases(p_specialty text default null)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); vis uuid[]; teacher boolean;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  teacher := public.is_teacher(u);
  vis := public.arc_visible_ids(u);
  return coalesce((
    select jsonb_agg(
      jsonb_build_object('id', c.id, 'title', c.title, 'motif', c.motif, 'specialty', m.label, 'specialty_slug', c.specialty_slug,
        'track', c.track, 'faculty', c.faculty, 'level', c.level, 'version', c.version,
        'steps', (select count(*) from public.arc_case_steps s where s.case_id = c.id))
      || case when teacher then jsonb_build_object('status', c.status, 'mine', c.author_id = u) else '{}'::jsonb end
      order by m.sort_order, m.label, c.motif, c.title)
    from (select * from public.arc_cases where id = any (vis) and (p_specialty is null or specialty_slug = p_specialty) order by created_at desc limit 200) c
    join public.specialty_map m on m.slug = c.specialty_slug), '[]'::jsonb);
end $function$;

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
    select coalesce(jsonb_agg(jsonb_build_object('rank', s.rank, 'kind', s.kind, 'text', case when s.kind = 'presentation' then s.payload->>'text' end) order by s.rank), '[]'::jsonb)
      into steps from public.arc_case_steps s where s.case_id = p_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', md.id, 'kind', md.kind, 'caption', md.caption, 'rank', md.rank, 'r2_key', md.r2_key) order by md.rank, md.id), '[]'::jsonb)
    into media from public.arc_case_media md where md.case_id = p_id;
  return jsonb_build_object('id', c.id, 'title', c.title, 'motif', c.motif, 'specialty', c.specialty_label, 'specialty_slug', c.specialty_slug,
    'track', c.track, 'faculty', c.faculty, 'level', c.level, 'version', c.version, 'status', case when mine then c.status end, 'mine', mine,
    'steps', steps, 'media', media);
end $function$;

-- 6. RPC ARC : interrogatoire / examen / examens complémentaires saisis par l'élève ------------------------------
create or replace function public.arc_suggest(p_case uuid, p_kind text, p_q text)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); pl jsonb; arr jsonb; nq text;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_kind is null or p_kind not in ('history', 'exam', 'investigation') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then raise exception 'CASE_NOT_FOUND' using errcode = 'P0001'; end if;
  nq := public.arc_norm(left(coalesce(p_q, ''), 100));
  if length(nq) < 2 then return '[]'::jsonb; end if;
  select payload into pl from public.arc_case_steps where case_id = p_case and kind = p_kind order by rank limit 1;
  arr := coalesce(case when p_kind = 'exam' then pl->'regions' else pl->'items' end, '[]'::jsonb);
  return coalesce((select jsonb_agg(jsonb_build_object('id', i->>'id', 'label', i->>'label'))
                   from (select i from jsonb_array_elements(arr) i where public.arc_norm(i->>'label') like '%' || nq || '%' limit 8) t(i)), '[]'::jsonb);
end $function$;

create or replace function public.arc_ask(p_case uuid, p_kind text, p_text text)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); pl jsonb; arr jsonb; it jsonb; nt text; vkey text; dflt text; syn jsonb;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_kind is null or p_kind not in ('history', 'exam', 'investigation') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if p_text is null or btrim(p_text) = '' or length(p_text) > 200 then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then raise exception 'CASE_NOT_FOUND' using errcode = 'P0001'; end if;
  select payload into pl from public.arc_case_steps where case_id = p_case and kind = p_kind order by rank limit 1;
  arr := coalesce(case when p_kind = 'exam' then pl->'regions' else pl->'items' end, '[]'::jsonb);
  vkey := case p_kind when 'history' then 'answer' when 'exam' then 'finding' else 'result' end;
  dflt := coalesce(pl->>(case p_kind when 'history' then 'default_answer' when 'exam' then 'default_finding' else 'default_result' end),
                   case p_kind when 'history' then 'Non.' when 'exam' then 'Examen normal.' else 'Résultat normal.' end);
  nt := public.arc_norm(p_text);
  for it in select value from jsonb_array_elements(arr) loop
    syn := case when jsonb_typeof(it->'synonyms') = 'array' then it->'synonyms' else '[]'::jsonb end;
    if nt = public.arc_norm(it->>'id') or nt = public.arc_norm(it->>'label')
       or exists (select 1 from jsonb_array_elements_text(syn) sy where length(public.arc_norm(sy)) >= 3 and nt like '%' || public.arc_norm(sy) || '%') then
      return jsonb_build_object('matched', true, 'id', it->>'id', 'label', it->>'label', 'value', it->>vkey);
    end if;
  end loop;
  return jsonb_build_object('matched', false, 'value', dflt);
end $function$;

-- 7. RPC ARC : correction côté serveur --------------------------------------------------------------------------------
create or replace function public.submit_arc_attempt(p_case uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); c public.arc_cases; g jsonb; n int;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then raise exception 'CASE_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 20000 then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  select * into c from public.arc_cases where id = p_case;
  g := public.arc_grade(p_case, p_answers);
  if public.is_teacher(u) then return g || jsonb_build_object('preview', true); end if;
  select count(*) into n from public.arc_attempts where user_id = u and created_at > now() - interval '10 minutes';
  if n >= 20 then raise exception 'RATE_LIMITED' using errcode = 'P0001'; end if;
  perform set_config('app.arc_rpc', '1', true);
  insert into public.arc_attempts (user_id, motif, case_id, pct, dx_ok, detail, case_uuid, case_version)
  values (u, c.motif, p_case::text, (g->>'pct')::int, coalesce((g->>'dx_ok')::boolean, false), jsonb_build_object('components', g->'components'), p_case, c.version);
  return g || jsonb_build_object('preview', false);
end $function$;

-- 8. RPC enseignant : création, publication, statistiques --------------------------------------------------------------
create or replace function public.save_arc_case(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); cid uuid; spec text; trk text; fac text; err text; rec public.arc_cases; st jsonb; md jsonb; i int := 0; ver int; stt text;
begin
  if not public.is_teacher(u) then raise exception 'TEACHER_ONLY' using errcode = 'P0001'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  spec := p_payload->>'specialty_slug'; trk := p_payload->>'track'; fac := nullif(p_payload->>'faculty', '');
  if spec is null or not (public.my_specialties() @> array[spec]) then raise exception 'SPECIALTY_FORBIDDEN' using errcode = 'P0001'; end if;
  if trk is null or trk not in ('dcem1', 'dcem2', 'dcem3s1', 'dcem3') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if fac is not null and fac not in ('monastir', 'tunis', 'sousse', 'sfax') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  err := public.arc_validate_steps(p_payload->'steps');
  if err is not null then raise exception '%', err using errcode = 'P0001'; end if;
  if p_payload ? 'media' then
    if jsonb_typeof(p_payload->'media') <> 'array' or jsonb_array_length(p_payload->'media') > 40 then raise exception 'BAD_MEDIA' using errcode = 'P0001'; end if;
    if exists (select 1 from jsonb_array_elements(p_payload->'media') m
               where coalesce(m->>'kind', '') not in ('image', 'audio', 'video', 'pdf')
                  or coalesce(m->>'r2_key', '') !~ '^[A-Za-z0-9/_.-]{1,300}$' or (m->>'r2_key') like '%..%') then
      raise exception 'BAD_MEDIA' using errcode = 'P0001';
    end if;
  end if;
  if nullif(p_payload->>'id', '') is null then
    insert into public.arc_cases (author_id, specialty_slug, track, faculty, motif, title, level)
    values (u, spec, trk, fac, p_payload->>'motif', p_payload->>'title', nullif(p_payload->>'level', ''))
    returning id into cid;
  else
    begin cid := (p_payload->>'id')::uuid; exception when invalid_text_representation then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end;
    select * into rec from public.arc_cases where id = cid and author_id = u for update;
    if not found then raise exception 'CASE_NOT_FOUND' using errcode = 'P0001'; end if;
    if rec.status = 'archived' then raise exception 'CASE_ARCHIVED' using errcode = 'P0001'; end if;
    update public.arc_cases set specialty_slug = spec, track = trk, faculty = fac, motif = p_payload->>'motif', title = p_payload->>'title', level = nullif(p_payload->>'level', '')
     where id = cid;
    delete from public.arc_case_steps where case_id = cid;
    delete from public.arc_case_media where case_id = cid;
  end if;
  for st in select value from jsonb_array_elements(p_payload->'steps') loop
    i := i + 1;
    insert into public.arc_case_steps (case_id, rank, kind, payload, answer_key, explanation)
    values (cid, i, st->>'kind', coalesce(st->'payload', '{}'::jsonb), st->'answer_key', st->>'explanation');
  end loop;
  i := 0;
  if p_payload ? 'media' then
    for md in select value from jsonb_array_elements(p_payload->'media') loop
      i := i + 1;
      insert into public.arc_case_media (case_id, kind, r2_key, caption, rank) values (cid, md->>'kind', md->>'r2_key', md->>'caption', i);
    end loop;
  end if;
  select version, status into ver, stt from public.arc_cases where id = cid;
  return jsonb_build_object('id', cid, 'version', ver, 'status', stt);
end $function$;

create or replace function public.publish_arc_case(p_id uuid, p_publish boolean)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); rec public.arc_cases; steps jsonb; err text;
begin
  if not public.is_teacher(u) then raise exception 'TEACHER_ONLY' using errcode = 'P0001'; end if;
  select * into rec from public.arc_cases where id = p_id and author_id = u for update;
  if not found then raise exception 'CASE_NOT_FOUND' using errcode = 'P0001'; end if;
  if rec.status = 'archived' then raise exception 'CASE_ARCHIVED' using errcode = 'P0001'; end if;
  if coalesce(p_publish, false) then
    if not (public.my_specialties() @> array[rec.specialty_slug]) then raise exception 'SPECIALTY_FORBIDDEN' using errcode = 'P0001'; end if;
    select jsonb_agg(jsonb_build_object('kind', kind, 'payload', payload, 'answer_key', answer_key) order by rank) into steps from public.arc_case_steps where case_id = p_id;
    err := public.arc_validate_steps(steps);
    if err is not null then raise exception '%', err using errcode = 'P0001'; end if;
    if not exists (select 1 from public.arc_case_steps where case_id = p_id and kind = 'presentation')
       or not exists (select 1 from public.arc_case_steps where case_id = p_id and kind = 'diagnosis') then
      raise exception 'INCOMPLETE_CASE' using errcode = 'P0001';
    end if;
    perform set_config('app.arc_rpc', '1', true);
    update public.arc_cases set status = 'published' where id = p_id;
  else
    update public.arc_cases set status = 'draft' where id = p_id and status = 'published';
  end if;
  return jsonb_build_object('id', p_id, 'status', (select status from public.arc_cases where id = p_id), 'version', (select version from public.arc_cases where id = p_id));
end $function$;

create or replace function public.arc_case_stats(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); n int;
begin
  if not public.is_teacher(u) then raise exception 'TEACHER_ONLY' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.arc_cases where id = p_case and author_id = u) then raise exception 'CASE_NOT_FOUND' using errcode = 'P0001'; end if;
  select count(*) into n from public.arc_attempts where case_uuid = p_case;
  return jsonb_build_object(
    'attempts', n,
    'avg_pct', (select round(avg(pct), 1) from public.arc_attempts where case_uuid = p_case),
    'dx_ok_rate', (select round(100.0 * count(*) filter (where dx_ok) / nullif(count(*), 0), 1) from public.arc_attempts where case_uuid = p_case),
    'distribution', jsonb_build_object(
      '0-39', (select count(*) from public.arc_attempts where case_uuid = p_case and pct < 40),
      '40-59', (select count(*) from public.arc_attempts where case_uuid = p_case and pct between 40 and 59),
      '60-79', (select count(*) from public.arc_attempts where case_uuid = p_case and pct between 60 and 79),
      '80-100', (select count(*) from public.arc_attempts where case_uuid = p_case and pct >= 80)),
    'components', (select jsonb_build_object(
        'history', round(avg((detail->'components'->>'history')::numeric), 2),
        'exam', round(avg((detail->'components'->>'exam')::numeric), 2),
        'investigation', round(avg((detail->'components'->>'investigation')::numeric), 2),
        'differential', round(avg((detail->'components'->>'differential')::numeric), 2),
        'diagnosis', round(avg((detail->'components'->>'diagnosis')::numeric), 2))
      from public.arc_attempts where case_uuid = p_case));
end $function$;

-- 9. Droits : authenticated uniquement ------------------------------------------------------------------------------
revoke execute on function public.get_specialties(), public.get_questions_by_specialty(text, integer, integer), public.list_arc_cases(text), public.get_arc_case(uuid),
  public.arc_suggest(uuid, text, text), public.arc_ask(uuid, text, text), public.submit_arc_attempt(uuid, jsonb), public.save_arc_case(jsonb),
  public.publish_arc_case(uuid, boolean), public.arc_case_stats(uuid) from public, anon;
grant execute on function public.get_specialties(), public.get_questions_by_specialty(text, integer, integer), public.list_arc_cases(text), public.get_arc_case(uuid),
  public.arc_suggest(uuid, text, text), public.arc_ask(uuid, text, text), public.submit_arc_attempt(uuid, jsonb), public.save_arc_case(jsonb),
  public.publish_arc_case(uuid, boolean), public.arc_case_stats(uuid) to authenticated;
