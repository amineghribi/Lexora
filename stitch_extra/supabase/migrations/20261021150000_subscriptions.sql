-- Abonnements : essai gratuit de 7 jours après la création du compte, puis accès payant géré manuellement (Flouci).
--   29 DT / mois (30 jours)  ·  140 DT / semestre (S1 : 1er janvier → 30 juin, S2 : 1er juillet → 31 décembre)
-- L'accès est contrôlé côté serveur, dans qb_uid() (donc dans toutes les fonctions qui servent des questions).
-- À exécuter UNE fois dans le SQL Editor de Supabase. Additif : ne supprime aucune donnée.

create table if not exists public.access_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('month', 'semester', 'custom', 'founder')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  amount_dt numeric(8,2),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists access_grants_user_idx on public.access_grants (user_id, ends_at desc);
alter table public.access_grants enable row level security;
revoke all on table public.access_grants from public, anon, authenticated;

-- Comptes fondateurs (les tiens) : accès permanent. Les autres comptes suivent la règle normale (7 jours d'essai).
insert into public.access_grants (user_id, plan, starts_at, ends_at, amount_dt, note)
select u.id, 'founder', now(), timestamptz '2036-01-01 00:00:00+01', null, 'compte fondateur'
from auth.users u
where u.id in ('6ce530e4-5472-4dea-bab0-e3c77e6287e5', 'ee26059e-c2d0-402d-8d0d-76d9e809dd68', '6df94464-2e1d-4ee0-9663-b9cfc11c8675')
  and not exists (select 1 from public.access_grants g where g.user_id = u.id);

-- Accès valide : essai de 7 jours depuis la création du compte, ou abonnement en cours
create or replace function public.qb_has_access(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users x where x.id = u and x.created_at + interval '7 days' > now())
      or exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now())
$$;
revoke all on function public.qb_has_access(uuid) from public, anon, authenticated;

-- Utilisateur connecté avec e-mail confirmé, sans contrôle d'abonnement (sert à enregistrer les réponses d'une série déjà servie)
create or replace function public.qb_uid_basic() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = u and email_confirmed_at is not null) then
    raise exception 'EMAIL_NOT_CONFIRMED' using errcode = 'P0001';
  end if;
  return u;
end $$;
revoke all on function public.qb_uid_basic() from public, anon, authenticated;

-- Utilisateur autorisé à recevoir des questions : connecté, e-mail confirmé, essai ou abonnement actif
create or replace function public.qb_uid() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public.qb_uid_basic();
begin
  if not public.qb_has_access(u) then
    raise exception 'ACCESS_EXPIRED' using errcode = 'P0001';
  end if;
  return u;
end $$;
revoke all on function public.qb_uid() from public, anon, authenticated;

-- La correction d'une série déjà servie reste possible même si l'accès se termine pendant la série
create or replace function public.check_answers(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid_basic(); d date := public.qb_today(); res jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 150 then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as t(i text, c text)
    where not exists (select 1 from public.question_views v where v.user_id = u and v.day >= d - 1 and v.qid = t.i)
  ) then
    raise exception 'NOT_SERVED' using errcode = 'P0001';
  end if;
  insert into public.user_answered (user_id, qid)
  select distinct u, b.id from jsonb_to_recordset(p_items) as t(i text, c text) join public.qbank b on b.id = t.i
  on conflict do nothing;
  select coalesce(jsonb_agg(jsonb_build_object('i', b.id, 'ok', public.qb_norm(t.c) = public.qb_norm(b.sec->>'c'), 'sec', b.sec)), '[]'::jsonb)
    into res
  from jsonb_to_recordset(p_items) as t(i text, c text) join public.qbank b on b.id = t.i;
  return res;
end $$;
revoke all on function public.check_answers(jsonb) from public, anon;
grant execute on function public.check_answers(jsonb) to authenticated;

-- Statut d'accès de l'élève connecté (utilisable même quand l'accès est terminé, pour afficher la page d'abonnement)
create or replace function public.my_access() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); tr timestamptz; pu timestamptz; paid boolean;
begin
  if u is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  select created_at + interval '7 days' into tr from auth.users where id = u;
  select max(ends_at) into pu from public.access_grants where user_id = u and ends_at > now();
  select exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now()) into paid;
  return jsonb_build_object(
    'status', case when paid then 'paid' when tr > now() then 'trial' else 'expired' end,
    'trial_ends_at', tr,
    'paid_until', pu,
    'now', now()
  );
end $$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- Donner l'accès après un paiement (à lancer depuis le SQL Editor uniquement : non exécutable par les élèves)
--   select public.grant_access('eleve@mail.com', 'month');                  -- 30 jours, 29 DT
--   select public.grant_access('eleve@mail.com', 'semester');               -- jusqu'à la fin du semestre, 140 DT
--   select public.grant_access('eleve@mail.com', 'custom', 0, 'geste commercial', 10);   -- 10 jours
-- Si l'élève a déjà un accès actif, la nouvelle période commence à la fin de l'accès actuel.
create or replace function public.grant_access(p_email text, p_plan text, p_amount numeric default null, p_note text default null, p_days int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid; cur_end timestamptz; s timestamptz; e timestamptz; amt numeric; ls timestamp; tz constant text := 'Africa/Tunis';
begin
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then
    raise exception 'Aucun compte avec cet e-mail : %', p_email;
  end if;
  select max(ends_at) into cur_end from public.access_grants where user_id = u and ends_at > now();
  s := greatest(now(), coalesce(cur_end, now()));
  if p_plan = 'month' then
    e := s + interval '30 days'; amt := 29;
  elsif p_plan = 'semester' then
    ls := s at time zone tz;
    if extract(month from ls) <= 6 then
      e := make_timestamp(extract(year from ls)::int, 7, 1, 0, 0, 0) at time zone tz;
    else
      e := make_timestamp(extract(year from ls)::int + 1, 1, 1, 0, 0, 0) at time zone tz;
    end if;
    amt := 140;
  elsif p_plan = 'custom' then
    if p_days is null or p_days <= 0 then
      raise exception 'Plan custom : indique un nombre de jours (5e paramètre).';
    end if;
    e := s + p_days * interval '1 day'; amt := null;
  else
    raise exception 'Plan inconnu : % (month, semester ou custom)', p_plan;
  end if;
  amt := coalesce(p_amount, amt);
  insert into public.access_grants (user_id, plan, starts_at, ends_at, amount_dt, note) values (u, p_plan, s, e, amt, p_note);
  return jsonb_build_object(
    'email', lower(trim(p_email)), 'plan', p_plan, 'montant_dt', amt,
    'debut', to_char(s at time zone tz, 'DD/MM/YYYY HH24:MI'),
    'fin', to_char((e - interval '1 second') at time zone tz, 'DD/MM/YYYY HH24:MI')
  );
end $$;
revoke all on function public.grant_access(text, text, numeric, text, int) from public, anon, authenticated;
