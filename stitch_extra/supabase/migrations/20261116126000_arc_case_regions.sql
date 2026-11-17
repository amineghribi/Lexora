-- Liste des régions d'examen d'un cas ARC, pour l'écran « Examen clinique ».
-- N'expose que les libellés (id, label) : les constats restent côté serveur et ne sortent que par
-- arc_ask(kind = 'exam'). Aucune donnée modifiée, aucune écriture.
create or replace function public.arc_case_regions(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); pl jsonb;
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0001';
  end if;
  select payload into pl from public.arc_case_steps where case_id = p_case and kind = 'exam' order by rank limit 1;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r->>'id', 'label', r->>'label') order by ord)
    from jsonb_array_elements(coalesce(pl->'regions', '[]'::jsonb)) with ordinality t(r, ord)
  ), '[]'::jsonb);
end $function$;

revoke execute on function public.arc_case_regions(uuid) from public, anon;
grant execute on function public.arc_case_regions(uuid) to authenticated;
