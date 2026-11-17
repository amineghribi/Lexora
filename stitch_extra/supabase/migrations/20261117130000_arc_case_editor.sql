-- Éditeur de cas ARC pas à pas. APPLIQUÉE le 2026-11-17.
-- Écrit dans arc_cases et arc_case_steps. Garde : rôle teacher ou admin.
create or replace function public.arc_case_save(
  p_id        uuid,
  p_title     text,
  p_motif     text,
  p_specialty text,
  p_track     text default 'residanat',
  p_level     text default null,
  p_status    text default 'draft',
  p_steps     jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role boolean;
  v_id uuid;
  v_track text;
  v_step jsonb;
  v_rank integer := 0;
begin
  select exists (select 1 from public.account_roles where user_id = auth.uid() and role in ('teacher','admin')) into v_role;
  if not coalesce(v_role, false) then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  v_track := case when p_track in ('dcem1','dcem2','dcem3s1','dcem3') then p_track else 'dcem3s1' end;
  if p_status not in ('draft','published','archived') then
    raise exception 'BAD_STATUS' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_title,''))) < 2 or length(btrim(coalesce(p_motif,''))) < 2 then
    raise exception 'TITLE_OR_MOTIF_TOO_SHORT' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.arc_cases (author_id, specialty_slug, track, motif, title, level, status, version)
    values (auth.uid(), coalesce(p_specialty,'general'), v_track, btrim(p_motif), btrim(p_title), p_level, p_status, 1)
    returning id into v_id;
  else
    update public.arc_cases
       set title = btrim(p_title), motif = btrim(p_motif),
           specialty_slug = coalesce(p_specialty, specialty_slug),
           track = v_track, level = p_level, status = p_status,
           version = version + 1, updated_at = now()
     where id = p_id and author_id = auth.uid()
    returning id into v_id;
    if v_id is null then
      raise exception 'CASE_NOT_FOUND_OR_NOT_OWNED' using errcode = '42501';
    end if;
    delete from public.arc_case_steps where case_id = v_id;
  end if;

  for v_step in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    if v_step->>'kind' not in ('presentation','history','exam','investigation','differential','diagnosis','questions') then
      raise exception 'BAD_STEP_KIND: %', v_step->>'kind' using errcode = '22023';
    end if;
    v_rank := v_rank + 1;
    insert into public.arc_case_steps (case_id, rank, kind, payload, answer_key, explanation)
    values (v_id, v_rank, v_step->>'kind',
      coalesce(v_step->'payload', jsonb_build_object('text', coalesce(v_step->>'text',''))),
      v_step->'answer_key', nullif(v_step->>'explanation',''));
  end loop;

  return v_id;
end;
$$;

revoke all on function public.arc_case_save(uuid,text,text,text,text,text,text,jsonb) from public;
revoke all on function public.arc_case_save(uuid,text,text,text,text,text,text,jsonb) from anon;
grant execute on function public.arc_case_save(uuid,text,text,text,text,text,text,jsonb) to authenticated;

create or replace function public.arc_cases_mine()
returns table (id uuid, title text, motif text, status text, track text, updated_at timestamptz, steps int)
language sql security definer set search_path = public
as $$
  select c.id, c.title, c.motif, c.status, c.track, c.updated_at,
         (select count(*)::int from public.arc_case_steps s where s.case_id = c.id)
    from public.arc_cases c where c.author_id = auth.uid() order by c.updated_at desc;
$$;

revoke all on function public.arc_cases_mine() from public;
revoke all on function public.arc_cases_mine() from anon;
grant execute on function public.arc_cases_mine() to authenticated;
