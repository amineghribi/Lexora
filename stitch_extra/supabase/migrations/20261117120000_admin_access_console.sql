-- Console d'administration — ouverture/fermeture d'accès. APPLIQUÉE le 2026-11-17.
-- Table réelle : access_grants (plan ∈ month|semester|custom|founder|dcem3,
-- scope ∈ residanat|dcem1|dcem2|dcem3s1|dcem3, ends_at > starts_at).
create or replace function public.admin_set_access(
  p_user  uuid,
  p_status text,
  p_until timestamptz default null,
  p_plan  text default 'month',
  p_scope text default 'residanat'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_rows integer;
begin
  select exists (select 1 from public.account_roles where user_id = auth.uid() and role = 'admin') into v_admin;
  if not coalesce(v_admin, false) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('paid', 'closed') then
    raise exception 'BAD_STATUS' using errcode = '22023';
  end if;

  if p_status = 'paid' then
    if p_until is null or p_until <= now() then
      raise exception 'BAD_UNTIL' using errcode = '22023';
    end if;
    if p_plan not in ('month', 'semester', 'custom', 'founder', 'dcem3') then
      raise exception 'BAD_PLAN' using errcode = '22023';
    end if;
    if p_scope not in ('residanat', 'dcem1', 'dcem2', 'dcem3s1', 'dcem3') then
      raise exception 'BAD_SCOPE' using errcode = '22023';
    end if;
    insert into public.access_grants (user_id, plan, starts_at, ends_at, scope, credited)
    values (p_user, p_plan, now(), p_until, p_scope, false);
    return jsonb_build_object('ok', true, 'action', 'opened', 'user', p_user, 'until', p_until, 'plan', p_plan, 'scope', p_scope);
  end if;

  update public.access_grants set ends_at = now()
   where user_id = p_user and ends_at > now();
  get diagnostics v_rows = row_count;
  return jsonb_build_object('ok', true, 'action', 'closed', 'user', p_user, 'closed_grants', v_rows);
end;
$$;

revoke all on function public.admin_set_access(uuid, text, timestamptz, text, text) from public;
revoke all on function public.admin_set_access(uuid, text, timestamptz, text, text) from anon;
grant execute on function public.admin_set_access(uuid, text, timestamptz, text, text) to authenticated;
