-- Mode amphi (séance en direct). APPLIQUÉE le 2026-11-17.
-- Tables verrouillées (RLS + revoke) ; accès uniquement via fonctions security definer.

create table if not exists public.amphi_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.arc_cases(id) on delete set null,
  step text not null default 'history',
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.amphi_votes (
  id bigint primary key generated always as identity,
  session_id uuid not null references public.amphi_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step text not null,
  choice text not null,
  created_at timestamptz not null default now(),
  unique (session_id, step, user_id)
);

alter table public.amphi_sessions enable row level security;
alter table public.amphi_votes enable row level security;
revoke all on public.amphi_sessions from anon, authenticated;
revoke all on public.amphi_votes from anon, authenticated;

create or replace function public.amphi_start(p_case uuid default null)
returns table (session_id uuid, code text)
language plpgsql security definer set search_path = public
as $$
declare v_ok boolean; v_code text; v_id uuid; i int := 0;
begin
  select exists (select 1 from public.account_roles where user_id = auth.uid() and role in ('teacher','admin')) into v_ok;
  if not coalesce(v_ok,false) then raise exception 'TEACHER_REQUIRED' using errcode='42501'; end if;
  loop
    v_code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from public.amphi_sessions s where s.code = v_code);
    i := i + 1;
    if i > 20 then raise exception 'CODE_GENERATION_FAILED'; end if;
  end loop;
  insert into public.amphi_sessions (code, host_id, case_id) values (v_code, auth.uid(), p_case) returning id into v_id;
  return query select v_id, v_code;
end;
$$;

create or replace function public.amphi_join(p_code text)
returns table (session_id uuid, step text, status text)
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_step text; v_status text;
begin
  select s.id, s.step, s.status into v_id, v_step, v_status
    from public.amphi_sessions s where s.code = upper(btrim(p_code)) and s.status = 'open';
  if v_id is null then raise exception 'SESSION_NOT_FOUND' using errcode='22023'; end if;
  return query select v_id, v_step, v_status;
end;
$$;

create or replace function public.amphi_vote(p_session uuid, p_step text, p_choice text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_open boolean;
begin
  select exists (select 1 from public.amphi_sessions s where s.id = p_session and s.status = 'open') into v_open;
  if not coalesce(v_open,false) then raise exception 'SESSION_CLOSED' using errcode='22023'; end if;
  if length(btrim(coalesce(p_choice,''))) = 0 then raise exception 'EMPTY_CHOICE' using errcode='22023'; end if;
  insert into public.amphi_votes (session_id, user_id, step, choice)
  values (p_session, auth.uid(), p_step, btrim(p_choice))
  on conflict (session_id, step, user_id) do update set choice = excluded.choice, created_at = now();
end;
$$;

create or replace function public.amphi_advance(p_session uuid, p_step text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_host uuid; v_ok boolean;
begin
  select host_id into v_host from public.amphi_sessions where id = p_session;
  select exists (select 1 from public.account_roles where user_id = auth.uid() and role in ('teacher','admin')) into v_ok;
  if v_host is null then raise exception 'SESSION_NOT_FOUND' using errcode='22023'; end if;
  if auth.uid() <> v_host and not coalesce(v_ok,false) then raise exception 'HOST_REQUIRED' using errcode='42501'; end if;
  if p_step not in ('history','exam','investigation','differential','prescription','diagnosis','score') then
    raise exception 'BAD_STEP' using errcode='22023';
  end if;
  update public.amphi_sessions set step = p_step where id = p_session;
end;
$$;

create or replace function public.amphi_results(p_session uuid, p_step text default null)
returns table (step text, choice text, votes bigint)
language sql security definer set search_path = public
as $$
  select v.step, v.choice, count(*)::bigint
    from public.amphi_votes v
   where v.session_id = p_session and (p_step is null or v.step = p_step)
   group by v.step, v.choice
   order by v.step, count(*) desc;
$$;

revoke all on function public.amphi_start(uuid) from public, anon;
revoke all on function public.amphi_join(text) from public, anon;
revoke all on function public.amphi_vote(uuid,text,text) from public, anon;
revoke all on function public.amphi_advance(uuid,text) from public, anon;
revoke all on function public.amphi_results(uuid,text) from public, anon;
grant execute on function public.amphi_start(uuid) to authenticated;
grant execute on function public.amphi_join(text) to authenticated;
grant execute on function public.amphi_vote(uuid,text,text) to authenticated;
grant execute on function public.amphi_advance(uuid,text) to authenticated;
grant execute on function public.amphi_results(uuid,text) to authenticated;
