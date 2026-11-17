-- Un compte banni (auth.users.banned_until) ne peut plus appeler les fonctions de la banque, même avec un jeton encore valide.
create or replace function public.qb_uid_basic()
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare u uuid := auth.uid();
begin
  if u is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if exists (select 1 from auth.users where id = u and banned_until is not null and banned_until > now()) then
    raise exception 'ACCOUNT_BLOCKED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = u and email_confirmed_at is not null) then
    raise exception 'EMAIL_NOT_CONFIRMED' using errcode = 'P0001';
  end if;
  return u;
end $function$;
