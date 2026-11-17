-- Import ponctuel des cas de l'ancien module ARC (studio/arc, convertis par convert_legacy.py) dans arc_cases, en brouillon.
-- Appelée uniquement par /api/arc-import avec le jeton de l'enseignant. Les cas sont créés au nom de l'appelant, parcours dcem3,
-- dans la spécialité indiquée par le fichier (contrairement à save_arc_case qui impose la spécialité de l'enseignant).
-- TEMPORAIRE : à supprimer après l'import (voir ops.journal), car elle permet de créer des brouillons dans n'importe quelle spécialité.
create or replace function public.import_legacy_arc_cases(p_cases jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); c jsonb; st jsonb; err text; cid uuid; i int; made int := 0; skipped int := 0;
begin
  if not public.is_teacher(u) then raise exception 'TEACHER_ONLY' using errcode = 'P0001'; end if;
  if coalesce(jsonb_typeof(p_cases), '') <> 'array' or jsonb_array_length(p_cases) = 0 or jsonb_array_length(p_cases) > 15 then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  for c in select value from jsonb_array_elements(p_cases) loop
    if not exists (select 1 from public.specialty_map m where m.slug = c->>'specialty_slug') then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
    err := public.arc_validate_steps(c->'steps');
    if err is not null then raise exception '%', err using errcode = 'P0001'; end if;
    if exists (select 1 from public.arc_cases x where x.author_id = u and x.specialty_slug = c->>'specialty_slug' and x.motif = c->>'motif' and x.title = c->>'title') then
      skipped := skipped + 1; continue;
    end if;
    insert into public.arc_cases (author_id, specialty_slug, track, motif, title, status)
    values (u, c->>'specialty_slug', 'dcem3', c->>'motif', c->>'title', 'draft') returning id into cid;
    i := 0;
    for st in select value from jsonb_array_elements(c->'steps') loop
      i := i + 1;
      insert into public.arc_case_steps (case_id, rank, kind, payload, answer_key, explanation)
      values (cid, i, st->>'kind', coalesce(st->'payload', '{}'::jsonb), st->'answer_key', st->>'explanation');
    end loop;
    made := made + 1;
  end loop;
  return jsonb_build_object('created', made, 'skipped', skipped);
end $function$;
revoke execute on function public.import_legacy_arc_cases(jsonb) from public, anon;
grant execute on function public.import_legacy_arc_cases(jsonb) to authenticated;
