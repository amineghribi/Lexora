# Résidanat QCM (tcemqcm.com)

Application web de QCM pour le résidanat tunisien : banque de questions, cours PDF, packs de révision, vidéos de balayage, forum et module ARC (raisonnement clinique).

## Où est quoi

| Dossier | Contenu |
|---|---|
| `app/` | Application React + Vite (`app/src`), routes serveur Vercel (`app/api`), module ARC servi par `/api/arc` (`app/arc`), packs de révision servis par `/api/pack` (`app/packs`), cours PDF (`app/public/courses`). |
| `supabase/` | `migrations/` (documentation de l'état de la base, **ne jamais rejouer**), `admin_queries.sql`, `import_questions.sql`. |
| `studio/` | Fabrication du contenu : module ARC (`studio/arc`), packs, vidéos, scripts d'envoi vers R2 (`studio/tools`). Procédure vidéo : `studio/README.md`. |
| `tools/` | Scripts utilisés une fois pour construire la banque de questions et leurs données sources. L'application ne les utilise pas. |
| `docs/` | Documentation du projet (voir ci-dessous). |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) : composants, flux, modèle d'accès, variables d'environnement (noms), risques connus.
- [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) : déployer, appliquer et vérifier une migration, revenir en arrière.
- [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) : état réel des migrations et règle pour en ajouter une.
- [`docs/JOURNAL.md`](docs/JOURNAL.md) : journal commun aux sessions Claude (`ops.journal`).
- [`studio/arc/LISEZ_MOI.md`](studio/arc/LISEZ_MOI.md) : construire, tester et publier le module ARC.
- [`CLAUDE.md`](CLAUDE.md) : règles non négociables pour toute session.

## Lancer l'application en local

```
cd app
npm install
npm run dev      # serveur de développement
npm run build    # build de production (à passer avant toute PR)
```

Les routes `app/api/*` sont des fonctions Vercel : elles ne tournent pas avec `npm run dev`. Elles se testent sur un déploiement (aperçu ou production).

## Base de données (Supabase)

Projet Supabase `wraxarmiohrhrlzlpqyy`. Table principale `qbank` : chaque ligne est une version d'une question. Une seule version est jouable (`p = true`) ; les copies pointent vers la question conservée via `canon`. L'application lit la fonction `canon_map` pour ramener la progression des élèves sur la bonne question.

Historique des fusions : `qbank_merge_log`. Sauvegardes avant fusion ou correction de clé : tables `qbank_*_backup_*`.

Le journal inter-sessions est dans le schéma `ops` (hors API publique) : voir `docs/JOURNAL.md`.
