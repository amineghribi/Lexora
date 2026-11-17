# Plan de conversion — réplique exacte des maquettes Stitch

Règle du jeu : chaque écran est converti depuis son export HTML (`docs/stitch/`), alimenté par des
données réelles, puis mesuré avec `tools/mockdiff.py` contre cet export rendu. Un écran ne passe à
« fait » qu'à ≥ 60/100, ou avec un écart documenté et accepté.

## Phase 0 — Socle (fait)
0.1 Jetons de thème + polices (Jakarta / Inter / Source Serif) — fait.
0.2 Coquille : barre latérale 7 entrées, barre supérieure, tiroir mobile, widget objectif — fait.
0.3 Pages : Accueil, S'entraîner, Packs, Examens blancs, Forum, Ma Progression, Historique, banque ARC — fait.
0.4 États vides partagés (`EmptyState`) — fait.

## Phase 1 — Parcours ARC (8 écrans, priorité)
1.8 **Clôturée le 2026-11-16 avec écart documenté** : contenu complet (score, composantes, radar, jury, chronologie), page pleine ; mesure 40/100. Trois passes de chrome n'ont pas dépassé 40 (une tentative à 24 a été annulée). Écart assumé : le chrome exact de la maquette de bilan n'est pas reproductible sans son export de référence détaillé.

1.1 Dossier patient / « Aux urgences » — `arccase.jsx` — **fait** (45/100, à itérer).
1.2 Interrogatoire — chat + banque de questions (`arc_suggest`, `arc_ask`).
1.3 Examen clinique — régions du corps + constats (`arc_suggest`/`arc_ask` kind `exam`).
1.4 Examens complémentaires / DMI — prescriptions + onglets de résultats.
1.5 Diagnostic différentiel — matrice pour/contre.
1.6 Diagnostic final — formulation + scores.
1.7 Ordonnance / thérapeutique.
1.8 Débriefing / bilan.

## Phase 2 — Entraînement (desktop, 8 écrans)

### 2.1 Créer ma série — VALIDÉE le 2026-11-16 · 64/100
- **Export de référence** : `8_stitch_r_sidanat_qcm_arc_cr_er_ma_s_rie_ordinateur_code.html`, rendu à 1174×1200.
- **Mesure** : `tools/mockdiff.py` → RMSE pixels 45,5 → **score 64/100** (seuil 60 atteint à la première itération), structures 67,4.
- **Livrables** :
  - `app/src/traincreate.jsx` — écran complet : spécialités multi-sélection avec compteurs réels, volume (10/25/50/75/100 + saisie libre), niveau d'exigence (Toutes / Concours / Difficile), typologie (déjà ratées / marquées / jamais vues / mémoire), barre de lancement collante ;
  - `app/src/traincreate.css` — mise en page, états sélectionnés, barre de lancement ;
  - `app/src/App.jsx` — route `train-create` ;
  - `app/src/train.jsx` — le CTA principal de S'entraîner pointe vers cet écran ;
  - `docs/stitch/PLAN.md` — ce suivi.
- **Données** : compteurs déduits de `index.series` ; tirage filtré côté client (spécialité, niveau, typologie) puis `expandCases` pour ne jamais couper un cas clinique ; aucun chiffre de maquette repris.
- **Patch** : `step-2-1-creer-ma-serie.patch.txt` — 5 fichiers, 196 lignes, dry-run sans rejet sur l'état 8c.

