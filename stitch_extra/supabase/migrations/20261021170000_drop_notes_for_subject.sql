-- Le « Carnet de pièges » est supprimé : cette fonction renvoyait tous les pièges et mnémoniques d'un cours d'un seul coup.
-- Les pièges et mnémoniques restent affichés question par question, après la réponse (check_answers).
drop function if exists public.notes_for_subject(integer);
drop function if exists public.notes_for_subject(smallint);
drop function if exists public.notes_for_subject(bigint);
