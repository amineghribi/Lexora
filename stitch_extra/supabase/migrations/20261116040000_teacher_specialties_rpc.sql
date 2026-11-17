-- L'espace enseignant lisait teacher_specialties en direct : « permission denied » (aucun droit pour authenticated sur cette table).
-- Fonction dédiée : l'enseignant reçoit ses spécialités (slug + libellé), les autres comptes reçoivent une liste vide.
create or replace function public.my_teacher_specialties()
returns jsonb language sql stable security definer set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', m.slug, 'label', m.label) order by m.sort_order, m.label), '[]'::jsonb)
  from public.specialty_map m
  where public.is_teacher() and m.slug = any (public.my_specialties())
$$;
revoke execute on function public.my_teacher_specialties() from public, anon;
grant execute on function public.my_teacher_specialties() to authenticated;

-- Durcissement : les nouvelles tables avaient reçu les droits par défaut de Supabase (dont TRUNCATE, que la RLS ne filtre pas).
-- specialty_map : lecture seule ; tables ARC : plus de TRUNCATE / REFERENCES / TRIGGER (les écritures restent filtrées par la RLS et les RPC).
revoke all on public.specialty_map from authenticated;
grant select on public.specialty_map to authenticated;
revoke truncate, references, trigger on public.arc_cases, public.arc_case_steps, public.arc_case_media from authenticated;