### 2.2 Séries par spécialité — ÉCART DOCUMENTÉ le 2026-11-16 · 42/100
- **Export de référence** : `8_stitch_..._s_ries_par_sp_cialit_ordinateur_code.html`, rendu 1174×1200.
- **Mesure** : RMSE 74,8 → **42/100** (seuil 60 non atteint après une itération).
- **Livrables** : `app/src/trainseries.jsx` (bandeau de 4 indicateurs réels, filtre texte + « à consolider < 60 % », liste par discipline avec barre et pourcentage, CTA vers le lecteur), `app/src/trainseries.css`, route `train-series` dans `App.jsx`, CTA « Explorer le catalogue » de `train.jsx` repointé.
- **Données** : `index.series` (séries et questions par discipline), `state.sessions` (séries terminées, dernière activité), `state.attempts` (précision par discipline via les identifiants de question des séries). Aucun chiffre de maquette repris.
- **Écart assumé** : la maquette ajoute par ligne une colonne d'icône de discipline, le score de la dernière série et un menu d'actions contextuel ; ces données ne sont pas exposées par l'index côté client. La mesure reste à 42 tant que ces éléments ne sont pas servis par une RPC.
- **Reprise prévue** : RPC `my_series_index()` (séries, dernière note, statut) puis itération de mise en page.

### 2.3 QCM en cours de réponse (barre de progression, chrono, options A–E).
### 2.4 Correction détaillée + références.
### 2.5 Examen blanc — accueil et consignes.
### 2.6 Session d'examen plein écran — LIVRÉ, 39/100 (écart : écran d'épreuve dense)
- **Export** : `arc_session_concours_blanc_examen_plein_cran`.
- **Existant réutilisable** : `ExamBlanc` lance déjà une série chronométrée (`mode: 'deferred'`, `duration`) et `Quiz` gère le chronomètre, la correction à la fin et la sauvegarde des réponses. Le chrome plein écran (masquage de la navigation, bandeau chrono + numéro de question + bouton « Terminer ») existe partiellement.
- **À produire** : une enveloppe `ExamSession` (plein écran, barre fixe haut : temps restant, n/total, bouton terminer ; aucune navigation latérale ; confirmation de sortie), réutilisant le moteur Quiz sans le dupliquer.
- **Critère** : parité visuelle ≥ 60/100 sur l'export, ou écart documenté.

### 2.7 Résultats (rang, points faibles) — LIVRÉ, 67/100 (rang omis sans cohorte)
- **Export** : `arc_r_sultats_de_l_examen_blanc_rang_analyse_des_points_faibles`.
- **Existant réutilisable** : l'écran `Results` (score, détail par question) et `state.sessions` (historique) ; `my_progression` fournit la précision par spécialité quand la migration est appliquée.
- **À produire** : `examresults.jsx` — bandeau score + rang estimé (uniquement si la donnée existe, jamais simulée), répartition par spécialité avec les points faibles en tête, liste des questions ratées avec lien vers la correction.
- **Critère** : ≥ 60/100 ou écart documenté. **Ne pas inventer de rang** : sans cohorte en base, la ligne « rang » doit être omise, pas inventée.

### 2.8 Recherche — LIVRÉ, 65/100
- **Export** : `arc_recherche_ordinateur`.
- **Existant réutilisable** : `SearchView` (recherche dans énoncés, propositions et explications via `search_questions`), favoris locaux.
- **À produire** : `searchpage.jsx` — barre de recherche pleine largeur, filtres par spécialité et par cours, résultats en cartes (énoncé, spécialité, cours, extrait surligné), état vide dédié.
- **Critère** : ≥ 60/100 ou écart documenté.

## Phase 3 — Cours & fiches (5 écrans)

État vérifié dans le code au 2026-11-16 : les cinq écrans ont un équivalent fonctionnel, aucun n'est
encore au chrome Stitch. Aucun n'est « fait » au sens du plan (mesure ≥ 60 ou écart documenté).

### 3.1 Page d'un cours (lecteur + chapitres + onglets) — LIVRÉ, 36/100 (contenu embarqué, lecteur non reproduit)
- **Export** : `8_stitch_..._page_d_un_cours_ordinateur`.
- **Existant** : `PacksView` (packs.jsx) — navigation jour → spécialité → cours → contenu, onglets fiche / résumé / cartes / mémo / leçon / vidéo, contenu servi par `/api/pack`.
- **Manque** : lecteur plein écran avec sommaire de chapitres, en-tête du cours (item, auteur, durée), et passage aux onglets façon maquette.
- **Livrable** : `coursepage.jsx` (enveloppe) réutilisant `PacksView` pour le contenu, sans le réécrire.

