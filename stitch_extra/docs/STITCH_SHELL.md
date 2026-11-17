# Coquille d'interface « Stitch » et trois backends

État au 2026-11-16. **Rien n'a été poussé, aucune migration n'a été appliquée.** Ce dossier décrit
le code livré ici (fichiers + captures), les quatre migrations à appliquer après un « go », et la
revue des modules DCEM3 générés.

Date officielle retenue : **2026-12-23** (J-37 au 2026-11-16), confirmée par l'équipe.

---

## 0. Accueil : reproduction de la maquette Stitch

La maquette (`docs/maquettes/accueil.png`, non versionnée) est reproduite bloc par bloc :
barre latérale (marque, faculté, badge année, 7 entrées, `Mode`/`Affichage`, identité), barre
supérieure (fil d'Ariane, `Session active`, anneau `38 / 50 QCM`, cloche, avatar, pastille `J-xx`),
en-tête d'accueil, rangée de 4 indicateurs + tendance 7 jours, sections `01 Chaque jour`,
`02 S'entraîner`, `03 Ressources & ARC`, et le pied avec la citation.

**Valeurs de la maquette.** Les chiffres affichés (`420` QCM, `74,2 %`, `3 cas cliniques`, `9 jours`,
`38 / 50` QCM, `15 / 40` faits, `24` à réviser, `Samedi • 09:00` / `184` candidats, `180` fiches,
`14` nouvelles discussions, `Cardiologie 88 %` / `Pédiatrie 54 %`) et la citation ne sont pas codés
dans le bundle : ils vivent dans `public.ui_content`, clé `accueil` (migration
`20261116124000_ui_content.sql`). `app/src/mockup.js` n'est que le repli local, identique à la graine.

Conséquence à assumer : tant que la clé `accueil` est active, un élève voit ces chiffres au lieu de
sa progression réelle. Pour revenir aux données réelles sans redéploiement :

```sql
update public.ui_content set enabled = false where key = 'accueil';   -- ou : delete from public.ui_content where key = 'accueil';
```

La citation et son attribution (`Pr. M. Ben Salem • Comité Pédagogique du Résidanat de Médecine`)
sont reprises telles quelles de la maquette : c'est un texte de démonstration, pas une citation
vérifiée. Elle doit être remplacée par une attribution réelle — même mécanisme, sans redéploiement :

```sql
select public.ui_content_set('accueil', jsonb_set(value, '{quote}', jsonb_build_object(
  'text', 'Citation validée par l''équipe', 'author', 'Nom réel', 'role', 'Fonction réelle')));
```

Écarts restants, volontaires : le parcours et la faculté affichés sont ceux du compte
(`Résidanat • FMT Tunis`), la date de concours est la date confirmée (donc `J-37`, pas `J-142`), et
le bloc `Plus` subsiste car des écrans existants (Groupes, Study time) n'ont pas d'entrée dans la
maquette.

Mesure `tools/mockdiff.py` (maquette 1174×1600 vs capture 1174×1600) : **RMSE pixels 60,1 / 255 →
53/100**, RMSE structures 74,7. Le score de structure reste bas car le texte des cartes, les
libellés et deux blocs diffèrent ; la grille, l'ordre des sections, les hauteurs et les valeurs sont
alignés. Planche côte à côte livrée avec les captures.

## 0bis. Écrans Stitch reçus le 2026-11-16 (exports HTML) et état

Les exports HTML reçus ne sont pas les six pages de navigation : ce sont le tableau de bord et
les **écrans du module ARC** (parcours clinique complet) plus la gestion pédagogique.

| Export | Écran réel | Dans l'app | État |
|---|---|---|---|
| `29e78032` | Accueil / tableau de bord | `home.jsx` | reproduit ; chiffres pilotés par `ui_content` (l'export HTML montre `12/35` et un rang estimé, la version livrée garde `3` et `9` demandés) |
| `4fc4517c` | Banque de cas ARC (choix du motif) | `arcplay.jsx` (ArcHub) | **reconstruit dans cette étape** |
| `5404cca9` | Dossier patient — interrogatoire | simulateur `app/arc/index.html` (iframe) | non porté en React |
| `0b9ad19a` | Examen clinique / cartographie | simulateur (iframe) | non porté |
| `e25435c5` | Examens complémentaires / biologie | simulateur (iframe) | non porté |
| `1c836975` | Diagnostic différentiel / matrice | simulateur (iframe) | non porté |
| `ac2063e4` | Diagnostic final / scores | simulateur (iframe) | non porté |
| `40799f3f` | Stratégie thérapeutique | simulateur (iframe) | non porté |
| `714efec2` | Débriefing / barème | simulateur (iframe) | non porté |
| `7508f636` | Gestion pédagogique des cas (enseignant) | `teacher.jsx` + `arcbank.jsx` | non porté |

Deux points de méthode :

1. Les écrans 3 à 9 ne sont pas des « pages » de l'application : l'ARC est aujourd'hui une
   application autonome construite dans `studio/arc` et affichée en iframe. Les reproduire à
   l'identique revient à réécrire ce simulateur en React — c'est un chantier à part entière, pas
   une déclinaison de la coquille. Décision à prendre avant de l'engager.
2. Le thème fourni (`attachment-1.md`) a été appliqué aux jetons : primaire `#0F4C5C`, accent
   `#1C7C8D`, fond `#F8FAF9`, filets `#DCE5E7`, texte `#1B2A32`, rayons 4/8 px, polices
   Plus Jakarta Sans / Inter / Source Serif 4 (chargées dans `index.html`).

Mesure `mockdiff` sur la banque ARC (export 1174×1500 rendu, vs capture 1174×1500) :
**RMSE 66,4 / 255 → 48/100**, structures 71,2. Repères : Accueil 53/100 après plusieurs passes ;
l'écart restant porte sur la densité des cartes et les libellés, pas sur l'ordre des blocs.

## 0ter. Second lot d'exports (12 fichiers) — ce qui est couvert

| Export | Écran | État |
|---|---|---|
| `b492b916` | **Examens blancs** : présentation de l'épreuve (durée, volume, barème, candidats), quotas par spécialité, règlement anti-fraude | **construit** : `app/src/exams.jsx` + `exams.css`, textes via `ui_content('examens_blancs')`, composeur existant conservé dessous |
| `405eb250` | Cours vidéo & Fiches : lecteur + onglets de fiches pour un cours | non porté (l'écran de cours existant `packs.jsx` couvre la fonction, pas la mise en page) |
| `46b5cebe` | Forum & Modération : filtres par spécialité + fils de discussion | non porté (`forum.jsx` existant) |
| `55b37ec8` | S'entraîner : écran de question en mode correction (07/20, chrono, score) | non porté : c'est l'écran de quiz, pas une page d'entrée |
| `2379d1d8`, `babf2376`, `c1bfe319`, `cd860fa5`, `f3133b7b`, `88a9ac31`, `5a7e8ede` | Étapes ARC (différentiel, dossier, examens, anamnèse) et mode conception enseignant | non porté : simulateur autonome |

Aucun export ne couvre **Ma Progression** : cette page reste celle qui est en place (courbes + KPI).

Mesure `mockdiff` de la page Examens blancs (export rendu 1174×1300 vs capture 1174×1400) :
**RMSE 78,4 / 255 → 39/100**, structures 77,5. Le score est tiré vers le bas par ce que la page
ajoute sous la présentation (le composeur d'épreuve) : la comparaison porte sur tout l'écran.

## 0quater. Troisième lot (13 exports) — Ma Progression construite

Le lot contient enfin **Ma Progression** (`86347122`), plus des écrans secondaires.

| Export | Écran | État |
|---|---|---|
| `86347122` | **Ma Progression & Analyse des performances** : 4 indicateurs, courbe hebdomadaire (volume + score /20 + seuil 14), maîtrise par spécialité avec onglets | **construit** : `progression.jsx` réécrit + `progression.css` |
| `dca14e86` | Résultats officiels du concours blanc (analyse par spécialité, plan d'action) | non porté (`results` existant) |
| `6bcaa846` | Fiches mémo & flashcards (sous-page de Cours vidéo & Fiches) | non porté |
| `1de34856`, `33ed0ef2` | Création de dossier / accueil candidat | non porté (`auth.jsx` / `LoginGate`) |
| `aeebb9b5`, `dd54cfef`, `910d9c17` | Palette d'épreuve, résultats disponibles, question manquée | non porté (écrans de quiz) |
| `6eb1cd9c`, `8450309c`, `87957aaf`, `8d2ec00d`, `c8dccd8e` | Imagerie, auscultation, examen physique, intro ARC, dossier patient | simulateur ARC (iframe) |

Données de Ma Progression : mêmes sources que le reste — `my_progression(p_days)` quand la
migration est appliquée, sinon les réponses locales. Les quatre cartes affichent donc des valeurs
réelles : score moyen converti sur 20, volume traité / total du programme, précision de la période,
série de jours. Le bouton « Exporter le bilan » déclenche l'impression (aucun service PDF côté
serveur). La maîtrise par spécialité reste « Autres » tant que la RPC n'est pas branchée : le client
ne connaît pas la spécialité d'une question, seul le serveur la fournit.

Mesure `mockdiff` (export rendu 1174×1600 vs capture) : **RMSE 47,9 / 255 → 63/100**, structures
63,8 — meilleur score des quatre pages construites (Accueil 53, ARC 48, Examens blancs 39).

## 0quinquies. Quatrième lot (13 exports) — accueil « Packs de révision » construit

| Export | Écran | État |
|---|---|---|
| `ff5895af` | **Packs de révision** (accueil de Cours vidéo & Fiches) : rythme de révision, filtres par spécialité, cartes de packs avec contenus et maîtrise | **construit** : `library.jsx` + `library.css`, entrée de nav `library` |
| `f692ca2f` | Page cours (lecteur vidéo, chapitres, onglets fiches/QCM/résumé) | non porté : `packs.jsx` sert déjà ce flux |
| `6b7ee2c1` | Forum médical (fils, arbitrages) | non porté (`forum.jsx`) |
| `036614c5`, `21190197`, `d4c4ceaf` | ARC enseignant / mes cas / session | simulateur et espace enseignant existants |
| `7e922df2`, `4bbacf44`, `6921476a` | Cours détaillé, corrigé, poser une question | écrans de contenu existants |
| `8137543b`, `91353d1b`, `b4a5fd0f` | Profil, divers | `auth.jsx` / compte |

La page ne reprend **aucune valeur de la maquette** : les compteurs de contenus viennent de
`PACK_KINDS` (fichiers réellement en ligne) et de `hasKind` pour la vidéo ; les cartes sans fiche ou
sans carte n'affichent que ce qu'elles ont. Le filtre par spécialité est déduit de `index.series`.

Mesure `mockdiff` (export rendu 1174×1400 vs capture) : **RMSE 68,7 / 255 → 46/100**, structures 63,6.
Récapitulatif des cinq pages construites : Ma Progression 63, Accueil 53, ARC 48, Packs 46,
Examens blancs 39.

## 0sexies. Cinquième lot (13 exports) — accueil « S'entraîner » construit

| Export | Écran | État |
|---|---|---|
| `f023b4d3` | **S'entraîner** (accueil de section) : séries, précision, spécialités, cartes par spécialité | **construit** : `train.jsx` + `train.css`, entrée de nav `train` |
| `a9901154`, `4fff989c` | Créer ma série (spécialités, volume, niveau, typologie) | écran existant `CreateSeries` (logique conservée, mise en page non reprise) |
| `279cda6b` | Séries d'entraînement par spécialité | écran existant `SeriesBrowser` |
| `6ba49284`, `96876f65` | Écran de question QCM 14/50 | écran de quiz existant |
| `1b2f57f9`, `210fdca3`, `98e1d0df` | Portail enseignant (vignette, validation docimologique, stratégie) | espace enseignant existant |
| `78796bb8`, `b9153f17`, `dc509e22`, `784c54c1` | Cours, pré-requis, QCM ARC | écrans existants / simulateur |

La page affiche des données réelles : nombre de séries et de questions déduits de `index.series`,
précision calculée sur les réponses de l'appareil en joignant les identifiants de question des séries
à `state.attempts`. Le rang estimé et les « pôles » de la maquette ne sont pas repris : le client ne
les connaît pas.

Mesure `mockdiff` (export rendu 1174×1500 vs capture) : **RMSE 54,4 / 255 → 57/100**, structures 54,8.

Tableau des six pages construites : Ma Progression 63 · S'entraîner 57 · Accueil 53 · ARC 48 ·
Packs 46 · Examens blancs 39.

## 0septies. Sixième lot (13 exports) + Forum construit

Le lot ne contient que des écrans ARC (constantes, auscultation, biologie, thérapeutique, session)
et une planche de composants UI (`eb5d5018`) — aucun écran de navigation nouveau. Le Forum a donc été
construit à partir des exports précédents (`6b7ee2c1`, `46b5cebe`).

| Écran | Fichier | État |
|---|---|---|
| **Forum & Modération** (accueil) | `forumland.jsx` + `forumland.css` | **construit** : fils réels (`posts`), réponses comptées (`comments`), spécialité déduite du `qid`, tri récents/débattus/votes, filtre par spécialité, CTA vers la discussion existante |
| ARC — constantes, examen, biologie, thérapeutique, session, planche UI | — | simulateur existant (iframe) / documentation |

Les six pages demandées sont désormais couvertes : Accueil, S'entraîner, ARC, Examens blancs,
Cours vidéo & Fiches, Forum, Ma Progression.

Scores `mockdiff` sur les sept pages construites : Ma Progression **63** · Forum **58** ·
S'entraîner **57** · Accueil **53** · ARC **48** · Packs **46** · Examens blancs **39**.

## 0octies. Septième lot : états vides, erreurs, compte

Ce lot ne contient aucune page de navigation : ce sont des **états** (forum vide, notifications
vides, 404, erreur réseau, abonnement, parrainage, groupes, changement d'e-mail) et deux variantes
d'accueil DCEM3.

Ce qui en a été retenu : un composant unique `EmptyState` (icône, titre, phrase, action principale et
secondaire), ajouté à `shell.jsx` et branché sur Forum, S'entraîner, Packs et Ma Progression. Le
forum distingue désormais « aucune question posée » (avec les deux actions de la maquette) de
« aucun résultat pour ce filtre ».

L'écran d'erreur réseau de la maquette n'est pas repris : l'application gère déjà ses erreurs par
message contextuel (`errorText`, `DataError`), et un écran plein « ERR_NETWORK_TIMEOUT » n'apporterait
rien au-delà du bandeau existant.

## 0nonies. Huitième lot : compte, réglages, historique

Encore des écrans de compte et d'administration (réglages généraux, profil, historique, mentions
légales, signalement, suggestions, gestion des accès, spécifications typographiques).

Un seul manquait réellement à l'application : **Historique** (`28b3016d`). Construit dans
`history.jsx` + `history.css`, accessible depuis le bloc « Plus ».

| Écran | Source de données | Détail |
|---|---|---|
| **Historique** | `state.sessions` (une entrée par série terminée) | regroupement par jour (« Aujourd'hui », « Hier », puis date), filtres Tout / Séries / Examens blancs, indicateurs sessions · temps total · moyenne, score n/N et pourcentage coloré (≥70 vert, <40 rouge) |

Mesure `mockdiff` : **RMSE 33,2 / 255 → 74/100**, structures 46,7 — meilleure page de la série.
Classement complet : Historique 74 · Ma Progression 63 · Forum 58 · S'entraîner 57 · Accueil 53 ·
ARC 48 · Packs 46 · Examens blancs 39.

## 0decies. Passe de rapprochement sur les trois pages les plus faibles

Jetons de thème conservés (choix du propriétaire). Seules les mises en page ont bougé.

| Page | Avant | Après | Ce qui a changé |
|---|---|---|---|
| Examens blancs | 39 | **47** | héros sombre (dégradé du primaire) portant les deux indicateurs, rangée de quatre paramètres, corps en deux colonnes 1,55/1 : quotas + règlement à gauche, panneau de configuration avec le formulaire d'examen à droite |
| Packs de cours | 43 | **44** | liste verticale pleine largeur au lieu de la grille 3 colonnes : carte en deux zones (titre + contenus à gauche, bouton à droite) |
| ARC — banque de cas | 48 | **49** | trois colonnes garanties sur grand écran, cartes plus compactes (titre 15,5 px, bouton 34 px, score en gras) |

Mesures faites à taille de maquette identique (1174×1300 et 1174×1400), outil `tools/mockdiff.py`.

**Ce qui plafonne la mesure**, et qu'il faut savoir avant d'en demander plus : le RMSE pixel est
dominé par les grandes surfaces de couleur. Les exports Stitch utilisent `#f4faff` en fond et un
voile bleu sur la barre latérale, alors que le thème retenu est `#f8faf9` / `#e8f6ff` : l'écart
plancher reste d'environ 40 points de RMSE quelle que soit la mise en page. S'y ajoutent des
contenus que la maquette invente et que la base ne contient pas (rangs estimés, quotas par
spécialité, badges de priorité, « 12/18 packs entamés »). Aller plus haut supposerait soit de
changer les jetons, soit d'afficher des chiffres inventés — les deux ont été écartés.

## 0undecies. Compactage ARC et grille des spécialités (Examens blancs)

| Page | Avant | Après | Détail |
|---|---|---|---|
| ARC — banque de cas | 49 | **50** | résumé clinique compacté sur deux lignes bornées (34 px), cas listés à deux titres au lieu de trois, carte plus courte |
| Examens blancs | 47 | **47** (RMSE 67,5 → 67,3) | liste des spécialités passée en grille deux colonnes, lignes de 5 px, barres réduites à 60 px |

Conclusion mesurée : ces retouches valent **+1 point** au mieux. Le reste de l'écart n'est plus
structurel. Deux causes, déjà documentées, le plafonnent : (1) le fond et la barre latérale du thème
retenu (`#f8faf9`, `#e8f6ff`) diffèrent des exports (`#f4faff`), soit un plancher d'environ 40 RMSE
sur des surfaces entières ; (2) les maquettes affichent des données absentes de la base (rangs
estimés, quotas à 120 questions, badges de priorité, « 12/18 packs entamés »). Atteindre 60+
supposerait de changer les jetons ou d'inventer des chiffres — les deux écartés par décision.

Classement final : Historique 74 · Ma Progression 63 · Forum 58 · S'entraîner 57 · ARC 50 ·
Accueil 49 · Examens blancs 47 · Packs 44.

## 1. Navigation : une entrée = un écran existant

Barre latérale à 8 entrées, à parité sur desktop, tablette (rail) et mobile (tiroir).

| # | Entrée | Vue servie | Remarque |
|---|---|---|---|
| 1 | Accueil | `home` (ou `Spécialités` en interface `level`) | l'accueil enseignant reste `home` |
| 2 | S'entraîner (QCM & Séries) | `create` | regroupe `series`, `daily`, `prio`, `pre` dans « Plus » |
| 3 | ARC — Raisonnement Clinique | `arc` | — |
| 4 | Examens blancs | `exam` | — |
| 5 | Cours vidéo & Fiches | `packs` | entrée unique : l'écran porte les deux onglets (vidéos et fiches) |
| 6 | Forum & Modération | `forum` | — |
| 7 | Ma Progression | `progression` | — |

Bloc « Plus » (replié par défaut) : Séries 4 facultés, Révision espacée, Priorités, Recherche,
Groupes, Study time, Avant le cours — plus « Parcours DCEM3 » pour un compte `dcem3`.

Comptes enseignants : trois écrans (`Mes cas`, `Banque des ARC`, `Nouveau cas`), **aucun** widget
Objectif. La garde `viewAllowed()` retire `dcem3` et `parcours` aux interfaces `level` et `residanat`.

## 2. Trois paliers, un seul composant

| Largeur | Barre latérale | Widget Objectif |
|---|---|---|
| ≥ 1024 px | rail complet 256 px, libellés, « Plus » dépliable | carte complète en bas du rail |
| 768–1023 px | rail d'icônes 76 px | pastille `J-37 x/y` dans la barre supérieure |
| ≤ 767 px | tiroir (bouton menu) | pastille `J-37` + carte complète en tête du tiroir |

Les règles du rail sont portées par `.sh-sb` uniquement : le tiroir mobile conserve ses libellés.
CSS ajouté dans `app/src/shell.css`, uniquement à partir des jetons existants (`--acc`, `--card`,
`--line`…), donc le thème sombre suit sans réglage.

## 3. Fichiers

| Fichier | Nature |
|---|---|
| `app/src/shell.jsx` | **nouveau** — barre latérale, barre supérieure, tiroir, widget Objectif, `useObjective()` |
| `app/src/shell.css` | **nouveau** — mise en page des trois paliers |
| `app/src/progression.jsx` | **nouveau** — écran Progression (courbes, KPI, spécialités) |
| `app/src/parcours.jsx` | **nouveau** — écran Parcours DCEM3 (modules, étapes, avancement, vidéos) |
| `app/src/App.jsx` | remplace `TopNav` par `Shell`, ajoute les vues `progression` et `parcours` |
| `app/src/packs.jsx` | accepte `init.kind` (Cours vidéo vs Packs de révision) |
| `supabase/migrations/20261116120000_progression_curves.sql` | progression |
| `supabase/migrations/20261116121000_exam_objective.sql` | objectif / date de concours (graine = date confirmée) |
| `supabase/migrations/20261116122000_dcem3_parcours.sql` | parcours DCEM3 (générateur raffiné) |
| `supabase/migrations/20261116123000_confirm_exam_date_2026_12_23.sql` | confirme la date globale (idempotent) |

## 4. Écran Progression

Deux sources, même forme de sortie : `my_progression(p_days)` quand la migration est appliquée,
sinon repli local sur `state.attempts` (`{d, q, ok, p}`) — l'écran fonctionne hors ligne.

Contenu : 4 indicateurs (réponses, précision, jours d'affilée, points), courbe de précision
quotidienne (ligne) avec barres de volume, courbe des réponses cumulées, tableau par spécialité.
Fenêtres 7 / 30 / 90 jours ; les jours sans réponse restent à zéro (aucune interpolation).
Les graphiques mesurent leur conteneur (`ResizeObserver`) : les libellés gardent leur taille réelle
sur mobile au lieu d'être réduits par la mise à l'échelle SVG.

## 5. Widget Objectif / J-xx

`useObjective(user, state)` appelle `my_objective()` une fois par page et retombe sur un calcul
local si la RPC manque. Le nombre affiché est toujours calculé à partir de la date
(`exam_date − aujourd'hui`, fuseau `Africa/Tunis` côté base), jamais saisi à la main.

Avec la date confirmée du **2026-12-23**, le widget affiche **J-37** et n'ajoute plus la mention
« Date à confirmer » (elle réapparaît si une cible repasse à `is_confirmed = false`).
La constante de repli `FALLBACK_EXAM_DATE` de `shell.jsx` porte la même date : l'écran est juste
même avant l'application de la migration.

Affichage : anneau de progression = part du but hebdomadaire, barre « Cette semaine X/Y questions »,
état de rythme (« rythme tenu » / « prends N/jour »).

## 6. Les trois backends (SQL)

### 6.1 Progression — `20261116120000_progression_curves.sql`

| Objet | Rôle |
|---|---|
| `progress_events` | journal append-only : `user_id, qid, sn, sp, ok, pts, answered_on, answered_at, source` |
| `progress_daily` | agrégat quotidien par compte (`answered, correct, points`) |
| `progress_events_rollup()` | trigger **au niveau instruction** (table de transition) : recalcule une fois par lot les journées touchées |
| `check_answers(p_items)` | **même corps qu'en production**, plus un bloc d'écriture en fin de traitement (erreur avalée) |
| `my_progression(p_days)` | séries quotidiennes complètes, totaux, série de jours, meilleure journée, spécialités |
| `progression_backfill(p_user)` | reprise de `user_progress.data->'attempts'`, `service_role` uniquement |

Clé `(user_id, qid, answered_on)` : une question compte une fois par jour, donc un renvoi du même
item ne gonfle pas la courbe. Score stocké binaire (juste/faux) ; le score partiel reste côté client.

### 6.2 Objectif — `20261116121000_exam_objective.sql`

| Objet | Rôle |
|---|---|
| `exam_targets` | date de concours par `(track, faculty)` ; `NULL` = tous ; index unique sur `(coalesce(track,'*'), coalesce(faculty,'*'))` |
| `user_objectives` | date personnelle éventuelle + buts quotidien / hebdomadaire / minutes |
| `my_objective()` | cible la plus précise, `days_left`, buts, semaine en cours, rythme |
| `set_my_objective(...)` | réglage personnel (RPC) |
| `exam_target_upsert(...)` | écriture des dates, `service_role` uniquement |

Graine : `Concours national de résidanat`, **2026-12-23**, `is_confirmed = true`,
source « Date officielle confirmée par l'équipe (2026-11-16) ».
`20261116123000_confirm_exam_date_2026_12_23.sql` rejoue la même valeur de façon idempotente : il
sert si l'environnement avait déjà la date provisoire, et ne touche ni aux cibles par faculté ni aux
dates personnelles des élèves (une date personnelle reste prioritaire, par conception).

### 6.3 Parcours DCEM3 — `20261116122000_dcem3_parcours.sql`

| Objet | Rôle |
|---|---|
| `parcours` | programme (`track`, `faculty`, `slug`, `title`, `status`) |
| `parcours_modules` | un module par spécialité |
| `parcours_items` | étapes : `qcm` (une par cours), `video` (quand des épisodes sont réellement servis) |
| `parcours_progress` | avancement par élève et par étape |
| `parcours_course_specialty(track)` | index d'un cours : `(sn, sp, title)` — spécialité dominante + **titre réel du programme** |
| `my_parcours()` | parcours + modules + étapes + statuts de l'élève |
| `parcours_mark(item, status, score, minutes)` | pointage contrôlé (parcours vivant du parcours de l'élève) |
| `parcours_dcem3_sync()` | graine **rejouable** : construit ou répare modules et étapes |

### 6.4 RLS (matrice courte)

| Table | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `progress_events` | ses lignes | aucun droit client (journal alimenté par `check_answers`) |
| `progress_daily` | ses lignes | aucun droit client (trigger) |
| `exam_targets` | tout compte connecté | `service_role` via `exam_target_upsert` |
| `user_objectives` | ses lignes | ses lignes (l'app passe par `set_my_objective`) |
| `parcours`, `parcours_modules`, `parcours_items` | parcours vivant de son parcours (ou enseignant) | aucun droit client |
| `parcours_progress` | ses lignes | ses lignes + `parcours_mark` |

Aucune politique ajoutée sur `qbank`, `course_videos`, `course_video_qcm` : le refus par défaut
reste la règle.

## 7. Revue des modules DCEM3 générés

### 7.1 Composition réelle (44 cours → 15 modules)

| Module | Cours | sn |
|---|---|---|
| Réanimation | 10 | 5, 10, 17, 27, 28, 30, 48, 59, 61, 67 |
| Néphrologie | 5 | 33, 46, 55, 68, 71 |
| Chirurgie générale | 4 | 4, 34, 54, 57 |
| Hématologie | 4 | 2, 3, 62, 64 |
| Pneumo-allergologie | 4 | 7, 9, 43, 72 |
| Cardiologie | 3 | 22, 38, 51 |
| Gastrologie | 3 | 24, 35, 41 |
| Neurologie-Neurochirurgie | 3 | 1, 16, 26 |
| Gynécologie | 2 | 53, 60 |
| Endocrinologie | 1 | 20 |
| Maladies Infectieuses | 1 | 52 |
| Médecine interne | 1 | 37 |
| Ophtalmologie | 1 | 56 |
| Orthopédie - Rhumatologie | 1 | 58 |
| Pédiatrie | 1 | 75 |

### 7.2 Mapping des spécialités : vérifié, pas retouché

- 12 cours portent un **second** libellé de spécialité, mais il représente 0 à 2 % de leurs questions
  (cas extrême : cours 27, « Réanimation » 98 % / « Cardiologie » 2 %) : ce sont des questions
  égarées, pas des cours mixtes.
- Aucun cours dont la spécialité dominante tombe sous 60 % de ses questions → la règle « spécialité
  la plus fréquente » est stable.
- Les 15 libellés retenus sont **tous** présents dans `specialty_map` (jointure complète, 15/15).
- Seules les pseudo-spécialités « Examens blancs J1/J2 » sont écartées (elles auraient sinon absorbé
  29 cours).

### 7.3 Vidéos : ce qui manquait, ce qui est corrigé

| Situation | Cours | Traitement |
|---|---|---|
| Épisodes servis par `/api/video` (R2) | 31 cours, 8 à 24 épisodes | étape `video` créée, libellée « Vidéo — <titre du cours> (N ép.) » |
| Replay YouTube uniquement | 12 cours : 16, 17, 24, 27, 28, 61, 62, 64, 68, 71, 72, 75 | pas d'étape en base (aucune ligne `course_videos`), mais **bouton « Vidéo » sur l'étape QCM** : `hasKind(sn,'video')` couvre R2 **et** replay |
| Aucune vidéo | 1 cours : 67 (Traumatisme crânien) | aucun bouton vidéo — rien n'est inventé |

Deux corrections de fond par rapport à la version initiale du générateur :

1. **Libellés** : les étapes prennent le titre réel du programme (`qbank.tp`, 44 cours sur 44) au lieu
   du titre de vidéo (`course_videos.course_title`, 31 cours sur 44) ou d'un « Cours N ».
2. **Règle vidéo** : une étape `video` n'est créée que si `course_videos.url` est renseigné (les
   lignes sans URL ne produisent plus d'étape morte) ; les cours à replay sont couverts par l'écran,
   pas par une ligne inventée en base.

Écran (`app/src/parcours.jsx`) : bouton « Faire » (QCM), bouton « Vidéo » sur les cours qui en ont
une, bouton « Regarder » sur les étapes vidéo, et « Marquer fait » pour l'avancement. Le repli (migration
absente) affiche la liste des cours avec les mêmes boutons.

## 8. Vérifications déjà faites ici

- Migrations rejouées sur un Postgres 16 local (schémas bouchons : `auth`, `qbank`, `track_courses`,
  `specialty_map`, `course_videos`, `user_progress`, `question_views`, `user_answered`,
  `choice_stats`) : aucune erreur, y compris avec la quatrième migration.
- `check_answers` journalise et déduplique ; agrégat quotidien correct ; `my_progression` renvoie
  une série pleine et le bon rythme.
- `my_objective` renvoie **2026-12-23 / 37 jours / `is_confirmed = true`** ; après remise manuelle
  d'une date provisoire, le rejeu de `20261116123000_…` restaure la bonne valeur sans doublon
  (1 seule cible).
- `parcours_dcem3_sync()` : modules + étapes nommées par titre réel, étape vidéo seulement si URL,
  second passage sans ajout ; `parcours_mark` passe une étape à `done` ; cloisonnement vérifié sous
  le rôle `authenticated` (0 ligne d'un autre compte).
- `vite build` : succès sans le harnais de capture.
- Captures desktop 1440 / tablette 900 / mobile 390 / tiroir / « Plus » déplié : voir pièces jointes.

## 8bis. Cadre de section et mesure avec `tools/mockdiff.py`

Chaque écran commence désormais par le même en-tête : sur-titre (`PageHead`), titre, sous-titre
borné à 68 caractères, filet de séparation. Les écrans qui utilisaient déjà `.page-h` en héritent
sans modification ; `Accueil` a reçu cet en-tête et son bandeau a été rétrogradé en titre de
bandeau (un seul `h1` par page).

Mesure d'écart : `tools/mockdiff.py` compare une capture de maquette à une capture de
l'implémentation (RMSE pixels + RMSE structures, planche côte à côte et carte de différence).

```bash
# une capture par section, même largeur, même état de données
python3 tools/mockdiff.py maquettes/accueil.png captures/accueil.png --out mockdiff-out
python3 tools/mockdiff.py maquettes/examens-blancs.png captures/examens-blancs.png --out mockdiff-out
```

Convention de nommage utilisée ici : `captures/<section>-<largeur>.png`, sections
`accueil`, `entrainer`, `arc`, `examens-blancs`, `cours-video`, `packs`, `forum`, `progression`,
`parcours-dcem3`. Le code de sortie vaut 1 au-delà d'un RMSE de 40 : c'est un seuil de revue, pas
un test bloquant.

Mesure faite à cette étape (avant/après l'ajout de l'en-tête sur Accueil, même viewport 1440×1000) :
RMSE pixels **63 → score 51/100**, RMSE structures 59 (score 7) — l'écart porte sur le décalage
vertical introduit par l'en-tête, comportement attendu. Aucune capture de maquette Stitch n'étant
disponible dans le dépôt, la fidélité par section reste à mesurer : il suffit de déposer les PNG.

## 9. À faire après un « go »

1. `apply_migration` dans cet ordre :
   `…_progression_curves`, `…_exam_objective`, `…_dcem3_parcours`, `…_confirm_exam_date_2026_12_23`.
2. Vérifier (lecture seule) :
   ```sql
   select proname from pg_proc
    where proname in ('my_progression','my_objective','my_parcours','parcours_mark','parcours_dcem3_sync');
   select exam_date, is_confirmed, source from public.exam_targets;   -- 2026-12-23 | t | …
   select public.parcours_dcem3_sync();                              -- total_modules = 15, ~75 étapes
   ```
3. Reprise de l'historique : `select public.progression_backfill();` (`service_role`), rejouable.
4. Fusion du code : la règle du dépôt s'applique (migration appliquée au moment de la fusion).

## 10. Points ouverts

- **Journalisation dans `check_answers`** : le corps est inchangé, mais la fonction écrit désormais
  une ligne par réponse. Variante possible : une RPC `progress_log` appelée par le client.
- **Score partiel** : la base ne stocke que juste/faux ; les courbes de points sont des points pleins.
- **Module « Réanimation » (10 cours)** : c'est la ventilation réelle de `qbank.sp`. Si vous voulez un
  découpage plus fin (urgences / toxico / métabolique), il faut une table de sous-modules — à décider.
- **Cours 67** : aucune vidéo (ni épisode, ni replay) ; rien n'est affiché, volontairement.
- **`parcours_dcem3_sync()`** à rejouer si le programme DCEM3 change (idempotent, n'écrase pas
  l'avancement).
