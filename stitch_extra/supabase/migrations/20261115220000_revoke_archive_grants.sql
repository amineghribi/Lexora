-- Chantier 4b (suite) : retire les droits anon/authenticated sur 5 tables de sauvegarde du schéma `archive`.
-- Elles étaient protégées par le RLS (activé, aucune politique) et le schéma n'est pas exposé par l'API ; on aligne sur les autres sauvegardes (aucun droit client).
-- Aucune donnée touchée. Retour arrière : grant all on archive.<nom> to anon, authenticated; (inutile en pratique).
revoke all on archive.course_video_qcm_bak_20261109  from anon, authenticated;
revoke all on archive.course_video_qcm_bak_20261109b from anon, authenticated;
revoke all on archive.course_videos_bak_20261109     from anon, authenticated;
revoke all on archive.qbank_fix_backup_20261025      from anon, authenticated;
revoke all on archive.qbank_merge_backup_20261025    from anon, authenticated;