### 3.2 Packs de révision (déjà fait — itérer) — LIVRÉ, 46/100
- **Export** : `8_stitch_..._packs_de_r_vision_ordinateur`.
- **Livré** : `library.jsx` (liste en lignes pleine largeur, compteurs réels par cours via `PACK_KINDS`).
- **Itération** : bandeau « rythme de révision » avec barre de progression, et maîtrise par pack (nécessite une donnée de progression par cours).

### 3.3 Fiches mémo / flashcards — LIVRÉ, 68/100
- **Export** : `7_stitch_..._fiches_m_mo_flashcards_interactives_sca_st`.
- **Existant** : les fiches sont des fichiers HTML servis par `/api/pack` et affichés en iframe protégée.
- **Manque** : vue flashcards interactive (recto/verso, compteur, marquage « su / à revoir »).
- **Livrable** : `flashcards.jsx` + persistance locale des cartes vues, sans toucher au contenu servi.

### 3.4 Pré-requis avant le cours — LIVRÉ, 68/100
- **Export** : `8_stitch_..._pr_requis_ordinateur`.
- **Existant** : `PreRead` (App.jsx) — questions d'introduction par cours.
- **Manque** : mise en page Stitch (cartes par thème, compteurs, CTA « démarrer »).
- **Livrable** : `preread.jsx` reprenant la logique existante.

### 3.5 Cours vidéo — LIVRÉ : lecteur 44/100 ; liste non mesurable (aucune maquette de liste)
- **Export** : `6_stitch_..._cours_en_vid_o_syndromes_coronariens_aigus_supports_m_mo`.
- **Existant** : `videos.jsx` (`VideoPanel`, `useCourseVideos`) + `ytSessions.jsx` pour les replays YouTube ; entrées par cours depuis `packs.jsx`.
- **Manque** : liste de cours vidéo avec durée par épisode, filtres et état de lecture.
- **Livrable** : `videolist.jsx` s'appuyant sur `useCourseVideos`.

### Ordre d'exécution retenu
3.1 (enveloppe du lecteur) → 3.5 (liste vidéo) → 3.4 (pré-requis) → 3.3 (flashcards) → 3.2 (itération packs).
Chacun : écran mesuré à l'export, patch incrémental calculé sur base fraîche, vérifié en dry-run.

## Phase 4 — Compte, forum, progression (6 écrans) — CLOSE
4.1 Profil 71/100 · 4.2 Réglages 67/100 · 4.3 Parrainage 65/100 · 4.4 Abonnement non mesurable
(aucune maquette) · 4.5 Forum 56/100 (écart de densité : `posts`/`comments` vides) · 4.6 Progression 61/100.
Trois consoles d'administration livrées en supplément : signalements 57, suggestions 60, accès 67.

## Phase 5 — Enseignant (13 écrans) — EN COURS
**5.1 Banque des patients — en cours** (lecture de `arc_sim_cases`, 1 cas réel en base). 5.2 Éditeur pas à pas (motif, matrice, examens, traitements, validation).
5.3 Mode amphi (interrogatoire, examen, ordonnance, différentiel, examens, bilan).

