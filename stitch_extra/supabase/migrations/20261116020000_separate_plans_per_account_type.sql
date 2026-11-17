-- Un accès payant ne vaut que pour le type de compte (scope) de l'élève ; 'founder' reste valable partout.
-- Déjà appliquée en production (nom : separate_plans_per_account_type). Fichier ajouté pour que le dépôt reflète la base.
create or replace function public.my_access()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare u uuid := auth.uid(); tr timestamptz; pu timestamptz; paid boolean; trk text;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  trk := public.qb_track(u);
  select greatest(created_at + interval '7 days', public.promo_end()) into tr from auth.users where id = u;
  select max(ends_at) into pu from public.access_grants where user_id = u and ends_at > now() and (scope = trk or plan = 'founder');
  select exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now() and (g.scope = trk or g.plan = 'founder')) into paid;
  return jsonb_build_object('status', case when paid then 'paid' when tr > now() then 'trial' else 'expired' end,
    'trial_ends_at', tr, 'paid_until', pu, 'now', now(), 'track', trk);
end $function$;

create or replace function public.qb_has_access(u uuid)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select now() < public.promo_end()
      or exists (select 1 from auth.users x where x.id = u and x.created_at + interval '7 days' > now())
      or exists (select 1 from public.access_grants g where g.user_id = u and g.starts_at <= now() and g.ends_at > now()
                 and (g.scope = public.qb_track(u) or g.plan = 'founder'))
$function$;

create or replace function public.qb_daily_limit_for(u uuid)
returns integer language sql stable security definer set search_path to ''
as $function$
  select case
    when exists (
      select 1 from public.access_grants g
      where g.user_id = u and g.starts_at <= now() and g.ends_at > now()
        and (g.scope = public.qb_track(u) or g.plan = 'founder')
    ) then public.qb_daily_limit()
    else 250
  end
$function$;

create or replace function public.referral_reward(p_referrer uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare ids bigint[]; s timestamptz; e timestamptz; gid bigint; trial_end timestamptz; sc text := public.qb_track(p_referrer);
begin
  perform pg_advisory_xact_lock(hashtext('referral:' || p_referrer::text));
  loop
    exit when (select count(distinct reward_grant_id) from public.referrals where referrer_id = p_referrer and reward_grant_id is not null) >= public.referral_max_rewards();
    select array_agg(id) into ids from (
      select id from public.referrals
      where referrer_id = p_referrer and qualified_at is not null and reward_grant_id is null
      order by qualified_at, id limit public.referral_needed()
    ) t;
    exit when ids is null or array_length(ids, 1) < public.referral_needed();
    select created_at + interval '7 days' into trial_end from auth.users where id = p_referrer;
    s := greatest(now(), coalesce((select max(ends_at) from public.access_grants where user_id = p_referrer and ends_at > now() and scope = sc), now()), coalesce(trial_end, now()));
    e := s + interval '30 days';
    insert into public.access_grants (user_id, plan, starts_at, ends_at, amount_dt, note, scope)
      values (p_referrer, 'custom', s, e, null, 'parrainage : 3 amis actifs', sc) returning id into gid;
    update public.referrals set reward_grant_id = gid where id = any(ids);
  end loop;
end $function$;
