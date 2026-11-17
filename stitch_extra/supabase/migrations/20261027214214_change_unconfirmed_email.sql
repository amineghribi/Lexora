create or replace function public.change_unconfirmed_email(p_old text, p_pw text, p_new text)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  u auth.users%rowtype;
  n text := lower(btrim(coalesce(p_new,'')));
  o text := lower(btrim(coalesce(p_old,'')));
begin
  if n !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(n) > 254 then return 'invalid_email'; end if;
  select * into u from auth.users where lower(email) = o;
  -- réponse identique si compte absent, déjà confirmé ou mot de passe faux (pas d'énumération)
  if not found or u.email_confirmed_at is not null or u.encrypted_password is null
     or u.encrypted_password <> crypt(coalesce(p_pw,''), u.encrypted_password) then
    perform pg_sleep(1);
    return 'denied';
  end if;
  if n = o then return 'same'; end if;
  if exists (select 1 from auth.users where lower(email) = n) then return 'taken'; end if;
  update auth.users set email = n, updated_at = now() where id = u.id;
  update auth.identities set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(n)), updated_at = now() where user_id = u.id and provider = 'email';
  return 'ok';
end $$;
revoke all on function public.change_unconfirmed_email(text,text,text) from public;
grant execute on function public.change_unconfirmed_email(text,text,text) to anon, authenticated;
