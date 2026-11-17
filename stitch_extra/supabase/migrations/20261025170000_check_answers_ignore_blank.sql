-- Une question n'est comptée comme « répondue » (user_answered, parrainages) que si l'élève a choisi au moins une proposition.
-- Avant : les questions laissées vides à la fin d'une série (c = '') étaient aussi insérées dans user_answered.
-- La correction renvoyée au client reste inchangée (les blancs sont toujours corrigés et affichés).
create or replace function public.check_answers(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.qb_uid_basic(); d date := public.qb_today(); res jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 150 then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as t(i text, c text)
    where not exists (select 1 from public.question_views v where v.user_id = u and v.day >= d - 1 and v.qid = t.i)
  ) then
    raise exception 'NOT_SERVED' using errcode = 'P0001';
  end if;
  insert into public.user_answered (user_id, qid)
  select distinct u, b.id from jsonb_to_recordset(p_items) as t(i text, c text) join public.qbank b on b.id = t.i
  where btrim(coalesce(t.c, '')) <> ''
  on conflict do nothing;
  select coalesce(jsonb_agg(jsonb_build_object('i', b.id, 'ok', public.qb_norm(t.c) = public.qb_norm(b.sec->>'c'), 'sec', b.sec)), '[]'::jsonb)
    into res
  from jsonb_to_recordset(p_items) as t(i text, c text) join public.qbank b on b.id = t.i;
  return res;
end $$;
revoke all on function public.check_answers(jsonb) from public, anon;
grant execute on function public.check_answers(jsonb) to authenticated;
