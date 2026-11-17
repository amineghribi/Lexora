-- Vidéos de cours (une par épisode) + QCM suggérés par épisode. Réservé aux comptes payants via get_course_videos().
-- Les lignes (111 vidéos, 1116 liens épisode→QCM) ont été chargées séparément.
-- Aligné (chantier 4c) sur le texte réellement appliqué en base : duration_s et score acceptent le vide (nullable).
create table if not exists public.course_videos (
  id serial primary key,
  course int not null,
  course_title text not null,
  episode int,
  title text not null,
  duration_s int,
  url text not null
);
create unique index if not exists course_videos_ep_uq on public.course_videos (course, episode) where episode is not null;
create unique index if not exists course_videos_full_uq on public.course_videos (course) where episode is null;
alter table public.course_videos enable row level security;
revoke all on table public.course_videos from public, anon, authenticated;

create table if not exists public.course_video_qcm (
  course int not null,
  episode int not null,
  qid text not null,
  rank int not null,
  score numeric,
  primary key (course, episode, qid)
);
alter table public.course_video_qcm enable row level security;
revoke all on table public.course_video_qcm from public, anon, authenticated;

create or replace function public.get_course_videos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  perform public.qb_guard();
  u := public.qb_uid_basic();
  if coalesce((public.my_access())->>'status', '') <> 'paid' then
    raise exception 'PAID_ONLY' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'course', v.course, 'course_title', v.course_title, 'episode', v.episode, 'title', v.title,
      'duration_s', v.duration_s, 'url', v.url,
      'qids', coalesce((select jsonb_agg(q.qid order by q.rank) from public.course_video_qcm q
                        where q.course = v.course and q.episode = v.episode), '[]'::jsonb))
      order by v.course, v.episode nulls last)
    from public.course_videos v), '[]'::jsonb);
end $$;
revoke all on function public.get_course_videos() from public, anon;
grant execute on function public.get_course_videos() to authenticated;
