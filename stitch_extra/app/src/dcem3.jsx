import React, { useMemo, useState } from 'react'

// DCEM3 par faculté : chaque faculté a ses propres certificats, ses volumes horaires et, quand la faculté le publie, ses semestres.
// h = heures publiées par la faculté. c = cours de résidanat liés : rapprochement par titre, indicatif.
const ACUTE = [5, 17, 22, 27, 28, 30, 29, 48, 49, 59, 61, 65, 67]
const INTERNE = [2, 3, 37, 55, 58, 62, 64, 29]
const FACS = [
  {
    id: 'monastir', name: 'Monastir', src: 'Site de la faculté (page DCEM3). Semestre par certificat non précisé.',
    secs: [{ certs: [
      { t: 'Synthèse clinique', h: '30 h', c: [62, 72, 7], note: 'Tous les cours peuvent y servir.' },
      { t: 'Médecine d’urgence', h: '20 h', c: ACUTE },
      { t: 'Médecine intensive (réanimation, anesthésie-réanimation)', h: '20 h + 20 h', c: [5, 27, 28, 30, 46, 48, 61, 66, 68, 71] },
      { t: 'Médecine interne, gériatrie, immunologie', h: 'interne 14 h, gériatrie 8 h, immunologie 6 h', c: [...INTERNE, 38], note: 'Pas de cours spécifique sur la gériatrie : le cours 38 n’en couvre qu’une partie.' },
      { t: 'Psychiatrie, pédopsychiatrie, sexologie', h: '20 h, 10 h, 8 h', c: [63, 69, 70], note: 'Pédopsychiatrie et sexologie : pas encore de cours.' },
      { t: 'Pédiatrie, néonatologie, chirurgie pédiatrique, génétique', h: '36 h, 14 h, 12 h, 10 h', c: [7, 8, 19, 40, 75], note: 'Néonatologie, génétique et chirurgie pédiatrique : pas encore de cours.' },
      { t: 'Prévention et épidémiologie, médecine du travail, médecine légale, droit et éthique', h: '26 h, 26 h, 12 h, 24 h', c: [75, 44], note: 'Prévention seulement (vaccinations, IST). Le reste : pas encore de cours.' },
      { t: 'Anglais médical', h: '20 h', c: [] },
    ] }],
  },
  {
    id: 'tunis', name: 'Tunis', src: 'Liste des certificats DCEM3 sur le site de la faculté. Volumes horaires et semestres non lus (carnet PDF illisible).',
    secs: [{ certs: [
      { t: 'Synthèse clinique', c: [62, 72, 7] },
      { t: 'Médecine aiguë', c: ACUTE },
      { t: 'Médecine interne et gériatrie', c: [...INTERNE, 38], note: 'Pas de cours spécifique sur la gériatrie.' },
      { t: 'Psychiatrie', c: [63, 69, 70] },
      { t: 'Gynécologie-obstétrique', c: [13, 14, 18, 32, 53, 60] },
      { t: 'Ophtalmologie', c: [56] },
      { t: 'ORL et stomatologie', c: [12, 42] },
      { t: 'Dermatologie', c: [], note: 'Pas encore de cours.' },
      { t: 'Médecine du travail', c: [], note: 'Pas encore de cours.' },
      { t: 'Médecine légale et éthique', c: [], note: 'Pas encore de cours.' },
      { t: 'Anglais médical', c: [] },
    ] }],
  },
  {
    id: 'sousse', name: 'Sousse', src: 'Emploi du temps DCEM3 S10 P1 (semaine du 2 au 7/11/2026), seule source lue : liste incomplète, sans volumes horaires.',
    secs: [{ certs: [
      { t: 'Synthèse clinique', c: [62, 72, 7], note: 'Séances vues : purpura (TBL), tuberculose, asthme bronchique.' },
      { t: 'Gériatrie', c: [38], note: 'Vieillissement cardiovasculaire, pharmacothérapie de la personne âgée. Pas de cours spécifique.' },
      { t: 'Santé communautaire, santé publique, addictions', c: [75, 44], note: 'Prévention seulement. Le reste : pas encore de cours.' },
    ] }],
  },
  {
    id: 'sfax', name: 'Sfax', src: 'Tableaux « Programme DCEM3 » du site de la faculté (semestres 1 et 2), lus à l’écran. Crédits et coefficients non relevés.',
    secs: [
      { label: 'Semestre 1', total: 'Enseignement théorique 208 h · stage 180 h', certs: [
        { t: 'Médecine légale, droit et éthique médicale', h: '36 h', c: [], note: 'Pas encore de cours.' },
        { t: 'Maladies professionnelles', h: '36 h', c: [], note: 'Pas encore de cours.' },
        { t: 'Médecine communautaire et préventive', h: '44 h', c: [75, 44], note: 'Prévention seulement (vaccinations, IST).' },
        { t: 'Médecine interne, génétique, immunologie', h: '56 h', c: INTERNE, note: 'Génétique : pas encore de cours.' },
        { t: 'Anglais', h: '20 h', c: [] },
        { t: 'Option au choix (UEO)', h: '16 h', c: [] },
      ] },
      { label: 'Semestre 2', total: 'Enseignement théorique 141 h · stage clinique 180 h', certs: [
        { t: 'Synthèse clinique', c: [62, 72, 7], note: 'Tous les cours peuvent y servir.' },
        { t: 'Médecine aiguë', h: '46 h', c: ACUTE },
        { t: 'Gériatrie et promotion de la santé', h: '26 h', c: [38, 75], note: 'Pas de cours spécifique sur la gériatrie.' },
        { t: 'Anglais', h: '20 h', c: [] },
      ] },
    ],
  },
]

