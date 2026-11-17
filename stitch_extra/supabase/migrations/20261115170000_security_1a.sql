-- Chantier 1a (sécurité) :
--  1. rate limit sur change_unconfirmed_email (appelée AVANT connexion : on ne peut pas la révoquer)
--  2. retrait des droits EXECUTE inutiles sur la fonction de trigger profiles_guard_track
-- canon_map reste ouverte à anon : loadIndex() l'appelle avant connexion (App.jsx).

-- 1. Journal des échecs. Aucune policy + aucun droit client : seule la fonction SECURITY DEFINER y accède.
create table if not exists public.email_change_attempts (
  k  text        not null,               -- 'h:<sha256(email)>' ou 'g' (global) ; jamais l'email en clair
  at timestamptz not null default now()
);
create index if not exists email_change_attempts_k_at_idx on public.email_change_attempts (k, at);
create index if not exists email_change_attempts_at_idx   on public.email_change_attempts (at);
alter table public.email_change_attempts enable row level security;
revoke all on public.email_change_attempts from public, anon, authenticated;

-- 2. Même corps qu'avant + garde en entrée (avant pg_sleep) + journalisation des échecs.
create or replace function public.change_unconfirmed_email(p_old text, p_pw text, p_new text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  u auth.users%rowtype;
  n text := lower(btrim(coalesce(p_new,'')));
  o text := lower(btrim(coalesce(p_old,'')));
  hk text := 'h:' || encode(extensions.digest(lower(btrim(coalesce(p_old,''))), 'sha256'), 'hex');
begin
  if n !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(n) > 254 then return 'invalid_email'; end if;
  -- rate limit : 5 échecs / 15 min par email, 60 échecs / min au total. Réponse immédiate, identique à un échec.
  if (select count(*) from public.email_change_attempts where k = hk and at > now() - interval '15 minutes') >= 5
     or (select count(*) from public.email_change_attempts where k = 'g' and at > now() - interval '1 minute') >= 60 then
    return 'denied';
  end if;
  select * into u from auth.users where lower(email) = o;
  -- réponse identique si compte absent, déjà confirmé ou mot de passe faux (pas d'énumération)
  if not found or u.email_confirmed_at is not null or u.encrypted_password is null
     or u.encrypted_password <> crypt(coalesce(p_pw,''), u.encrypted_password) then
    insert into public.email_change_attempts (k) values (hk), ('g');
    delete from public.email_change_attempts where at < now() - interval '1 hour';
    perform pg_sleep(1);
    return 'denied';
  end if;
  if n = o then return 'same'; end if;
  if exists (select 1 from auth.users where lower(email) = n) then return 'taken'; end if;
  update auth.users set email = n, updated_at = now() where id = u.id;
  update auth.identities set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(n)), updated_at = now() where user_id = u.id and provider = 'email';
  return 'ok';
end $function$;

-- 3. Fonction de trigger : le droit EXECUTE n'est pas vérifié au déclenchement, personne ne doit pouvoir l'appeler en RPC.
revoke execute on function public.profiles_guard_track() from public, anon, authenticated;
