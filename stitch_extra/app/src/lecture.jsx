import React, { useEffect, useMemo, useState } from 'react'
import './lecture.css'

/* ===== 3.5 — Lecteur d'un cours vidéo (maquette « cours en vidéo ») =====
   En-tête (item, référentiel, statut), titre, bandeau auteur/durée/collège, actions,
   lecteur avec chapitres et contrôles, encart « point discriminant », onglets de bas de page.
   Règle : aucune donnée inventée. Chaque champ vient de `lecture` ; ce qui manque est omis
   (ou affiché « — »), et sans source vidéo le lecteur affiche explicitement l'absence. */

const TABS = ['Résumé du cours', 'Transcriptions & diapositives', 'Mes prises de notes', 'Questions au professeur']
const fmt = s => {
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  const m = Math.floor(n / 60), r = Math.round(n % 60)
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function LecturePlayer({ index, init, go }) {
  const L = (init && init.lecture) || {}
  const course = init && init.course != null ? init.course : null
  const subject = (index.subjects || []).find(s => s.no === course)
  const title = L.title || (subject ? subject.name : 'Cours vidéo')

  const [tab, setTab] = useState(0)
  const [notes, setNotes] = useState('')
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    if (course == null) return
    try { setNotes(localStorage.getItem(`notes:${course}`) || '') } catch {}
  }, [course])

  const save = () => {
    if (course == null) return
    try { localStorage.setItem(`notes:${course}`, notes); setSavedAt(new Date()) } catch {}
  }
  const noteCount = notes.trim() ? notes.trim().split('\n').filter(Boolean).length : 0

  const chapters = useMemo(() => (Array.isArray(L.chapters) ? L.chapters : []), [L.chapters])
  const duration = fmt(L.duration_seconds)
  const examYears = Array.isArray(L.exam_years) ? L.exam_years : []
  const pills = [
    L.item ? `${L.item}` : null,
    L.reference ? L.reference : null,
    L.validated ? `Validé ${L.validated}` : null,
  ].filter(Boolean)

  return (
    <div className="lec">
      <div className="lec-top">
        <button type="button" className="ghost" onClick={() => go({ name: 'videos' })}>← Cours vidéo</button>
        <span className="lec-crumb">
          {(L.specialty || '—')}{subject ? ` · ${subject.name}` : ''}
        </span>
      </div>

      <header className="lec-head">
        {!!pills.length && <div className="lec-pills">{pills.map(p => <span key={p}>{p}</span>)}</div>}
        <h1>{title}</h1>
        <p className="lec-meta">
          {L.author && <span>{L.author}</span>}
          {duration && <span>{duration}</span>}
          {L.college && <span>{L.college}</span>}
        </p>
        <div className="lec-acts">
          {L.pdf && <button type="button" className="soft" onClick={() => window.open(L.pdf, '_blank', 'noreferrer')}>Télécharger le PDF{L.pdf_size ? ` · ${L.pdf_size}` : ''}</button>}
          <button type="button" className="soft" onClick={() => go({ name: 'flashcards', course })}>Fiches mémo</button>
          {subject && typeof subject.n === 'number' && (
            <button type="button" className="primary" onClick={() => go({ name: 'qcm-screen', ids: (index.series.find(s => s.sn === course) || {}).q })}>
              S’entraîner ({subject.n} QCM)
            </button>
          )}
        </div>
      </header>

      <section className="lec-player" aria-label="Lecteur vidéo">
        {L.source ? (
          <video controls poster={L.poster || undefined} src={L.source} preload="metadata" />
        ) : (
          <div className="lec-void">
            <span className="lec-play" aria-hidden="true">▶</span>
            <b>Vidéo non disponible</b>
            <p>La source de ce cours n’est pas encore publiée.</p>
          </div>
        )}
        {!!chapters.length && (
          <div className="lec-chap">
            <div className="lec-chap-track">
              {chapters.map((c, i) => (
                <span key={i} title={c.title} style={{ left: `${Math.min(100, Math.max(0, (Number(c.at) || 0) * 100))}%` }} />
              ))}
            </div>
            <ol className="lec-chap-list">
              {chapters.map((c, i) => (
                <li key={i}>
                  <span className="n">{i + 1}</span>
                  <span className="t">{c.title}</span>
                  {fmt(c.at_seconds) && <span className="at">{fmt(c.at_seconds)}</span>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {(L.callout_title || L.callout_text) && (
        <aside className="lec-callout">
          <div className="lec-callout-h">
            <b>{L.callout_title || 'Point clé'}</b>
            {!!examYears.length && <span>{`Tombé en ${examYears.join(', ')}`}</span>}
          </div>
          {L.callout_text && <p>{L.callout_text}</p>}
        </aside>
      )}

      <nav className="lec-tabs" aria-label="Contenus du cours">
        {TABS.map((t, i) => (
          <button key={t} type="button" className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>
            {t}
            {i === 2 && noteCount > 0 && <em>{noteCount}</em>}
            {i === 3 && Number(L.questions_count) > 0 && <em>{L.questions_count}</em>}
          </button>
        ))}
      </nav>

      <section className="lec-panel">
        {tab === 0 && (
          Array.isArray(L.summary) && L.summary.length ? (
            <ul className="lec-sum">{L.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
          ) : <p className="muted small">Résumé non publié pour ce cours.</p>
        )}
        {tab === 1 && (
          Array.isArray(L.slides) && L.slides.length ? (
            <ul className="lec-sum">{L.slides.map((s, i) => <li key={i}>{s}</li>)}</ul>
          ) : <p className="muted small">Transcriptions et diapositives non publiées pour ce cours.</p>
        )}
        {tab === 2 && (
          <div className="lec-notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Tes notes sur ce cours…" aria-label="Mes prises de notes" rows={6} />
            <div className="lec-notes-b">
              <button type="button" className="primary" onClick={save}>Enregistrer</button>
              <span className="muted small">
                {noteCount} ligne{noteCount > 1 ? 's' : ''}{savedAt ? ` · enregistré à ${savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ' · conservé sur cet appareil'}
              </span>
            </div>
          </div>
        )}
        {tab === 3 && <p className="muted small">Aucune question posée au professeur pour ce cours.</p>}
      </section>
    </div>
  )
}
