# tools/final : archivé dans R2

Les 8 fichiers qui étaient ici (banque v1/v2, tags, verdicts de conflits, notes) ont été déplacés le 2026-11-15 dans le bucket privé R2 `qcm-videos`, sous `archive/tools-final/<nom>` :

DATA_NOTES.md, case_reviewed_answers.tsv, conflict_verdicts.xlsx, explanations_conflicts.json, question_bank.json.gz, question_bank_final.xlsx, question_bank_v2.json.gz, question_tags_v3.xlsx.

- Taille et SHA-256 de chacun : `studio/tools/archive_tools_final_manifest.json`.
- Vérification (lecture seule, sur le PC) : `python studio/tools/archive_r2.py --verify` ; attendu « Conformes : 8 · problèmes : 0 ». Voir `studio/R2.md`.
- Ils restent aussi dans l'historique git (dernier commit qui les contient : celui avant ce retrait). La banque en service est la table `public.qbank` de Supabase.
- Sous Windows, cloner avec `-c core.autocrlf=false` avant de comparer une empreinte (sinon les fichiers texte sont convertis en CRLF).