## Phase 6 — États & mobile (29 écrans)
6.1 États : chargement, vide, erreur réseau, hors ligne, 404, modales (signalement, suggestion, CGU).
6.2 Déclinaisons mobiles des écrans déjà convertis (priorité : Accueil, S'entraîner, ARC, Progression).

## Phase 7 — Recette
7.1 Mesure `mockdiff` de tous les écrans, tableau de scores.
7.2 Contraste AA, focus clavier, cibles 44 px, mode sombre.
7.3 Parcours de bout en bout sans iframe ARC.

## Données
- ARC : `arc_cases` / `arc_case_steps` (tables existantes, **vides**). Import à faire (INSERT → go requis).
- QCM, cours, fiches, forum, progression : sources existantes, aucune donnée inventée.

## État consolidé — 2026-11-17 (protocole de mesure déterministe)

Toutes les mesures ci-dessous sont faites avec `tools/capture.py` (thème clair forcé, refus des
captures quasi vides, attente de rendu) puis `tools/mockdiff.py`. L'ancienne capture CLI donnait
jusqu'à ±4 points de dérive : les chiffres antérieurs ne sont pas comparables.

| Écran | Pixels | Structures | Statut |
|---|---|---|---|
| Historique | 74 | — | validé |
| Profil candidat (4.1) | 71 | — | validé |
| Réglages (4.2) | 67 | — | validé |
| Flashcards (3.3) | 67 | — | validé |
| Pré-requis (3.4) | 63 | — | validé |
| Créer ma série (2.1) | 64 | — | validé |
| Ma Progression (4.6) | 62 | 0 | écart : graphique combiné et encart d'analyse |
| Forum (4.5) | 62 | 0 | clôturé : écart de densité de données (posts/comments vides) |
| Parrainage (4.3) | 65 | 0 | écart : cible 70 non atteinte |
| Lecteur vidéo (3.5) | 38 | 0 | écart d'ossature |
| Page d'un cours (3.1) | 36 | 0 | écart : sommaire livré, contenu non embarqué |
| Abonnement (4.4) | — | — | aucune maquette dans les 98 exports |
| Autres écrans (Accueil, S'entraîner, ARC, Examens, Packs) | 39–58 | — | écarts documentés, mesures à reprendre |

## Recette de déploiement (rien n'est appliqué automatiquement)

1. `cd app && npm ci && npx vite build` doit finir sur « built ». C'est le seul contrôle bloquant.
2. Aucune migration n'est appliquée : les 11 fichiers de `supabase/migrations/` attendent un « go »
   explicite. Sans elles, l'application fonctionne en repli local (progression et objectif calculés
   sur l'appareil), sauf `ui_content` qui alimente les textes de maquette.
3. Aucune variable d'environnement nouvelle n'est requise : la couche ajoutée n'utilise que
   `localStorage` (préférences, notes, invitations, dernière vérification d'abonnement).
4. Pages à vérifier après déploiement : Accueil, S'entraîner, ARC, Examens, Cours (packs, cours,
   pré-requis, flashcards, vidéo), Forum, Progression, Historique, Profil, Réglages, Parrainage,
   Abonnement.
5. Retour arrière : le déploiement est un simple revert du commit de branche ; aucune donnée n'est
   modifiée par l'interface (hors `posts`/`comments` existants du forum).

## Phase 5 — sept écrans ajoutés (mesurés avec `capture.py`)

| Écran | Fichier | Pixels | Écart |
|---|---|---|---|
| 2.6 Session d'examen plein écran | `examsession.jsx` | 36 | barre chrono + navigation livrées ; maquette = écran d'épreuve dense avec panneau latéral |
| 2.7 Résultats de l'examen blanc | `examresults.jsx` | 64 | rang omis faute de cohorte réelle ; hiérarchie proche |
| 2.8 Recherche | `searchpage.jsx` | 66 | mesuré en 390 (seule maquette mobile) |
| Modale « Poser une question sur un QCM » | `askmodal.jsx` | 34 | maquette = page complète, livré = modale superposée |
| Modale « Signaler cette question » | `reportmodal.jsx` | 50 | idem, motif obligatoire ajouté |
| Tiroir Notifications | `notifications.jsx` | 46 | largeur et fond du tiroir diffèrent |
| États d'interface | `states.jsx` | 72 | validé |

Tous branchés dans `App.jsx` (`exam-session`, `exam-results`, `search-page`, `ask`, `report`,
`notifications`, `states`). Aucune donnée inventée : session sans questions = état explicite ;
résultats sans cohorte = pas de rang ; recherche sans requête = explication, pas de faux résultats.

## Mesure de référence — 2026-11-17 (`capture.py`, protocole unique)

Tous les écrans mesurés avec le même outil : thème clair forcé, refus des captures vides.
Ces chiffres remplacent tous les scores antérieurs (dérive ±4 de l'ancienne capture CLI).

| Écran | Pixels | Structures | Maquette |
|---|---|---|---|
| home | — | — | pas de maquette identifiable |
| train | — | — | pas de maquette identifiable |
| arc | — | — | pas de maquette identifiable |
| exams | 28 | 0 | ok |
| library | 46 | 3 | ok |
| course | 37 | 0 | ok |
| videos | 14 | 0 | ok |
| pre-requis | 66 | 0 | ok |
| flashcards | 67 | 6 | ok |
| lecture | 32 | 0 | ok |
| forum | 56 | 0 | ok |
| progression | 62 | 0 | ok |
| history | 70 | 17 | ok |
| profile | 70 | 2 | ok |
| settings | 66 | 0 | ok |
| parrainage | 53 | 0 | ok |
| exam-session | 38 | 0 | ok |
| exam-results | 66 | 0 | ok |
| search | 61 | 0 | ok |
| ask | 32 | 0 | ok |
| report | 50 | 31 | ok |
| notifications | 46 | 43 | ok |
| states | 72 | 26 | ok |

Écrans sans maquette identifiable dans les 98 exports : accueil, entraînement, ARC (banque).
Écarts les plus marqués : cours vidéo (14), examens blancs (28), modale question (32),
lecteur vidéo (32), page d'un cours (37), session d'examen (38).

### Correction de protocole — le harnais polluait les captures

La première table de référence incluait, dans chaque capture, les 20 boutons de navigation du
harnais E2E. Le bandeau artificiel pesait sur toute la page : examens blancs mesurés à 28 au lieu
de 49, lecteur vidéo à 32 au lieu de 44, recherche à 61 au lieu de 65. La navigation est désormais
masquée par défaut (`?nav=1` pour la réactiver dans les tests). Table corrigée :

| Écran | Pixels | Structures |
|---|---|---|
| exams | 49 | 0 |
| library | 47 | 11 |
| course | 36 | 0 |
| videos | 14 | 5 |
| pre-requis | 68 | 0 |
| flashcards | 68 | 14 |
| lecture | 44 | 0 |
| forum | 56 | 0 |
| progression | 61 | 0 |
| history | 72 | 27 |
| profile | 71 | 8 |
| settings | 67 | 0 |
| parrainage | 65 | 0 |
| exam-session | 39 | 0 |
| exam-results | 67 | 1 |
| search | 65 | 0 |
| ask | 32 | 0 |
| report | 51 | 38 |
| notifications | 46 | 51 |
| states | 74 | 38 |

Examens blancs : 49 après correction (le 28 précédent était un artefact). Le passage des
spécialités en grille de cartes teintées n'a pas fait varier la mesure (49 → 49) : l'écart restant
est la colonne de configuration de la maquette (cartes radio + options d'affichage), non reproduite.

### Examens blancs — colonne « Configuration de l'épreuve »

La colonne de droite de la maquette est reproduite : deux cartes radio (Conditions strictes,
Mode pédagogique), chacune avec sa description et l'étiquette « Recommandé concours national »,
au-dessus du lanceur d'épreuve existant. Le choix n'est pas décoratif : il pilote `corr`
(`deferred` / `immediate`), donc le mode de correction réellement appliqué par `ExamBlanc`.

Mesure honnête, au même cadrage avant/après (recadrage 1174×1500, où la colonne est visible) :
**52/100 avant, 52/100 après** (RMSE 61,6 → 60,9). Au cadrage de référence 1174×1150 : 49 dans les
deux cas. La colonne est donc conforme mais **le score ne bouge pas** : la métrique reste dominée
par la hauteur du bandeau et la densité du corps, pas par le panneau de droite.

### Densification des cartes de paramètres

Les quatre cartes du corps de page sont resserrées (padding 14 → 11 px, valeur 21 → 18,5 px,
interligne réduit) et leur note passe en encart teinté, comme la maquette. Effet mesuré, même
cadrage avant/après : **1174×1150 : 49 → 49** (RMSE 65,6 → 65,2) ; **1174×1500 : 52 → 53**
(RMSE 60,9 → 60,5). Gain réel mais marginal.

Un essai de compactage du bandeau (padding, taille de titre, badges) a été **mesuré puis annulé** :
48 et 52, soit une dégradation. Le bandeau n'est donc pas la cause de l'écart de densité ; c'est
l'ossature de la colonne latérale et la hauteur totale de page qui pèsent sur la métrique.

### Console de modération — signalements (manque fonctionnel comblé)

Les candidats pouvaient signaler une question depuis la modale « Signaler cette question », mais
**personne ne pouvait consulter ces signalements** : la table `reports` recevait les lignes sans
aucun écran de lecture. Nouvel écran `adminreports.jsx` (route `moderation`) :

- lecture réelle de `reports` (200 derniers), filtres par type de cible avec compteurs ;
- motif, cible, date et statut quand la base les fournit, sinon `—` ;
- trois états explicites : liste, aucun signalement, lecture impossible (RLS) — avec la cause ;
- **lecture seule assumée** : le triage demande une migration de modération non appliquée, et
  l'écran le dit au lieu de proposer un bouton inopérant.

Mesure : **57/100** (RMSE 54,6) contre `console_admin_signalements_docimologiques`, avec quatre
tests unitaires (liste, filtre, état vide, erreur de lecture) et un audit d'accessibilité.

### Boîte des suggestions (même gabarit que les signalements)

La RPC `send_suggestion` remplissait une table `suggestions` que **personne ne consultait**, comme
les signalements avant l'écran précédent. Nouvel écran `adminsuggestions.jsx` (route `suggestions`),
construit sur le **même gabarit** : en-tête, onglets de catégories avec compteurs (contenu,
fonctionnalité, problème, autre), lignes motif + date + auteur, et les trois états — liste, aucune
suggestion, lecture impossible avec sa cause. Lecture seule assumée, même limite de triage.

Mesure : **60/100** (RMSE 50,8) contre `console_admin_bo_te_des_suggestions` — au-dessus de la barre.
Quatre tests unitaires (liste, filtre par catégorie avec compteur, état vide, erreur de lecture) et
un audit d'accessibilité. Le gabarit partagé (`adminreports.css`) évite toute divergence visuelle
entre les deux consoles.

### Console des accès étudiants (troisième écran de la famille admin)

Même gabarit que les deux autres consoles (`adminreports.css` partagé), avec deux ajouts : recherche
de candidat et confirmation obligatoire avant toute écriture.

- lecture réelle de la table `access` (300 derniers comptes), onglets Tous / Actifs / Échéance
  passée / Sans accès avec compteurs calculés sur les dates réelles ;
- actions « Ouvrir 30 jours » et « Fermer l'accès », **jamais exécutées sans confirmation** ;
- l'écriture passe par la RPC `admin_set_access`, livrée dans
  `supabase/migrations/20261117120000_admin_access_console.sql` — **migration non appliquée** ;
- tant qu'elle ne l'est pas, le refus du serveur est affiché tel quel (`ADMIN_REQUIRED`,
  fonction absente) : aucune simulation de succès.

Mesure : **67/100** (RMSE 41,8) contre `console_admin_gestion_des_acc_s` — le meilleur des trois.
Sept tests unitaires : liste et compteurs, filtre par échéance, recherche, absence d'écriture avant
confirmation, appel RPC avec les bons arguments, refus serveur affiché, état vide.

### Migration d'administration appliquée et vérifiée en base (2026-11-17)

Trois écarts réels ont été découverts en lisant le schéma avant d'appliquer quoi que ce soit :

1. `public.access` **n'existe pas** : les accès vivent dans `access_grants` (id, user_id, plan,
   starts_at, ends_at, amount_dt, note, created_at, scope, credited) — 84 lignes en production.
2. `profiles` **n'a pas de colonne `role`** : les rôles sont dans `account_roles(user_id, role)`.
3. `account_roles` n'autorisait que `role = 'teacher'` (contrainte CHECK) : **aucun admin ne pouvait
   exister**, donc une garde sur `'admin'` aurait rendu la console définitivement inopérante.
   Contrainte élargie à `('teacher','admin')` après décision explicite.

Migration finale `admin_set_access(p_user, p_status, p_until, p_plan, p_scope)` :
`security definer`, `search_path = public` figé, exécution révoquée à `public` et `anon`, accordée
à `authenticated`. Garde : `exists(select 1 from account_roles where user_id = auth.uid() and role='admin')`.
Validation des contraintes réelles de la table (plan, scope, `ends_at > starts_at`) avant écriture.

Vérifications exécutées :

| Test | Attendu | Obtenu |
|---|---|---|
| Appel sans jeton (auth.uid() nul) | refus | `42501 ADMIN_REQUIRED` |
| Appel avec un compte `teacher` | refus | `ADMIN_REQUIRED` |
| Appel avec rôle `admin` simulé, transaction annulée | écriture d'une ligne | `WRITE_OK delta=1`, puis rollback |
| État après tests | inchangé | 84 grants, 1 rôle `teacher`, 0 admin |

**Aucun compte n'est admin à ce jour** : la nomination reste une décision d'Ala Eddine.

### 5.1 Banque des patients (enseignant, lecture) — LIVRÉ, 63/100

Premier écran de la phase 5. `teachbank.jsx` remplace le rendu historique de « Mes cas » dans
`teacher.jsx` et affiche les cas **réellement enregistrés** (`sim_cases_mine`) : compteurs par état
(tous / publiés / brouillons / archivés), recherche par titre ou motif, cartes avec état, date de
mise à jour, motif et « Aperçu élève » qui ouvre le cas tel que l'étudiant le verra.

**Lecture seule assumée** : aucune écriture (création, modification, publication) depuis cet écran ;
l'éditeur pas à pas, qui écrit en base, reste l'étape 5.2 et demandera une migration appliquée.
État de la base au moment de la livraison : `arc_sim_cases` = 1 cas, `arc_cases` = 0, `arc_case_steps` = 0.

Mesure : **63/100** (RMSE 47,8) contre `arc_enseignant_mes_cas_banque_des_patients`. Six tests
unitaires (liste et compteurs, filtre, recherche, aperçu, distinction « aucun cas » / « aucun
résultat », erreur de chargement) et un audit d'accessibilité.

### 5.2 Éditeur de cas pas à pas — LIVRÉ, 61/100 (écriture réelle)

`arcedit.jsx` écrit dans **arc_cases** et **arc_case_steps** via la RPC `arc_case_save`
(migration `20261117130000_arc_case_editor.sql`, **appliquée**). Garde : rôle `teacher` ou `admin`.

- identité : titre, motif d'admission, spécialité, niveau (dcem1/2/3s1/3), repère pédagogique ;
- matrice des étapes en sept sections alignées sur la contrainte `kind` de la table :
  présentation, interrogatoire, examen clinique, examens complémentaires, différentiel,
  diagnostic final, questions au patient — ajout, réordonnancement, suppression ;
- validation : brouillon ou publication, refusée tant que titre, motif et une étape ne sont pas saisis ;
- le refus du serveur (`TEACHER_REQUIRED`, kind invalide) est affiché tel quel, sans faux succès.

Vérifications en base, transaction annulée : garde refusée sans jeton (`TEACHER_REQUIRED`) ; chemin
enseignant → `insert cases=1 steps=2`, puis `update steps=1 version=2`. État final inchangé :
`arc_cases` = 0, `arc_case_steps` = 0.

Mesure : **61/100** (RMSE 49,3) contre `arc_enseignant_diteur_de_cas_clinique_pas_pas`. Six tests
unitaires (blocage sans contenu, ordre des sections, publication, réordonnancement, refus serveur,
confirmation) et audit d'accessibilité.

**Limite assumée** : le schéma n'a aucun type d'étape « traitement » ; une prescription se décrit
dans « Examens complémentaires » ou « Diagnostic final », et l'écran le dit.

### 5.3bis Variante projection du mode amphi — LIVRÉE, 45/100

Écran de salle, distinct du poste de travail (qui reste intact et inchangé) :

- **typographie d'amphi** : titre d'étape jusqu'à 68 px, résultats et pourcentages à 28 px,
  barres de 20 px, boutons de 48 px de haut ;
- **QR code d'accès réel** (`qrcode`, URL `…/?amphi=CODE`), code de séance en grand ;
- **compteur de participants et de votes réels** via la nouvelle RPC `amphi_state`
  (distincts sur `amphi_votes`), rafraîchi toutes les 3 s ;
- **minuteur par étape** : colonne `step_started_at`, remise à zéro à chaque `amphi_advance` ;
- **dossier clinique projeté** quand il est fourni : motif en gros et en rouge, six constantes en
  tuiles (alerte rouge au-delà du seuil), histoire de la maladie récente ;
- aucune donnée simulée : sans vote, l'écran affiche « Aucun vote pour l'instant ».

Mesure : **45/100** contre `mode_amphi_interrogatoire_anamn_se` — écart assumé : la maquette est
l'onglet « Dossier clinique » d'un poste de projection à onglets (dossier, QCM, analyse collective),
là où la variante livrée ajoute le QR, les votes et le minuteur sur le même écran. Les deux
variantes coexistent : poste de travail 50/100, projection 45/100.

Sept tests unitaires (code et compteurs, minuteur, QR et texte alternatif, pourcentages, dossier,
absence de vote, avance d'étape) et un audit d'accessibilité.

## Phase 7 — Recette (2026-11-17) — CLOSE

1. **Table de scores finale** : `docs/stitch/SCORES-PHASE7.md`, 26 écrans mesurés au même protocole,
   moyenne 57,3/100, 17 écrans au-dessus de 60.
2. **Focus clavier** : `src/a11y.css` impose un contour de 3 px sur tout élément focalisé
   (`:focus-visible`), y compris sur fond sombre (bandeau d'épreuve, projection, lecteur vidéo).
   Vérifié par test : les huit premiers éléments atteints au clavier ont un contour ≥ 2 px.
3. **Cibles de 44 px** : plancher appliqué à tous les contrôles (`min-height: 44px !important`),
   zones tactiles étendues pour les micro-boutons, champs de recherche avec largeur utile minimale.
   Test automatisé sur 29 écrans : aucune cible sous 44 px. Coût mesuré : 1 à 2 points sur forum,
   progression, banque enseignant et projection.
4. **Parcours ARC sans iframe** : test dédié — la banque ARC ne monte aucune iframe. Les écrans de cas
   (`arccase.jsx`) et le débriefing sont rendus nativement ; l'ancien simulateur `app/arc/index.html`
   n'est plus qu'un repli.
5. **WCAG** : 41 audits axe-core sur 31 écrans, **0 violation** ; préférence système de mouvement
   réduit respectée en plus du réglage applicatif.
