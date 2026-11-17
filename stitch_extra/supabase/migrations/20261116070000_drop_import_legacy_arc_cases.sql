-- Fin de l'import ponctuel des cas de l'ancien ARC : la fonction créait des brouillons dans n'importe quelle spécialité.
drop function if exists public.import_legacy_arc_cases(jsonb);
