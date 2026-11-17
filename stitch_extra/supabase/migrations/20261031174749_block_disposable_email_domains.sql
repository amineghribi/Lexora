-- Bloque l'inscription avec des adresses e-mail jetables (liste modifiable dans public.blocked_email_domains).
create table if not exists public.blocked_email_domains (
  domain text primary key,
  added_at timestamptz not null default now()
);
alter table public.blocked_email_domains enable row level security;
-- aucune policy : seule la base (rôles privilégiés / SECURITY DEFINER) y accède.

insert into public.blocked_email_domains (domain) values
 ('mailinator.com'),('moblha.com'),
 ('guerrillamail.com'),('guerrillamail.net'),('guerrillamail.org'),('guerrillamail.biz'),('guerrillamail.de'),('guerrillamailblock.com'),('sharklasers.com'),('grr.la'),('pokemail.net'),('spam4.me'),
 ('10minutemail.com'),('10minutemail.net'),('20minutemail.com'),
 ('temp-mail.org'),('temp-mail.io'),('tempmail.com'),('tempmail.net'),('tempmailo.com'),('tempmail.dev'),('tempail.com'),('tmpmail.org'),('tmpmail.net'),
 ('yopmail.com'),('yopmail.fr'),('yopmail.net'),
 ('trashmail.com'),('trashmail.net'),('trashmail.de'),
 ('throwawaymail.com'),('getnada.com'),('nada.email'),('maildrop.cc'),('mailnesia.com'),('dispostable.com'),
 ('fakeinbox.com'),('mohmal.com'),('emailondeck.com'),('mintemail.com'),('spamgourmet.com'),('mailcatcher.me'),
 ('discard.email'),('burnermail.io'),('dropmail.me'),('mail.tm'),('inboxkitten.com'),('getairmail.com'),('moakt.com'),('anonbox.net'),
 ('mytemp.email'),('tempr.email'),('emailfake.com'),('fakemail.net'),('mailpoof.com'),('mailforspam.com'),('harakirimail.com'),('33mail.com'),
 ('byom.de'),('cuvox.de'),('einrot.com'),('fleckens.hu'),('gustr.com'),('jourrapide.com'),('rhyta.com'),('superrito.com'),('teleworm.us'),('armyspy.com'),('dayrep.com')
on conflict (domain) do nothing;

create or replace function public.block_disposable_email()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare d text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  if d <> '' and exists (
    select 1 from public.blocked_email_domains b
    where d = b.domain or d like '%.' || b.domain
  ) then
    raise exception 'DISPOSABLE_EMAIL_BLOCKED' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists block_disposable_email_trg on auth.users;
create trigger block_disposable_email_trg
  before insert on auth.users
  for each row execute function public.block_disposable_email();
