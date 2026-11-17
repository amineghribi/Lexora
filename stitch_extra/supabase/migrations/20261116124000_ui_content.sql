-- Contenus d'écran éditables (citation de pied de page, valeurs de démonstration de l'accueil).
--
-- Pourquoi une table : la maquette Stitch fixe des textes et des chiffres qui ne doivent pas être
-- codés en dur dans le bundle. `ui_content` les porte, par clé d'écran, et permet de les changer
-- sans redéploiement.
--
-- Avertissement à garder en tête : `accueil.demo_kpis` remplace les chiffres réels de l'élève
-- (volume, précision, dossiers ARC, constance, objectif quotidien) par ceux de la maquette.
-- C'est prévu pour une démonstration ou une capture ; pour un compte réel, mettre `enabled = false`
-- sur la ligne `accueil` (ou la supprimer) et l'écran reprend les données de l'élève.
--
-- Lecture : tout compte connecté, lignes `enabled`. Écriture : service_role uniquement.

create table public.ui_content (
  key text primary key check (key ~ '^[a-z0-9._-]{2,60}$'),
  value jsonb not null check (jsonb_typeof(value) = 'object' and pg_column_size(value) < 20000),
  enabled boolean not null default true,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.ui_content enable row level security;

create policy ui_content_select_enabled on public.ui_content
  for select to authenticated using (enabled);

revoke all on public.ui_content from anon, authenticated;
grant select on public.ui_content to authenticated;

-- Lecture d'une clé (null si absente ou désactivée) : le client garde un repli local.
create or replace function public.ui_content(p_key text)
returns jsonb language sql stable security definer set search_path to ''
as $function$
  select case when c.enabled then c.value else null end
  from public.ui_content c
  where c.key = p_key and public.qb_uid_basic() is not null
$function$;

-- Toutes les clés actives, en un appel (le client en a besoin pour plusieurs écrans).
create or replace function public.ui_content_all()
returns jsonb language sql stable security definer set search_path to ''
as $function$
  select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb)
  from public.ui_content c
  where c.enabled and public.qb_uid_basic() is not null
$function$;

-- Écriture (équipe) : crée ou remplace une clé, active ou désactive.
create or replace function public.ui_content_set(p_key text, p_value jsonb, p_enabled boolean default true, p_note text default null)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if p_key is null or p_key !~ '^[a-z0-9._-]{2,60}$' then raise exception 'BAD_KEY' using errcode = 'P0001'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then raise exception 'BAD_VALUE' using errcode = 'P0001'; end if;
  insert into public.ui_content as c (key, value, enabled, note, updated_at)
  values (p_key, p_value, coalesce(p_enabled, true), p_note, now())
  on conflict (key) do update set value = excluded.value, enabled = excluded.enabled, note = excluded.note, updated_at = now();
end $function$;

revoke execute on function public.ui_content(text) from public, anon;
grant execute on function public.ui_content(text) to authenticated, service_role;
revoke execute on function public.ui_content_all() from public, anon;
grant execute on function public.ui_content_all() to authenticated, service_role;
revoke execute on function public.ui_content_set(text, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.ui_content_set(text, jsonb, boolean, text) to service_role;

comment on table public.ui_content is 'Textes et valeurs d''écran éditables (citation, démonstration accueil).';
comment on column public.ui_content.enabled is 'false = la clé est ignorée par le client (retour aux données réelles).';

-- Graine : valeurs exactes de la maquette Accueil (démonstration).
insert into public.ui_content (key, value, enabled, note) values (
  'accueil',
  jsonb_build_object(
    'demo_kpis', jsonb_build_object(
      'week', 420, 'week_delta', 12,
      'accuracy', 74.2,
      'arc', 3, 'arc_avg', 81,
      'streak', 9,
      'daily_answered', 38, 'daily_target', 50,
      'serie_done', 15, 'serie_target', 40,
      'due', 24,
      'exam_slot', 'Samedi • 09:00', 'exam_candidates', 184, 'exam_session', 14,
      'fiches', 180, 'forum_new', 14,
      'specialties', jsonb_build_array(
        jsonb_build_object('sp', 'Cardiologie', 'covered', 88),
        jsonb_build_object('sp', 'Pédiatrie', 'covered', 54)
      )
    ),
    'trend', jsonb_build_array(9, 6, 3, 12, 8, 14, 5),
    'quote', jsonb_build_object(
      'text', 'La rigueur de l''examen réside non pas dans la mémorisation brute, mais dans l''aptitude à hiérarchiser une urgence diagnostique en moins de quarante secondes.',
      'author', 'Pr. M. Ben Salem',
      'role', 'Comité Pédagogique du Résidanat de Médecine'
    ),
    'recommendation', jsonb_build_object('label', 'Choc septique 2024')
  ),
  true,
  'Valeurs et citation de la maquette Stitch (démonstration). Passer enabled à false pour les données réelles.'
)
on conflict (key) do nothing;
