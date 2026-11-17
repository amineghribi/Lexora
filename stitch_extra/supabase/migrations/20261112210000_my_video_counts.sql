-- Compteur visible par l'élève : combien de fois il a lancé / terminé chaque épisode d'un cours.
-- Lecture réservée à ses propres lignes (la table video_plays n'a toujours aucune lecture directe côté élève).
create or replace function public.my_video_counts(p_course int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('episode', episode, 'plays', plays, 'ends', ends)), '[]'::jsonb)
  from (
    select episode,
           count(*) filter (where kind = 'play') as plays,
           count(*) filter (where kind = 'end') as ends
    from public.video_plays
    where user_id = auth.uid() and course = p_course
    group by episode
  ) t
$$;
revoke all on function public.my_video_counts(int) from public, anon;
grant execute on function public.my_video_counts(int) to authenticated;
