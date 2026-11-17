-- 1) Même énoncé, clés différentes : questions de cas cliniques distincts (« Quel est le diagnostic le plus probable ? »…) ou clé erronée.
--    On ne les fusionne PAS (la correction dépend du cas) ; on documente chaque groupe.
update public.qbank_merge_log l set reason = 'key_conflict_kept',
  comment = 'Énoncé et propositions identiques mais clés différentes (' || s.keys || ') sur ' || s.n || ' questions. '
         || 'Le plus souvent ce sont des questions de suivi de cas cliniques différents : la bonne réponse dépend du cas, donc ce ne sont pas des doublons. '
         || 'Non fusionnées. Si les deux clés concernent le même cas, l''une est fausse : à vérifier avec le cours.'
from (select grp, string_agg(distinct k, ' / ' order by k) keys, count(*) n from public.qbank_merge_log where reason = 'key_conflict' group by grp) s
where l.reason = 'key_conflict' and l.grp = s.grp;

-- 2) Même énoncé, même clé, cours différents : vraies copies listées dans deux cours -> fusion sur la question canonique
create temp table _sub as
select l.id, l.grp, b.sn, b.p, b.f, b.sec,
  count(*) over (partition by l.grp, b.sn) sn_n
from public.qbank_merge_log l join public.qbank b on b.id = l.id
where l.reason = 'subject_conflict';

create temp table _pick as
select id, grp, first_value(id) over (partition by grp order by
  case when p then 0 else 1 end,
  case when coalesce(f,'') = 'x' then 1 else 0 end,
  case when coalesce(f,'') = 'dis' then 1 else 0 end,
  case when coalesce(sec->>'w','') <> '' then 0 else 1 end,
  sn_n desc, id) c
from _sub;

update public.qbank b set canon = p.c from _pick p where b.id = p.id;

update public.qbank c set fr_n = s.tot
from (select b.canon, sum(b.fr_n) tot from public.qbank b where b.canon in (select c from _pick) group by b.canon having count(*) > 1) s
where c.id = s.canon and c.canon = c.id;

update public.qbank set p = false where canon <> id and id in (select id from _pick);

update public.qbank_merge_log l set reason = 'subject_merged', canon = p.c,
  comment = case when p.id = p.c then 'Question conservée : même question que ses copies, qui figurait dans plusieurs cours (' || (select string_agg(distinct s2.sn::text, ', ') from _sub s2 where s2.grp = p.grp) || '). Rattachée au cours ' || (select sn from _sub where id = p.c) || '.'
                 else 'Copie fusionnée sur ' || p.c || ' (cours ' || (select sn from _sub where id = p.c) || ' ; celle-ci était dans le cours ' || (select sn from _sub where id = p.id) || ').' end
from _pick p where l.id = p.id;

-- 3) Discussions, suivis, notifications, notes de groupe : sur l'identifiant canonique
update public.posts p set qid = b.canon from public.qbank b where b.id = p.qid and b.canon <> b.id;
insert into public.follows (user_id, qid)
  select f.user_id, b.canon from public.follows f join public.qbank b on b.id = f.qid where b.canon <> b.id
  on conflict do nothing;
delete from public.follows f using public.qbank b where b.id = f.qid and b.canon <> b.id;
update public.notifications n set qid = b.canon from public.qbank b where b.id = n.qid and b.canon <> b.id;
update public.group_notes g set qid = b.canon from public.qbank b where b.id = g.qid and b.canon <> b.id;

-- Les lignes non fusionnées gardent leur propre identifiant dans le journal
update public.qbank_merge_log set canon = id where canon is null;
