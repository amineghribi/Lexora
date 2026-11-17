-- Plan DCEM3 : 50 DT, valable jusqu'à la fin de juin. Ces 50 DT sont déduits du plan Résidanat « semester » (140 DT) si l'élève continue : 90 DT.
-- Les 50 DT ne se déduisent qu'une fois (access_grants.credited). Un montant passé explicitement (p_amount) n'applique aucune déduction automatique.
alter table public.access_grants add column if not exists credited boolean not null default false;
alter table public.access_grants drop constraint if exists access_grants_plan_check;
alter table public.access_grants add constraint access_grants_plan_check check (plan in ('month', 'semester', 'custom', 'founder', 'dcem3'));

drop function if exists public.grant_access(text, text, numeric, text, integer, text);
create or replace function public.grant_access(p_email text, p_plan text, p_amount numeric default null, p_note text default null, p_days integer default null, p_scope text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; cur_end timestamptz; s timestamptz; e timestamptz; amt numeric; ls timestamp; tz constant text := 'Africa/Tunis'; sc text;
        credit numeric := 0; moved boolean := false;
begin
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Aucun compte avec cet e-mail : %', p_email; end if;
  sc := coalesce(p_scope, case when p_plan = 'dcem3' then 'dcem3' else public.qb_track(u) end);
  if sc not in ('residanat', 'dcem3') then raise exception 'Périmètre inconnu : % (residanat ou dcem3)', sc; end if;
  if p_plan = 'dcem3' and sc <> 'dcem3' then raise exception 'Le plan dcem3 ne s''applique qu''au périmètre dcem3.'; end if;
  if sc = 'dcem3' and p_plan in ('month', 'semester') then raise exception 'Pour un élève DCEM3, utilise le plan dcem3 (50 DT jusqu''à fin juin) ou custom.'; end if;
  select max(ends_at) into cur_end from public.access_grants where user_id = u and ends_at > now() and scope = sc;
  s := greatest(now(), coalesce(cur_end, now()));
  if p_plan = 'month' then e := s + interval '30 days'; amt := 29;
  elsif p_plan = 'semester' then
    ls := s at time zone tz;
    if extract(month from ls) <= 6 then e := make_timestamp(extract(year from ls)::int, 7, 1, 0, 0, 0) at time zone tz;
    else e := make_timestamp(extract(year from ls)::int + 1, 1, 1, 0, 0, 0) at time zone tz; end if;
    amt := 140;
    if sc = 'residanat' and p_amount is null then
      select coalesce(sum(least(amount_dt, 50)), 0) into credit from public.access_grants where user_id = u and scope = 'dcem3' and plan = 'dcem3' and not credited and coalesce(amount_dt, 0) > 0;
      amt := amt - credit;
    end if;
  elsif p_plan = 'dcem3' then
    ls := s at time zone tz;
    if extract(month from ls) <= 6 then e := make_timestamp(extract(year from ls)::int, 7, 1, 0, 0, 0) at time zone tz;
    else e := make_timestamp(extract(year from ls)::int + 1, 7, 1, 0, 0, 0) at time zone tz; end if;
    amt := 50;
  elsif p_plan = 'custom' then
    if p_days is null or p_days <= 0 then raise exception 'Plan custom : indique un nombre de jours (5e paramètre).'; end if;
    e := s + p_days * interval '1 day'; amt := null;
  else raise exception 'Plan inconnu : % (month, semester, dcem3 ou custom)', p_plan; end if;
  amt := coalesce(p_amount, amt);
  insert into public.access_grants (user_id, plan, starts_at, ends_at, amount_dt, note, scope) values (u, p_plan, s, e, amt, p_note, sc);
  if credit > 0 then
    update public.access_grants set credited = true where user_id = u and scope = 'dcem3' and plan = 'dcem3' and not credited and coalesce(amount_dt, 0) > 0;
  end if;
  -- Un élève DCEM3 qui prend un abonnement Résidanat passe en Résidanat (seul l'administrateur peut le faire)
  if sc = 'residanat' and public.qb_track(u) = 'dcem3' then
    perform set_config('app.track_rpc', '1', true);
    update public.profiles set track = 'residanat' where id = u;
    moved := true;
  end if;
  return jsonb_build_object('email', lower(trim(p_email)), 'plan', p_plan, 'perimetre', sc, 'montant_dt', amt, 'deduction_dt', credit, 'passe_en_residanat', moved,
    'debut', to_char(s at time zone tz, 'DD/MM/YYYY HH24:MI'), 'fin', to_char((e - interval '1 second') at time zone tz, 'DD/MM/YYYY HH24:MI'));
end $$;
revoke all on function public.grant_access(text, text, numeric, text, integer, text) from public, anon, authenticated;
