import React, { useEffect, useState } from 'react'
import './account.css'

/* ===== 4.2 Réglages =====
   Préférences réellement appliquées à l'interface et conservées sur l'appareil :
   densité, taille de texte, animations réduites. Rien n'est proposé s'il n'a pas d'effet. */

const KEY = 'ui_prefs'
const DEFAUT = { density: 'confort', scale: 'normal', motion: 'auto' }

export function readPrefs() {
  try { return { ...DEFAUT, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) } } catch { return { ...DEFAUT } }
}

export function applyPrefs(p) {
  try {
    const r = document.documentElement
    r.dataset.density = p.density
    r.dataset.scale = p.scale
    r.dataset.motion = p.motion
  } catch {}
}

export function SettingsPage({ go, state }) {
  const [p, setP] = useState(readPrefs)

  useEffect(() => { applyPrefs(p); try { localStorage.setItem(KEY, JSON.stringify(p)) } catch {} }, [p])

  const set = (k, v) => setP(o => ({ ...o, [k]: v }))
  const attempts = (state && state.attempts) || []

  return (
    <div className="acc">
      <div className="acc-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'profile' })}>← Profil</button>
        <span className="acc-crumb">Réglages</span>
      </div>

      <header className="acc-head">
        <div>
          <span className="acc-eyebrow">Compte</span>
          <h1>Réglages</h1>
          <p className="muted small">Ces préférences sont enregistrées sur cet appareil.</p>
        </div>
      </header>

      <section className="acc-card">
        <div className="acc-card-h"><b>Affichage</b></div>

        <div className="acc-field">
          <div><b>Densité</b><small className="muted">Espacement des listes et des cartes.</small></div>
          <div className="acc-seg" role="group" aria-label="Densité">
            {[['confort', 'Confort'], ['compact', 'Compact']].map(([v, l]) => (
              <button key={v} type="button" className={p.density === v ? 'on' : ''} onClick={() => set('density', v)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="acc-field">
          <div><b>Taille du texte</b><small className="muted">S’applique à toute l’interface.</small></div>
          <div className="acc-seg" role="group" aria-label="Taille du texte">
            {[['normal', 'Normal'], ['large', 'Grand'], ['xl', 'Très grand']].map(([v, l]) => (
              <button key={v} type="button" className={p.scale === v ? 'on' : ''} onClick={() => set('scale', v)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="acc-field">
          <div><b>Animations</b><small className="muted">Réduire les transitions et les déplacements.</small></div>
          <div className="acc-seg" role="group" aria-label="Animations">
            {[['auto', 'Normales'], ['reduced', 'Réduites']].map(([v, l]) => (
              <button key={v} type="button" className={p.motion === v ? 'on' : ''} onClick={() => set('motion', v)}>{l}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="acc-card">
        <div className="acc-card-h"><b>Données</b><span className="muted small">{attempts.length.toLocaleString('fr')} réponses enregistrées</span></div>
        <p className="muted small">
          Les réponses et les préférences restent sur cet appareil. Aucune donnée n’est envoyée pour ces réglages.
        </p>
        <div className="acc-acts">
          <button type="button" className="soft" onClick={() => setP({ ...DEFAUT })}>Réinitialiser les préférences</button>
          <button type="button" className="primary" onClick={() => go({ name: 'profile' })}>Retour au profil</button>
        </div>
      </section>
    </div>
  )
}
