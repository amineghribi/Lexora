-- Débriefing : dernier bilan du compte sur ce cas + explications du barème, étape par étape.
-- Les explications ne sortent qu'une fois une tentative enregistrée pour ce compte et ce cas.
create or replace function public.arc_debrief(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := public.qb_uid_basic(); a record; steps jsonb; trk text := public.qb_track(u);
begin
  if not public.arc_access() then raise exception 'ARC_ACCESS' using errcode = 'P0001'; end if;
  if p_case is null or not coalesce(p_case = any (public.arc_visible_ids(u)), false) then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0001';
  end if;
  select pct, dx_ok, detail, created_at into a
    from public.arc_attempts
   where user_id = u and case_uuid = p_case
   order by created_at desc limit 1;
  if a.created_at is null then
    return jsonb_build_object('attempt', null, 'steps', '[]'::jsonb, 'track', trk);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('rank', s.rank, 'kind', s.kind, 'explanation', s.explanation,
           'jury', case when s.kind = 'diagnosis' then s.payload->'jury' end) order by s.rank), '[]'::jsonb)
    into steps from public.arc_case_steps s where s.case_id = p_case;
  return jsonb_build_object(
    'attempt', jsonb_build_object('pct', a.pct, 'dx_ok', a.dx_ok, 'detail', a.detail, 'at', a.created_at),
    'steps', steps, 'track', trk);
end $function$;

revoke execute on function public.arc_debrief(uuid) from public, anon;
grant execute on function public.arc_debrief(uuid) to authenticated;
