-- A2 (types de compte) : rôle d'un compte (élève par défaut, enseignant sur validation du propriétaire), SANS code d'app.
-- Le rôle n'est PAS dans profiles (lisible par tous, modifiable par son propriétaire) : table privée, aucun droit client.
-- Pas de ligne = élève. Aucun compte existant n'a de ligne : aucun changement de comportement.

create table if not exists public.account_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('teacher')),
  granted_at timestamptz not null default now()
);
create table if not exists public.teacher_specialties (
  user_id uuid not null references public.account_roles (user_id) on delete cascade,
  specialty text not null check (specialty ~ '^[a-z0-9_-]{2,40}$'),
  primary key (user_id, specialty)
);
alter table public.account_roles enable row level security;
alter table public.teacher_specialties enable row level security;
revoke all on public.account_roles, public.teacher_specialties from anon, authenticated;

-- Lire son propre rôle (seul accès client).
create or replace function public.my_role() returns jsonb
language plpgsql stable security definer set search_path = '' as $f$
declare u uuid := public.qb_uid_basic(); r text;
begin
  select role into r from public.account_roles where user_id = u;
  return jsonb_build_object('role', coalesce(r, 'student'),
    'specialties', case when r = 'teacher' then (select coalesce(jsonb_agg(specialty order by specialty), '[]'::jsonb) from public.teacher_specialties where user_id = u) else '[]'::jsonb end);
end $f$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated, service_role;

-- Donner / retirer le rôle enseignant : propriétaire seulement (comme grant_access : service_role, jamais le client).
create or replace function public.grant_teacher(p_email text, p_specialty text) returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare u uuid;
begin
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Aucun compte avec cet e-mail : %', p_email; end if;
  if p_specialty is null or p_specialty !~ '^[a-z0-9_-]{2,40}$' then raise exception 'Spécialité invalide : % (minuscules, chiffres, - et _, 2 à 40 caractères)', p_specialty; end if;
  insert into public.account_roles (user_id, role) values (u, 'teacher') on conflict (user_id) do nothing;
  insert into public.teacher_specialties (user_id, specialty) values (u, p_specialty) on conflict do nothing;
  return jsonb_build_object('email', lower(trim(p_email)), 'role', 'teacher',
    'specialties', (select jsonb_agg(specialty order by specialty) from public.teacher_specialties where user_id = u));
end $f$;
revoke all on function public.grant_teacher(text, text) from public, anon, authenticated;
grant execute on function public.grant_teacher(text, text) to service_role;

create or replace function public.revoke_teacher(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare u uuid; n int;
begin
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Aucun compte avec cet e-mail : %', p_email; end if;
  delete from public.account_roles where user_id = u;
  get diagnostics n = row_count;
  return jsonb_build_object('email', lower(trim(p_email)), 'role', 'student', 'retire', n > 0);
end $f$;
revoke all on function public.revoke_teacher(text) from public, anon, authenticated;
grant execute on function public.revoke_teacher(text) to service_role;
