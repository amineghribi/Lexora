-- Chantier 4b : les 8 tables de sauvegarde de `public` passent dans le schéma `archive` (déjà utilisé pour les autres sauvegardes).
-- Aucune suppression, aucune donnée modifiée. Les droits et le RLS (activé, aucun droit pour anon/authenticated) suivent les tables.
-- Vérifié avant : aucune fonction, vue, clé étrangère entrante ni trigger ne les référence ; aucun conflit de nom dans `archive`.
-- NON déplacée : public.course_videos_bak_20261115 (retour arrière du cours 18, voir studio/sql/course18_to_r2.sql).
-- Retour arrière : alter table archive.<nom> set schema public;
do $$
declare t text;
begin
  foreach t in array array[
    'qbank_p1_bak', 'qbank_dupbump_bak', 'qbank_key_bak_1103', 'qbank_key_bak_1104',
    'course_video_qcm_bak_20261109', 'course_video_qcm_bak_20261109b', 'course_videos_bak_20261109', 'p1_ids'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I set schema archive', t);
    end if;
  end loop;
end $$;
