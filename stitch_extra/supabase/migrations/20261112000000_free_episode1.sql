-- Épisode 1 des vidéos de balayage offert aux comptes en essai (non abonnés) ; le reste (épisodes 2+ et version intégrale) reste réservé aux abonnés.
-- Un compte expiré reste refusé (PAID_ONLY). Le cloisonnement DCEM3 est inchangé. /api/video ne signe que les vidéos renvoyées ici : l'épisode 1 suffit, rien à changer côté API.
create or replace function public.get_course_videos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid; dc boolean; st text;
begin
  perform public.qb_guard();
  u := public.qb_uid_basic();
  dc := public.qb_track(u) = 'dcem3';
  st := coalesce((public.my_access())->>'status', '');
  if st not in ('paid', 'trial') then raise exception 'PAID_ONLY' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('course', v.course, 'course_title', v.course_title, 'episode', v.episode, 'title', v.title,
      'duration_s', v.duration_s, 'url', v.url,
      'qids', coalesce((select jsonb_agg(q.qid order by q.rank) from public.course_video_qcm q where q.course = v.course and q.episode = v.episode), '[]'::jsonb))
      order by v.course, v.episode nulls last)
    from public.course_videos v
    where (not dc or v.course in (select sn from public.dcem3_courses))
      and (st = 'paid' or v.episode = 1)), '[]'::jsonb);
end $$;
