-- Cas d'ARC écrits par les enseignants, au format du simulateur (fusionnés dans les motifs au moment de servir l'ARC).
-- Le contenu (`data`) est validé côté serveur applicatif (api/_simcase.js) avant l'enregistrement ET avant la fusion ;
-- la base vérifie le rôle, la spécialité du motif, la taille et l'auteur.

-- 1. Spécialité de chaque motif du simulateur (même table que app/api/_arcfilter.js)
create table public.arc_motif_specialty (
  motif_id text primary key,
  specialty_slug text not null references public.specialty_map (slug)
);
insert into public.arc_motif_specialty (motif_id, specialty_slug) values
  ('douleur-thoracique', 'cardiologie'), ('dyspnee', 'pneumo-allergologie'), ('douleur-abdominale', 'chirurgie-generale'),
  ('fievre', 'maladies-infectieuses'), ('hemorragie-digestive', 'gastrologie'), ('adenopathie', 'hematologie'),
  ('hematurie', 'urologie'), ('oedemes', 'medecine-interne'), ('cephalee', 'neurologie-neurochirurgie'),
  ('coma_confusion', 'neurologie-neurochirurgie'), ('arthralgie', 'orthopedie-rhumatologie'), ('metrorragies', 'gynecologie');
alter table public.arc_motif_specialty enable row level security;
revoke all on public.arc_motif_specialty from anon, authenticated;

-- 2. Les cas
create table public.arc_sim_cases (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id),
  motif_id text not null references public.arc_motif_specialty (motif_id),
  title text not null check (length(btrim(title)) between 2 and 120),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 60000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index arc_sim_cases_motif_idx on public.arc_sim_cases (motif_id, status);
create index arc_sim_cases_author_idx on public.arc_sim_cases (author_id);
alter table public.arc_sim_cases enable row level security;
revoke all on public.arc_sim_cases from anon, authenticated;

-- 3. Enregistrer (créer ou modifier) un cas : enseignant, motif de sa spécialité, auteur seulement
create or replace function public.sim_case_save(p_id uuid, p_motif text, p_title text, p_data jsonb)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare u uuid := auth.uid(); sp text; r uuid;
begin
  if u is null or not public.is_teacher(u) then raise exception 'NOT_TEACHER'; end if;
  select specialty_slug into sp from public.arc_motif_specialty where motif_id = p_motif;
  if sp is null then raise exception 'BAD_MOTIF'; end if;
  if not (sp = any (public.my_specialties())) then raise exception 'NOT_YOUR_SPECIALTY'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) >= 60000 then raise exception 'BAD_DATA'; end if;
  if p_title is null or length(btrim(p_title)) not between 2 and 120 then raise exception 'BAD_TITLE'; end if;
  if p_id is null then
    insert into public.arc_sim_cases (author_id, motif_id, title, data) values (u, p_motif, btrim(p_title), p_data) returning id into r;
  else
    update public.arc_sim_cases set motif_id = p_motif, title = btrim(p_title), data = p_data, updated_at = now()
     where id = p_id and author_id = u and status <> 'archived' returning id into r;
    if r is null then raise exception 'NOT_FOUND'; end if;
  end if;
  return r;
end $function$;

-- 4. Publier / repasser en brouillon / archiver (auteur seulement)
create or replace function public.sim_case_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare u uuid := auth.uid(); n integer;
begin
  if u is null or not public.is_teacher(u) then raise exception 'NOT_TEACHER'; end if;
  if p_status not in ('draft', 'published', 'archived') then raise exception 'BAD_STATUS'; end if;
  update public.arc_sim_cases set status = p_status, updated_at = now() where id = p_id and author_id = u and status <> 'archived';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NOT_FOUND'; end if;
end $function$;

-- 5. Mes cas
create or replace function public.sim_cases_mine()
returns table (id uuid, motif_id text, title text, status text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path to ''
as $$ select c.id, c.motif_id, c.title, c.status, c.data, c.updated_at
      from public.arc_sim_cases c
      where c.author_id = auth.uid() and c.status <> 'archived' and public.is_teacher(auth.uid())
      order by c.updated_at desc $$;

-- 6. Cas à fusionner dans l'ARC pour la personne qui l'ouvre.
--   Enseignant : cas publiés de sa spécialité + ses propres cas (brouillons compris, marqués `draft`).
--   Élève abonné : cas publiés. Les autres : rien. L'ordre est stable (les indices de la banque en dépendent).
create or replace function public.sim_cases_for_arc()
returns table (id uuid, motif_id text, data jsonb, draft boolean)
language sql stable security definer set search_path to ''
as $$ select c.id, c.motif_id, c.data, (c.status <> 'published') as draft
      from public.arc_sim_cases c
      join public.arc_motif_specialty m on m.motif_id = c.motif_id
      where public.arc_access() and c.status <> 'archived' and (
        c.author_id = auth.uid()
        or (c.status = 'published' and (not public.is_teacher(auth.uid()) or m.specialty_slug = any (public.my_specialties()))))
      order by c.created_at, c.id $$;

revoke execute on function public.sim_case_save(uuid, text, text, jsonb), public.sim_case_status(uuid, text), public.sim_cases_mine(), public.sim_cases_for_arc() from public, anon;
grant execute on function public.sim_case_save(uuid, text, text, jsonb), public.sim_case_status(uuid, text), public.sim_cases_mine(), public.sim_cases_for_arc() to authenticated;
