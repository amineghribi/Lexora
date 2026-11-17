-- Listes DCEM1 et DCEM2 de la Faculté de Médecine de Monastir (24 et 33 cours), validées par le propriétaire le 2026-11-15.
-- Source : docs/programmes-facultes/MONASTIR-MAPPING.md (certificats de https://fmm-rnu.tn/fr/scolarite/dcem/dcem1 et /dcem2 rapprochés des spécialités de la banque).
-- Effet : les comptes dont la faculté est Monastir peuvent choisir les parcours dcem1 et dcem2 ; Tunis, Sfax et Sousse restent en TRACK_UNAVAILABLE (aucune ligne pour eux).
-- exclusive = false : le résidanat continue de voir tous ces cours. DCEM3 (sélection de révision S2) n'est pas touché.
insert into public.track_courses (track, sn, exclusive, faculty) values
  -- DCEM1 certificat 1 Maladies infectieuses et microbiologie
  ('dcem1', 44, false, 'monastir'), ('dcem1', 45, false, 'monastir'), ('dcem1', 52, false, 'monastir'),
  -- DCEM1 certificat 2 Hématologie - Oncologie
  ('dcem1', 2, false, 'monastir'), ('dcem1', 3, false, 'monastir'), ('dcem1', 62, false, 'monastir'), ('dcem1', 64, false, 'monastir'), ('dcem1', 66, false, 'monastir'),
  -- DCEM1 certificat 3 Endocrinologie - Nutrition
  ('dcem1', 20, false, 'monastir'), ('dcem1', 23, false, 'monastir'), ('dcem1', 39, false, 'monastir'), ('dcem1', 40, false, 'monastir'), ('dcem1', 47, false, 'monastir'),
  -- DCEM1 certificat 4 Maladies cardiovasculaires
  ('dcem1', 22, false, 'monastir'), ('dcem1', 25, false, 'monastir'), ('dcem1', 38, false, 'monastir'), ('dcem1', 49, false, 'monastir'), ('dcem1', 51, false, 'monastir'), ('dcem1', 65, false, 'monastir'),
  -- DCEM1 certificat 5 Appareil respiratoire
  ('dcem1', 7, false, 'monastir'), ('dcem1', 9, false, 'monastir'), ('dcem1', 11, false, 'monastir'), ('dcem1', 43, false, 'monastir'), ('dcem1', 72, false, 'monastir'),
  -- DCEM1 certificat 6 Dermatologie : aucun cours dans la banque
  -- DCEM2 certificat 1 Gynécologie - Obstétrique
  ('dcem2', 13, false, 'monastir'), ('dcem2', 14, false, 'monastir'), ('dcem2', 18, false, 'monastir'), ('dcem2', 32, false, 'monastir'), ('dcem2', 53, false, 'monastir'), ('dcem2', 60, false, 'monastir'),
  -- DCEM2 certificat 2 Maladies digestives (Gastrologie + Chirurgie générale)
  ('dcem2', 4, false, 'monastir'), ('dcem2', 15, false, 'monastir'), ('dcem2', 21, false, 'monastir'), ('dcem2', 24, false, 'monastir'), ('dcem2', 34, false, 'monastir'), ('dcem2', 35, false, 'monastir'), ('dcem2', 36, false, 'monastir'), ('dcem2', 41, false, 'monastir'), ('dcem2', 54, false, 'monastir'), ('dcem2', 57, false, 'monastir'), ('dcem2', 74, false, 'monastir'),
  -- DCEM2 certificat 3 Appareil urinaire (Néphrologie + Urologie)
  ('dcem2', 33, false, 'monastir'), ('dcem2', 46, false, 'monastir'), ('dcem2', 50, false, 'monastir'), ('dcem2', 55, false, 'monastir'), ('dcem2', 68, false, 'monastir'), ('dcem2', 71, false, 'monastir'), ('dcem2', 73, false, 'monastir'),
  -- DCEM2 certificat 4 Tête et cou (ORL + Ophtalmologie)
  ('dcem2', 12, false, 'monastir'), ('dcem2', 42, false, 'monastir'), ('dcem2', 56, false, 'monastir'),
  -- DCEM2 certificat 5 Neurologie
  ('dcem2', 1, false, 'monastir'), ('dcem2', 16, false, 'monastir'), ('dcem2', 26, false, 'monastir'),
  -- DCEM2 certificat 6 Appareil locomoteur
  ('dcem2', 6, false, 'monastir'), ('dcem2', 31, false, 'monastir'), ('dcem2', 58, false, 'monastir')
on conflict do nothing;
