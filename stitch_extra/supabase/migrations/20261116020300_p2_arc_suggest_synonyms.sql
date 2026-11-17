-- arc_suggest cherche aussi dans les synonymes. Déjà appliquée en production (nom : p2_arc_suggest_synonyms).
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
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', i->>'id', 'label', i->>'label'))
    from (
      select i from jsonb_array_elements(arr) i
      where public.arc_norm(i->>'label') like '%' || nq || '%'
         or exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(i->'synonyms') = 'array' then i->'synonyms' else '[]'::jsonb end) sy
                    where public.arc_norm(sy) like '%' || nq || '%')
      limit 8) t(i)), '[]'::jsonb);
end $function$;
