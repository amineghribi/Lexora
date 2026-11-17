-- promo_end() existait en base sans migration dans le dépôt (utilisée par my_access et d'autres fonctions).
-- Définition reprise telle quelle de la base : fin de la période d'essai commune, 26/12/2026 00:00 (Tunis).
create or replace function public.promo_end() returns timestamptz
language sql immutable set search_path = ''
as $$ select (timestamp '2026-12-26 00:00:00') at time zone 'Africa/Tunis' $$;
