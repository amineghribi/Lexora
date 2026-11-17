import React, { useState } from 'react'
import { useUiContent, uiOrMockup, EXAMENS_BLANCS_MOCKUP } from './mockup.js'
import { ExamBlanc } from './extra.jsx'
import './exams.css'

const MODES = [
  ['deferred', 'Conditions strictes', 'Aucune correction avant la remise : la note tombe à la fin de l’épreuve.', 'Recommandé concours national'],
  ['immediate', 'Mode pédagogique', 'Correction au fil des questions, pour comprendre chaque erreur.', ''],
]

/* ===== Examens blancs (maquette Stitch b492b916) =====
   Présentation de l'épreuve officielle (paramètres, quotas par spécialité, règlement), puis le
   composeur d'épreuve existant. Les textes viennent de `ui_content('examens_blancs')` ; le repli
   local est identique à la graine. Les compteurs de la maquette (rang, score, candidats) sont des
   valeurs de démonstration : elles ne sont jamais calculées à partir des données de l'élève. */

const Audit = ({ title, children }) => (
  <section className="ex-sec" aria-label={title}>
    <div className="ex-sec-h">
      <h2>{title}</h2>
      {children}
    </div>
  </section>
)

export function ExamsPage({ index, state, onStart }) {
  const [mode, setMode] = useState('deferred')
  const ui = useUiContent('examens_blancs')
  const M = uiOrMockup(ui, EXAMENS_BLANCS_MOCKUP) || EXAMENS_BLANCS_MOCKUP
  const kpis = M.kpis && M.kpis.length ? M.kpis : EXAMENS_BLANCS_MOCKUP.kpis
  const params = M.params && M.params.length ? M.params : EXAMENS_BLANCS_MOCKUP.params
  const specs = M.specialties && M.specialties.length ? M.specialties : EXAMENS_BLANCS_MOCKUP.specialties
  const rules = M.rules && M.rules.length ? M.rules : EXAMENS_BLANCS_MOCKUP.rules
  const total = specs.reduce((a, x) => a + (Number(x.n) || 0), 0) || 1

  return (
    <div className="ex-page">
      <div className="ex-hero">
        <div className="ex-hero-txt">
          <span className="ex-eyebrow">Épreuve officielle calibrée · jury national</span>
          <h1>{M.title || EXAMENS_BLANCS_MOCKUP.title}</h1>
          <p className="ex-session">{M.session || EXAMENS_BLANCS_MOCKUP.session}</p>
          <div className="ex-badges">
            {(M.badges || EXAMENS_BLANCS_MOCKUP.badges).map(b => <span key={b} className="ex-badge on-dark">{b}</span>)}
            <span className="ex-badge on-dark">Départ simulé</span>
            <span className="ex-badge on-dark">Session active</span>
          </div>
        </div>
        <div className="ex-kpis" role="list">
          {kpis.map(k => (
            <div className="ex-kpi" role="listitem" key={k.k}>
              <span className="k">{k.k}</span>
              <b>{k.v}</b>
              {k.s && <span>{k.s}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="ex-params">
        {params.map(p => (
          <article className="ex-param" key={p.k}>
            <span className="k">{p.k}</span>
            <b>{p.v}</b>
            <span className="s">{p.s}</span>
            {p.note && <span className="n">{p.note}</span>}
          </article>
        ))}
      </div>

      <div className="ex-body">
        <div className="ex-col">
          <section className="ex-card" aria-labelledby="ex-specs">
            <div className="ex-card-h">
              <div>
                <h2 id="ex-specs">Spécialités couvertes par le tirage</h2>
                <p className="muted small">Distribution proportionnelle aux quotas nationaux officiels.</p>
              </div>
              <span className="ex-badge">{specs.length} disciplines</span>
            </div>
            <ul className="ex-specs">
              {specs.map(x => (
                <li key={x.sp}>
                  <span className="sp"><b>{x.sp}</b>{x.note && <i>{x.note}</i>}</span>
                  <span className="bar"><i style={{ width: `${Math.round(((Number(x.n) || 0) / total) * 100)}%` }} /></span>
                  <span className="n">{x.n}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="ex-card" aria-labelledby="ex-rules">
            <div className="ex-card-h">
              <div>
                <h2 id="ex-rules">Règlement et dispositifs anti-fraude</h2>
                <p className="muted small">Tout manquement entraîne la caducité automatique de la copie.</p>
              </div>
            </div>
            <ol className="ex-rules">
              {rules.map((r, i) => (
                <li key={r.t}>
                  <span className="num">{i + 1}</span>
                  <span><b>{r.t}</b><span className="muted small">{r.d}</span></span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="ex-side" aria-label="Configuration de l’épreuve">
          <div className="ex-side-h">
            <b>Configuration de l’épreuve</b>
            <span className="muted small">Paramétrage d’immersion du candidat</span>
          </div>
          <fieldset className="ex-cfg">
            <legend className="muted small">Mode de correction</legend>
            {MODES.map(([v, t, d, tag]) => (
              <label key={v} className={`ex-cfg-card${mode === v ? ' on' : ''}`}>
                <input type="radio" name="exam-mode" value={v} checked={mode === v} onChange={() => setMode(v)} />
                <span className="r" aria-hidden="true" />
                <span className="t">
                  <b>{t}</b>
                  <span className="muted small">{d}</span>
                  {tag && <span className="tag">{tag}</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <ExamBlanc index={index} state={state} onStart={onStart} initialMode={mode} />
        </aside>
      </div>
    </div>
  )
}