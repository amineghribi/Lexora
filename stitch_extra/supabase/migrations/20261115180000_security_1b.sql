-- Chantier 1b (sécurité) : durcissement de public.mb_ins (import de questions).
-- Le corps ne change pas : il qualifie déjà public.qbank. On fixe seulement le search_path
-- et on retire EXECUTE à public/anon/authenticated (ils n'ont de toute façon ni insert ni select sur qbank).
-- postgres et service_role gardent leurs droits : les imports de séries ne sont pas touchés.
-- pg_net (extension dans public) : volontairement NON déplacée, voir docs/ARCHITECTURE.md (chantier 5d).
alter function public.mb_ins(jsonb) set search_path = public, pg_temp;
revoke execute on function public.mb_ins(jsonb) from public, anon, authenticated;
