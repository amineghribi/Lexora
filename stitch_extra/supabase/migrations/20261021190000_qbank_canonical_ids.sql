-- Une question = un identifiant. Les copies d'une même question (même énoncé, mêmes propositions, même clé, même cours)
-- pointent vers une question canonique (colonne canon). Les copies deviennent non jouables (p = false) mais restent en base.
alter table public.qbank add column if not exists canon text;

with n as (
  select id, sn, p, f, sec, public.qb_norm(sec->>'c') k,
    translate(regexp_replace(translate(lower(coalesce(pub->>'q','') || '|' || coalesce((select string_agg(value, '|' order by key) from jsonb_each_text(coalesce(pub->'o','{}'::jsonb))),'')),
      'àâäáãçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaceeeeiiiinooooouuuuyyoa'), '[^a-z0-9]+', '', 'g'), 'l1', 'ii') t
  from public.qbank),
ok as (select md5(t) h from n group by md5(t), t having length(t) >= 60 and count(*) > 1 and count(distinct k) = 1 and count(distinct sn) = 1),
r as (
  select n.id, first_value(n.id) over (partition by md5(n.t) order by
    case when n.p then 0 else 1 end,
    case when coalesce(n.f,'') = 'x' then 1 else 0 end,
    case when coalesce(n.f,'') = 'dis' then 1 else 0 end,
    case when coalesce(n.sec->>'w','') <> '' then 0 else 1 end,
    n.id) c
  from n where md5(n.t) in (select h from ok))
update public.qbank b set canon = r.c from r where b.id = r.id;

update public.qbank set canon = id where canon is null;
create index if not exists qbank_canon_idx on public.qbank(canon);

update public.qbank c set fr_n = s.tot
from (select canon, sum(fr_n) tot from public.qbank group by canon having count(*) > 1) s
where c.id = s.canon and c.canon = c.id;

update public.qbank set p = false where canon <> id;

update public.posts p set qid = b.canon from public.qbank b where b.id = p.qid and b.canon <> b.id;
insert into public.follows (user_id, qid)
  select f.user_id, b.canon from public.follows f join public.qbank b on b.id = f.qid where b.canon <> b.id
  on conflict do nothing;
delete from public.follows f using public.qbank b where b.id = f.qid and b.canon <> b.id;
update public.notifications n set qid = b.canon from public.qbank b where b.id = n.qid and b.canon <> b.id;
update public.group_notes g set qid = b.canon from public.qbank b where b.id = g.qid and b.canon <> b.id;

create or replace function public.canon_map() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(id, canon), '{}'::jsonb) from public.qbank where canon <> id
$$;
revoke all on function public.canon_map() from public;
grant execute on function public.canon_map() to anon, authenticated;
