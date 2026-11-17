-- Quota d'ouverture des cours PDF par compte (chantier 2). Appelée par la route /api/pdf avec le jeton de l'élève.
-- Retourne 'ok' ou 'denied'. Seuils : 25 cours distincts / 24 h, 300 signatures / 24 h, 30 signatures / 60 s, par compte.
-- Table fermée aux clients (RLS sans politique, aucun droit) ; seule la fonction (SECURITY DEFINER) y écrit.
create table if not exists public.pdf_opens (
  user_id uuid not null,
  course text not null,
  at timestamptz not null default now()
);
create index if not exists pdf_opens_user_at on public.pdf_opens (user_id, at desc);
alter table public.pdf_opens enable row level security;
revoke all on table public.pdf_opens from public, anon, authenticated;

create or replace function public.pdf_allow(p_course text) returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); n_all int; n_min int; n_dist int; known boolean;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_course is null or p_course !~ '^[0-9]{1,3}(_[0-9])?$' then raise exception 'BAD_REQUEST' using errcode = 'P0001'; end if;
  if exists (select 1 from auth.users x where x.id = u and x.banned_until is not null and x.banned_until > now()) then
    raise exception 'ACCOUNT_BLOCKED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('pdf:' || u::text));
  delete from public.pdf_opens where user_id = u and at < now() - interval '2 days';
  select count(*), count(*) filter (where at > now() - interval '60 seconds'),
         count(distinct course), coalesce(bool_or(course = p_course), false)
    into n_all, n_min, n_dist, known
    from public.pdf_opens where user_id = u and at > now() - interval '24 hours';
  if n_min >= 30 or n_all >= 300 or (not known and n_dist >= 25) then return 'denied'; end if;
  insert into public.pdf_opens (user_id, course) values (u, p_course);
  return 'ok';
end $$;
revoke all on function public.pdf_allow(text) from public, anon;
grant execute on function public.pdf_allow(text) to authenticated;
