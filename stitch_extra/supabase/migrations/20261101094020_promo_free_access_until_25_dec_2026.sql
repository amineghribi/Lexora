-- Accès offert à tous (anciens et nouveaux comptes) jusqu'au 25 décembre 2026 inclus (heure de Tunis).
-- Pour changer la date ou arrêter l'offre : modifier/supprimer public.promo_end().
create or replace function public.promo_end() returns timestamptz
language sql immutable set search_path = ''
as $$ select (timestamp '2026-12-26 00:00:00') at time zone 'Africa/Tunis' $$;

create or replace function public.qb_has_access(u uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select now() < public.promo_end()
      or exists (select 1 from auth.users x where x.id = u and x.created_at + interval '7 days' > now())
      or exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now())
$$;

create or replace function public.my_access() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := auth.uid(); tr timestamptz; pu timestamptz; paid boolean;
begin
  if u is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  select greatest(created_at + interval '7 days', public.promo_end()) into tr from auth.users where id = u;
  select max(ends_at) into pu from public.access_grants where user_id = u and ends_at > now();
  select exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now()) into paid;
  return jsonb_build_object(
    'status', case when paid then 'paid' when tr > now() then 'trial' else 'expired' end,
    'trial_ends_at', tr,
    'paid_until', pu,
    'now', now()
  );
end $$;
