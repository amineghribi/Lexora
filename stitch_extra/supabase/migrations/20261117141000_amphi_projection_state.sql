-- Variante projection du mode amphi. APPLIQUÉE le 2026-11-17.
-- Ajoute le minuteur par étape et expose l'état de séance (code, étape, participants, votes).

alter table public.amphi_sessions add column if not exists step_started_at timestamptz not null default now();

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
  update public.amphi_sessions set step = p_step, step_started_at = now() where id = p_session;
end;
$$;

create or replace function public.amphi_state(p_session uuid)
returns table (code text, step text, status text, step_started_at timestamptz, participants bigint, votes bigint)
language sql security definer set search_path = public
as $$
  select s.code, s.step, s.status, s.step_started_at,
         (select count(distinct v.user_id) from public.amphi_votes v where v.session_id = s.id),
         (select count(*) from public.amphi_votes v where v.session_id = s.id)
    from public.amphi_sessions s where s.id = p_session;
$$;

revoke all on function public.amphi_state(uuid) from public, anon;
grant execute on function public.amphi_state(uuid) to authenticated;
revoke all on function public.amphi_advance(uuid,text) from public, anon;
grant execute on function public.amphi_advance(uuid,text) to authenticated;