// Programmes détaillés publiés par les facultés. c = cours de résidanat liés (rapprochement par titre, indicatif ; vide = pas de cours). g = sous-module ou service.
const T = (t, c = [], g) => ({ t, c, g })
const SCT_M = [T('L’hypertension artérielle', [38]), T('Douleur abdominale aiguë', [4, 54, 57]), T('Conduite à tenir devant une dysphagie', [24]), T('Conduite à tenir devant les vomissements'), T('Les ictères de l’adulte', [41]), T('Conduite à tenir devant une augmentation des transaminases', [35]), T('Les métrorragies', [53]), T('Les anémies', [3]), T('Les hypercalcémies', [37]), T('Conduite à tenir devant une fièvre au long cours'), T('Les adénopathies superficielles : orientation diagnostique', [2]), T('Les vaccinations', [75]), T('Les œdèmes', [55]), T('L’anurie', [46]), T('Conduite à tenir devant une perte de connaissance brève'), T('Les céphalées', [16]), T('L’œil rouge', [56]), T('Les splénomégalies', [64]), T('Les interactions médicamenteuses'), T('Conduite à tenir devant une hémoptysie'), T('La dyspnée'), T('Conduite à tenir devant une masse abdominale'), T('Les douleurs', [61]), T('Conduite à tenir devant une arthralgie', [58]), T('Les hématuries', [33])]
const INT_M = [
  ...[['Les états septiques graves', [30]], ['L’état de choc cardiogénique', [27]], ['Les solutés de remplissage', [71]], ['Les comas', [17]], ['Les hyponatrémies', [71]], ['États de mal convulsifs', [26]], ['Les œdèmes pulmonaires', []], ['Asthme aigu grave', [7]], ['L’oxygénothérapie', []], ['Les envenimations (scorpioniques et vipérines)', []], ['Les noyades', []], ['Les intoxications par le CO, les organophosphorés et les psychotropes', [48]], ['SARI : pneumopathies graves et SDRA', []]].map(([x, c]) => T(x, c, 'Réanimation médicale (20 h)')),
  ...[['Anesthésie : principes de base de pharmacologie des anesthésiques', []], ['Prise en charge du traumatisme thoracique fermé', []], ['Prise en charge du brûlé grave à la phase aiguë', [10]], ['Traumatisme crânien', [67]], ['Polytraumatisme', [59]], ['État de choc hémorragique', [28]], ['Hémorragies digestives', [34]], ['Pré-éclampsies et éclampsies', [60]], ['Diagnostic et prise en charge d’un état de mort encéphalique', []], ['Principe du « damage control »', []], ['Pancréatite aiguë', []]].map(([x, c]) => T(x, c, 'Anesthésie-réanimation (20 h)')),
  ...[['Pharmacologie des catécholamines', []], ['Anesthésique', []]].map(([x, c]) => T(x, c, 'Pharmacologie (4 h)')),
]
const SCT_T = [['CAT devant un amaigrissement et une asthénie', [], 'Médecine interne'], ['CAT devant des lésions d’allure purpurique', [62], 'Médecine interne'], ['CAT devant des œdèmes', [55], 'Médecine interne'], ['CAT devant les pertes de connaissance', [], 'Médecine interne'], ['CAT devant une fièvre prolongée inexpliquée', [], 'Médecine interne'], ['CAT devant des douleurs abdominales récurrentes de l’adulte', [], 'Médecine interne'], ['Démarche diagnostique devant une hyperéosinophilie', [], 'Médecine interne'], ['CAT devant une polysérite', [], 'Médecine interne'], ['CAT devant des céphalées', [16], 'Neurologie'], ['CAT devant des crises épileptiques', [26], 'Neurologie'], ['CAT devant un déficit moteur d’installation récente', [1], 'Neurologie'], ['Syndrome méningé : CAT en urgence', [52], 'Neurologie'], ['Démarche diagnostique devant une douleur thoracique non traumatique', [22], 'Cardiologie'], ['CAT devant les troubles du rythme', [], 'Cardiologie'], ['CAT devant une HTA essentielle', [38], 'Cardiologie'], ['CAT devant une toux', [], 'Pneumologie'], ['CAT devant une hémoptysie', [], 'Pneumologie'], ['CAT devant des lombalgies ou rachialgies', [], 'Rhumatologie'], ['CAT devant des douleurs articulaires', [58], 'Rhumatologie'], ['CAT devant une hypercalcémie', [37], 'Médecine interne'], ['CAT devant une dysphagie', [24], 'Gastrologie'], ['CAT devant des vomissements', [], 'Médecine interne'], ['CAT devant un syndrome hémorragique', [], 'Hématologie clinique'], ['CAT devant un syndrome polyuro-polydipsique', [20], 'Endocrinologie'], ['CAT devant un prurit', [], 'Dermatologie'], ['L’antibiothérapie : principes généraux', [], 'Infectieux'], ['CAT devant une hémorragie digestive', [34], 'Chirurgie générale'], ['CAT devant une hématurie', [33], 'Néphrologie'], ['CAT devant une dyspnée', [], 'Pneumo-réanimation'], ['CAT devant une cytolyse hépatique', [35], 'Gastrologie'], ['Troubles de l’équilibre et de la marche', [], 'ORL']].map(a => T(...a))
const AIG_T = [
  ...[['Troubles acido-basiques du milieu intérieur', [68]], ['Insuffisance hépatique aiguë grave', []], ['Détresse respiratoire ou insuffisance respiratoire aiguë', []], ['Décompensation aiguë de BPCO', [9]], ['Asthme aigu grave', [7]], ['Pneumonie grave communautaire', [43]], ['État de mal épileptique', [26]], ['Intoxications aiguës : approche spécifique', [48]], ['Brûlures', [10]], ['Électrisation', []], ['Infections associées aux soins', []], ['Noyade', []], ['Toxi-infections alimentaires graves', []], ['Fin de vie en réanimation', []]].map(([x, c]) => T(x, c, 'Réanimation médicale')),
  ...[['États de choc : approche spécifique', [27, 28, 30]], ['Arrêt cardiaque', [5]], ['Nutrition artificielle', []], ['Traumatisme thoracique fermé', []], ['Prophylaxie périopératoire de la maladie thromboembolique veineuse', [51]], ['Troubles hydro-électrolytiques', [71]], ['Réanimation d’un donneur d’organes en arrêt cardiaque', []], ['Douleur postopératoire de l’adulte', [61]], ['Le polytraumatisé', [59]], ['Prévention de l’infection postopératoire', []], ['Détresse respiratoire', []], ['Évaluation du risque préopératoire', []], ['Traumatisme crânien', [67]], ['Principes de l’anesthésie', []]].map(([x, c]) => T(x, c, 'Anesthésie-réanimation chirurgicale')),
  ...[['Douleur aiguë aux urgences', [61]], ['Organisation des soins d’urgence, préhospitalier et hospitalier', []], ['Intoxications aiguës : approche générale', [48]], ['Envenimations par animaux terrestres et marins', []], ['Approche d’un coma aux urgences', [17]], ['Indications et modalités de la VNI aux urgences', []], ['États de choc : approche générale et prise en charge aux urgences', [27, 28, 30]], ['Traumatisme crânien léger aux urgences', [67]]].map(([x, c]) => T(x, c, 'Médecine d’urgence')),
]
const PROG = {
  monastir: {
    sct: { title: 'Synthèse clinique (certificat 5)', src: 'Site de la faculté : module 1 « Synthèse clinique » (30 h), 25 thèmes.', themes: SCT_M },
    med: { title: 'Médecine intensive (certificat 6)', src: 'Site de la faculté : réanimation médicale (20 h), anesthésie-réanimation (20 h) et pharmacologie (4 h).', themes: INT_M },
  },
  tunis: {
    sct: { title: 'Synthèse clinique', src: 'Plan 2016-2017 de la faculté (31 cours), retrouvé sur un site tiers (examanet.net) : peut avoir changé depuis. À confronter au programme de cette année.', themes: SCT_T },
    med: { title: 'Médecine aiguë', src: 'Plan 2016-2017 de la faculté, retrouvé sur un site tiers (examanet.net) : titres traduits de l’anglais, peut avoir changé depuis. À confronter au programme de cette année.', themes: AIG_T },
  },
}
PROG.sousse = { sct: { title: 'Synthèse clinique', src: 'Seule source lue : l’emploi du temps DCEM3 S10 P1 (2 au 7/11/2026), avec 3 séances de synthèse clinique. Programme complet non publié sur les pages lues.', themes: [T('Purpura (TBL)', [62]), T('Tuberculose', [72]), T('Asthme bronchique', [7])] } }
const progKey = ce => (ce.t.startsWith('Synthèse clinique') ? 'sct' : /^Médecine (intensive|aiguë)/.test(ce.t) ? 'med' : null)

