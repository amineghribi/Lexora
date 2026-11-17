-- RATTRAPAGE (chantier 5a) : cette migration est DÉJÀ APPLIQUÉE en base (le 2026-11-04, par execute_sql, donc absente de
-- supabase_migrations.schema_migrations). NE PAS L'APPLIQUER DE NOUVEAU. Voir docs/MIGRATIONS.md.
-- Le texte de qb_guard() ci-dessous est celui de la base le 2026-11-15 (comparé à la PR #29 : identique) ; droits EXECUTE : postgres et service_role seulement.
-- Les corps de qb_serve() et check_answers() qui figuraient dans la PR #29 ne sont pas repris : ils ont changé depuis
-- (qb_serve : 20261111240000_serve_rate_limit.sql ; check_answers : statistiques de choix de 20261106200000_choice_stats.sql, texte courant en base).
-- Garde anti-scraping, appelée au début de qb_serve et check_answers.
-- Bloque les clients non-navigateur (python-requests, curl, etc.) et les IP de public.blocked_ips.
-- Ne limite PAS la vitesse : les lots de 100 à 980 questions servies en une minute sont normaux dans l'app.
-- Contexte : 03/11/2026, 6 comptes jetables (emailkeep.com, en2ch.com) ont aspiré ~1190 questions
-- via python-requests en 35 minutes. Les comptes, domaines et IP ont été bannis à la main.

create or replace function public.qb_guard()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  h json;
  v_ua text;
  v_xff text;
  v_ip inet;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  if h is null then
    return;
  end if;

  v_ua := lower(coalesce(h->>'user-agent', ''));
  if v_ua ~ '(python-requests|python-urllib|aiohttp|httpx|curl/|wget/|go-http-client|scrapy|node-fetch|axios/|libwww|postmanruntime|insomnia|headlesschrome)' then
    raise exception 'ACCOUNT_BLOCKED' using errcode = 'P0001';
  end if;

  v_xff := split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1);
  begin
    v_ip := nullif(btrim(v_xff), '')::inet;
  exception when others then
    v_ip := null;
  end;
  if v_ip is not null and exists (select 1 from public.blocked_ips b where b.ip = v_ip) then
    raise exception 'ACCOUNT_BLOCKED' using errcode = 'P0001';
  end if;
end $function$;

revoke all on function public.qb_guard() from public, anon, authenticated;
