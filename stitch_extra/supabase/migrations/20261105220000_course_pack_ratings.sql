-- Notes (1 à 5 étoiles) des pages de révision des cours. Additif : aucune table existante modifiée, aucune notification.
create table if not exists public.course_pack_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  course int not null check (course between 1 and 200),
  kind text not null check (kind in ('fiche','cartes','concept','memo','lecon')),
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, course, kind)
);
alter table public.course_pack_ratings enable row level security;
revoke all on table public.course_pack_ratings from public, anon, authenticated;

create or replace function public.rate_course_pack(p_course int, p_kind text, p_stars int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  perform public.qb_guard();
  u := public.qb_uid_basic();
  if p_course is null or p_course < 1 or p_course > 200 or p_kind not in ('fiche','cartes','concept','memo','lecon')
     or p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  if (select count(*) from public.course_pack_ratings where user_id = u and updated_at > now() - interval '1 day') >= 60 then
    raise exception 'TOO_MANY' using errcode = 'P0001';
  end if;
  insert into public.course_pack_ratings (user_id, course, kind, stars)
  values (u, p_course, p_kind, p_stars)
  on conflict (user_id, course, kind) do update set stars = excluded.stars, updated_at = now();
  return jsonb_build_object('status', 'ok');
end $$;
revoke all on function public.rate_course_pack(int, text, int) from public, anon;
grant execute on function public.rate_course_pack(int, text, int) to authenticated;

create or replace function public.course_pack_ratings_summary()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  perform public.qb_guard();
  u := public.qb_uid_basic();
  return coalesce((
    select jsonb_agg(jsonb_build_object('course', course, 'kind', kind, 'n', n, 'avg', avg, 'mine', mine))
    from (
      select course, kind, count(*)::int n, round(avg(stars)::numeric, 1) avg,
             max(stars) filter (where user_id = u) mine
      from public.course_pack_ratings group by course, kind
    ) s), '[]'::jsonb);
end $$;
revoke all on function public.course_pack_ratings_summary() from public, anon;
grant execute on function public.course_pack_ratings_summary() to authenticated;