function SctView({ fac, th, nm, index, go, onStart, back }) {
  let lastG = null
  const shown = th.themes.filter(x => x.c.length)
  const withC = shown.length
  return (
    <div>
      <div className="page-h">
        <h1>{th.title} · {fac.name}</h1>
        <p className="muted small">{th.src} Les liens avec les cours sont indicatifs : confronte-les à ton programme.</p>
        <p className="small"><b>{withC} thème{withC > 1 ? 's' : ''} du programme</b> ({th.themes.length - withC} sans cours chez nous, non affiché{th.themes.length - withC > 1 ? 's' : ''}) ont au moins un cours de résidanat lié.</p>
        <button type="button" className="ghost" onClick={back}>Retour aux certificats</button>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {shown.map(x => { const head = x.g && x.g !== lastG ? x.g : null; lastG = x.g || lastG; return (
          <React.Fragment key={x.g + x.t}>
          {head && <h2 style={{ margin: '10px 0 0', fontSize: 18 }}>{head}</h2>}
          <section className="card">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
              <b>{x.t}</b>
            </div>
            {(
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 8 }}>
                {x.c.map(n => (
                  <li key={n} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{nm(n)}</span>
                    <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                      {index.pre && index.pre[n] && <button type="button" className="ghost" onClick={() => onStart({ title: `Avant le cours : ${nm(n)}`, ids: index.pre[n], subjectHint: n, mode: 'immediate', kind: 'pre' })}>QCM</button>}
                      <button type="button" className="ghost" onClick={() => go({ name: 'packs', course: n })}>Fiches et vidéos</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          </React.Fragment>
        ) })}
      </div>
    </div>
  )
}

export function Dcem3View({ go, onStart, index, fac: myFac }) {
  const names = useMemo(() => new Map(index.subjects.map(s => [s.no, s.name])), [index])
  const nm = n => String(names.get(n) || `Cours ${n}`).replace(/\s{2,}.*$/, '').trim()
  const [fid, setFid] = useState(() => myFac || (() => { try { return localStorage.getItem('dcem3_fac') || '' } catch { return '' } })())
  const fac = FACS.find(f => f.id === fid)
  const [prog, setProg] = useState(null)
  const pick = id => { setFid(id); try { if (id) localStorage.setItem('dcem3_fac', id); else localStorage.removeItem('dcem3_fac') } catch { /* stockage indisponible */ } }

  if (!fac) return (
    <div>
      <div className="page-h">
        <h1>DCEM3</h1>
        <p className="muted">Choisis ta faculté : tu verras la synthèse clinique et la médecine intensive / aiguë de DCEM3 de ta faculté, avec les cours de résidanat liés.</p>
      </div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {FACS.map(f => <button key={f.id} type="button" className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => pick(f.id)}><b>{f.name}</b></button>)}
      </div>
    </div>
  )

  if (prog && PROG[fac.id] && PROG[fac.id][prog]) return <SctView fac={fac} th={PROG[fac.id][prog]} nm={nm} index={index} go={go} onStart={onStart} back={() => setProg(null)} />

  return (
    <div>
      <div className="page-h">
        <h1>DCEM3 · {fac.name}</h1>
        <p className="muted small">{fac.src} Les liens avec les cours sont indicatifs : confronte-les à ton programme.</p>
        <button type="button" className="ghost" onClick={() => pick('')}>Changer de faculté</button>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {fac.secs.map((sec, i) => (
          <div key={i} style={{ display: 'grid', gap: 12 }}>
            {sec.label && <h2 style={{ margin: '8px 0 0', fontSize: 20 }}>{sec.label}{sec.total && <span className="muted small" style={{ fontWeight: 400 }}> · {sec.total}</span>}</h2>}
            {sec.certs.map(ce => (
              <section key={ce.t} className="card">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0, fontSize: 18 }}>{ce.t}</h3>
                  {ce.h && <span className="small muted">{ce.h}</span>}
                </div>
                {ce.note && <p className="muted small" style={{ margin: '6px 0 0' }}>{ce.note}</p>}
                {progKey(ce) && PROG[fac.id] && <button type="button" className="primary" style={{ marginTop: 8 }} onClick={() => setProg(progKey(ce))}>Programme détaillé : {PROG[fac.id][progKey(ce)].themes.filter(x => x.c.length).length} thèmes avec cours</button>}
                {ce.c.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 8 }}>
                    {ce.c.map(n => (
                      <li key={n} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{nm(n)}</span>
                        <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                          {index.pre && index.pre[n] && <button type="button" className="ghost" onClick={() => onStart({ title: `Avant le cours : ${nm(n)}`, ids: index.pre[n], subjectHint: n, mode: 'immediate', kind: 'pre' })}>QCM</button>}
                          <button type="button" className="ghost" onClick={() => go({ name: 'packs', course: n })}>Fiches et vidéos</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        ))}
      </div>
      <p className="muted small">Support de révision construit à partir des cours et des QCM de résidanat ; ce n’est pas le programme officiel de ta faculté ni un avis médical.</p>
    </div>
  )
}
