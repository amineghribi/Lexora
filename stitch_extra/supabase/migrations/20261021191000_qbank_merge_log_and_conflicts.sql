-- Journal des groupes de questions à énoncé identique qui n'ont PAS été fusionnés automatiquement (clés ou cours différents).
create table if not exists public.qbank_merge_log (
  id text primary key, grp text not null, k text, sn int, f_before text, canon text,
  reason text not null, comment text, created_at timestamptz not null default now()
);
alter table public.qbank_merge_log enable row level security;
revoke all on public.qbank_merge_log from anon, authenticated;
-- Résolution appliquée :
--  * key_conflict_kept : énoncé et propositions identiques, clés différentes (175 groupes) -> NON fusionnées. Ce sont surtout des
--    questions de suivi de cas cliniques différents (« Quel est le diagnostic le plus probable ? ») : la réponse dépend du cas.
--    Chaque ligne du journal porte un commentaire ; si deux clés concernent le même cas, l'une est fausse (à vérifier au cours).
--  * subject_merged : même clé, cours différents (81 groupes) -> fusionnées sur la question canonique (qbank.canon),
--    les copies passent en p = false ; discussions, suivis, notifications et notes de groupe sont déplacés.
