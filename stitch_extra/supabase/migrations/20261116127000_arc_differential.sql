-- Diagnostic différentiel : hypothèses candidates + correction de la matrice pour/contre.
-- Les hypothèses exposées sont celles que l'auteur a déclarées (sinon les diagnostics attendus,
-- qui sont les candidats). La matrice de référence ne sort qu'à la correction.
create or replace function public.arc_differential(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); pl jsonb; ak jsonb; out jsonb;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0001';
  end if;
  select payload, answer_key into pl, ak from public.arc_case_steps where case_id = p_case and kind = 'differential' order by rank limit 1;
  if pl is null then return jsonb_build_object('hypotheses', '[]'::jsonb, 'has_matrix', false); end if;
  if jsonb_typeof(pl->'hypotheses') = 'array' then
    select coalesce(jsonb_agg(coalesce(h->>'label', h#>>'{}')), '[]'::jsonb) into out
      from jsonb_array_elements(pl->'hypotheses') h;
  elsif jsonb_typeof(ak->'expected') = 'array' then
    select coalesce(jsonb_agg(e->>'dx'), '[]'::jsonb) into out from jsonb_array_elements(ak->'expected') e;
  else
    out := '[]'::jsonb;
  end if;
  return jsonb_build_object('hypotheses', coalesce(out, '[]'::jsonb),
                            'has_matrix', jsonb_typeof(ak->'matrix') = 'array' or jsonb_typeof(pl->'matrix') = 'array');
end $function$;

create or replace function public.arc_differential_grade(p_case uuid, p_cells jsonb)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); ak jsonb; ref jsonb; given_cells jsonb; n int; ok int;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  select answer_key into ak from public.arc_case_steps where case_id = p_case and kind = 'differential' order by rank limit 1;
  ref := coalesce(ak->'matrix', '[]'::jsonb);
  if jsonb_typeof(ref) <> 'array' or jsonb_array_length(ref) = 0 then
    return jsonb_build_object('graded', false, 'expected', '[]'::jsonb);
  end if;
  select count(*) into n from jsonb_array_elements(ref);
  select count(*) into ok
    from jsonb_array_elements(ref) r
    join jsonb_array_elements(p_cells) c
      on public.arc_norm(c->>'dx') = public.arc_norm(r->>'dx')
     and public.arc_norm(c->>'item') = public.arc_norm(r->>'item')
   where upper(coalesce(c->>'v','')) = upper(coalesce(r->>'v',''));
  return jsonb_build_object('graded', true, 'expected', ref, 'correct', ok, 'total', n,
                            'pct', case when n > 0 then round(100.0 * ok / n) else 0 end);
end $function$;

revoke execute on function public.arc_differential(uuid) from public, anon;
grant execute on function public.arc_differential(uuid) to authenticated;
revoke execute on function public.arc_differential_grade(uuid, jsonb) from public, anon;
grant execute on function public.arc_differential_grade(uuid, jsonb) to authenticated;
