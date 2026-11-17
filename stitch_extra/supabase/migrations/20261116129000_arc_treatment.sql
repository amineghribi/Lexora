-- Ordonnance / thérapeutique : catalogue du cas (classes, doses, voix d'administration), liaison
-- salle de cathétérisme si le cas la déclare, et correction serveur des items retenus.
-- Rien n'est exposé des items attendus avant la validation : `arc_treatment` ne renvoie que le
-- catalogue prescriptible (payload->'treatment'), `arc_treatment_grade` compare à answer_key.
create or replace function public.arc_treatment(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); pl jsonb; ak jsonb;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0001';
  end if;
  select payload, answer_key into pl, ak from public.arc_case_steps where case_id = p_case and kind = 'diagnosis' order by rank limit 1;
  return jsonb_build_object(
    'catalogue', coalesce(pl->'treatment', '[]'::jsonb),
    'cathlab', coalesce(pl->'cathlab', 'null'::jsonb),
    'has_plan', jsonb_typeof(ak->'treatment') = 'array' and jsonb_array_length(coalesce(ak->'treatment','[]'::jsonb)) > 0
  );
end $function$;

create or replace function public.arc_treatment_grade(p_case uuid, p_ids jsonb)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); ak jsonb; req text[]; got text[]; missing text[]; extra text[]; n int; ok int;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_ids is null or jsonb_typeof(p_ids) <> 'array' then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  select answer_key into ak from public.arc_case_steps where case_id = p_case and kind = 'diagnosis' order by rank limit 1;
  req := coalesce((select array_agg(public.arc_norm(x)) from jsonb_array_elements_text(coalesce(ak->'treatment', '[]'::jsonb)) x), '{}');
  got := coalesce((select array_agg(public.arc_norm(x)) from jsonb_array_elements_text(p_ids) x), '{}');
  if array_length(req, 1) is null then
    return jsonb_build_object('graded', false, 'missing', '[]'::jsonb, 'extra', '[]'::jsonb);
  end if;
  n := array_length(req, 1);
  ok := (select count(*) from unnest(req) r where r = any (got));
  missing := array(select r from unnest(req) r where not (r = any (got)));
  extra := array(select g from unnest(got) g where not (g = any (req)));
  return jsonb_build_object('graded', true, 'correct', ok, 'total', n,
    'pct', case when n > 0 then round(100.0 * ok / n) else 0 end,
    'missing', to_jsonb(missing), 'extra', to_jsonb(extra));
end $function$;

revoke execute on function public.arc_treatment(uuid) from public, anon;
grant execute on function public.arc_treatment(uuid) to authenticated;
revoke execute on function public.arc_treatment_grade(uuid, jsonb) from public, anon;
grant execute on function public.arc_treatment_grade(uuid, jsonb) to authenticated;
