-- Expose les constantes vitales du dossier patient à l'élève (RPC get_arc_case).
-- Seule addition : `vitals` (payload de l'étape « presentation »), pour que l'écran ARC affiche
-- la rangée PA / FC / FR / SpO2 / Température de la maquette. Aucune donnée modifiée.
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
    select coalesce(jsonb_agg(jsonb_build_object('rank', s.rank, 'kind', s.kind, 'payload', s.payload, 'answer_key', s.answer_key, 'explanation', s.explanation, 'vitals', case when s.kind = 'presentation' then s.payload->'vitals' end) order by s.rank), '[]'::jsonb)
      into steps from public.arc_case_steps s where s.case_id = p_id;
  else
    select coalesce(jsonb_agg(jsonb_build_object('rank', s.rank, 'kind', s.kind, 'text', case when s.kind = 'presentation' then s.payload->>'text' end, 'vitals', case when s.kind = 'presentation' then s.payload->'vitals' end) order by s.rank), '[]'::jsonb)
      into steps from public.arc_case_steps s where s.case_id = p_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', md.id, 'kind', md.kind, 'caption', md.caption, 'rank', md.rank, 'r2_key', md.r2_key) order by md.rank, md.id), '[]'::jsonb)
    into media from public.arc_case_media md where md.case_id = p_id;
  return jsonb_build_object('id', c.id, 'title', c.title, 'motif', c.motif, 'specialty', c.specialty_label, 'specialty_slug', c.specialty_slug,
    'track', c.track, 'faculty', c.faculty, 'level', c.level, 'version', c.version, 'status', case when mine then c.status end, 'mine', mine,
    'steps', steps, 'media', media);
end $function$;
