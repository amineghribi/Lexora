-- Diagnostic final : scores de risque du cas, formulation retenue, correction serveur.
-- `arc_diagnosis` n'expose que ce que le cas déclare comme scores (payload->'scores') : aucun
-- diagnostic attendu. `arc_diagnosis_grade` compare la formulation aux diagnostics acceptés
-- (answer_key->'accepted', normalisés) et renvoie la bonne formulation en cas d'échec.
create or replace function public.arc_diagnosis(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); pl jsonb;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0001';
  end if;
  select payload into pl from public.arc_case_steps where case_id = p_case and kind = 'diagnosis' order by rank limit 1;
  return jsonb_build_object(
    'scores', coalesce(pl->'scores', '[]'::jsonb),
    'pillars', coalesce(pl->'pillars', '["Clinique","ECG","Biologie","Risque"]'::jsonb),
    'has_step', pl is not null);
end $function$;

create or replace function public.arc_diagnosis_grade(p_case uuid, p_text text, p_pillars jsonb default '[]'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); ak jsonb; nt text; acc text[]; hit text; filled int;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_text is null or length(btrim(p_text)) < 3 then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  select answer_key into ak from public.arc_case_steps where case_id = p_case and kind = 'diagnosis' order by rank limit 1;
  acc := coalesce((select array_agg(public.arc_norm(x)) from jsonb_array_elements_text(coalesce(ak->'accepted', '[]'::jsonb)) x), '{}');
  nt := public.arc_norm(p_text);
  hit := (select a from unnest(acc) a where nt like '%' || a || '%' or a like '%' || nt || '%' limit 1);
  select count(*) into filled from jsonb_array_elements(coalesce(p_pillars, '[]'::jsonb)) p
    where length(btrim(coalesce(p#>>'{}',''))) >= 10;
  return jsonb_build_object(
    'accepted', hit is not null,
    'expected', case when hit is null then coalesce(ak->'accepted', '[]'::jsonb) end,
    'pillars_filled', filled,
    'pillars_total', jsonb_array_length(coalesce(p_pillars, '[]'::jsonb)));
end $function$;

revoke execute on function public.arc_diagnosis(uuid) from public, anon;
grant execute on function public.arc_diagnosis(uuid) to authenticated;
revoke execute on function public.arc_diagnosis_grade(uuid, text, jsonb) from public, anon;
grant execute on function public.arc_diagnosis_grade(uuid, text, jsonb) to authenticated;
