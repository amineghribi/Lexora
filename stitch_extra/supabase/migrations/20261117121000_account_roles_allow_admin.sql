-- Le rôle 'admin' n'existait pas : account_roles n'autorisait que 'teacher'.
-- APPLIQUÉE le 2026-11-17. N'attribue aucun rôle : la nomination d'un admin reste une décision.
alter table public.account_roles drop constraint if exists account_roles_role_check;
alter table public.account_roles
  add constraint account_roles_role_check check (role in ('teacher', 'admin'));
