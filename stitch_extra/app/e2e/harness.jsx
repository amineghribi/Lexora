import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import '../src/a11y.css'
import { Shell, buildObjective } from '../src/shell.jsx'
import { ExamSession } from '../src/examsession.jsx'
import { ExamResults } from '../src/examresults.jsx'
import { SearchPage } from '../src/searchpage.jsx'
import { AskModal } from '../src/askmodal.jsx'
import { ReportModal } from '../src/reportmodal.jsx'
import { NotificationsDrawer } from '../src/notifications.jsx'
import { StateBlock } from '../src/states.jsx'
import { Home } from '../src/home.jsx'
import { TrainPage } from '../src/train.jsx'
import { ArcHub } from '../src/arcplay.jsx'
import { ExamsPage } from '../src/exams.jsx'
import { LibraryPage } from '../src/library.jsx'
import { CoursePage } from '../src/coursepage.jsx'
import { VideosList } from '../src/videoslist.jsx'
import { PreReadPage } from '../src/preread.jsx'
import { Flashcards } from '../src/flashcards.jsx'
import { LecturePlayer } from '../src/lecture.jsx'
import { ForumPage } from '../src/forumland.jsx'
import { ProgressionView } from '../src/progression.jsx'
import { HistoryPage } from '../src/history.jsx'
import { ProfilePage } from '../src/profile.jsx'
import { SettingsPage } from '../src/settings.jsx'
import { ParrainagePage } from '../src/parrainage.jsx'
import { SubscriptionPage } from '../src/subscription.jsx'
import { AdminReports } from '../src/adminreports.jsx'
import { AdminSuggestions } from '../src/adminsuggestions.jsx'
import { AdminAccess } from '../src/adminaccess.jsx'
import { TeacherBank } from '../src/teachbank.jsx'
import { ArcCaseEditor } from '../src/arcedit.jsx'
import { Amphi } from '../src/amphi.jsx'
import { AmphiProjection } from '../src/amphiproject.jsx'

/* Harnais E2E : monte les composants réels avec un routeur minimal qui reproduit les transitions
   de App.jsx. Le backend est simulé par les fixtures ; aucun écran n'est réimplémenté. */

const QUESTIONS = [
  { id: 'Q1', stem: 'Douleur thoracique avec sus-décalage de ST : geste prioritaire ?', options: ['Angioplastie primaire', 'Thrombolyse', 'Coronarographie à 24 h'], correct: 0, sp: 'Cardiologie' },
  { id: 'Q2', stem: 'Marqueur de nécrose myocardique ?', options: ['Troponine', 'CRP', 'BNP'], correct: 0, sp: 'Cardiologie' },
  { id: 'Q3', stem: 'Complication mécanique typique entre J3 et J5 ?', options: ['Rupture de pilier', 'Péricardite', 'Anévrisme'], correct: 0, sp: 'Cardiologie' },
]
const SUBJECTS = [
  { no: 228, n: 412, name: 'Syndromes coronariens aigus & SCA ST+' },
  { no: 232, n: 380, name: 'Insuffisance cardiaque chronique' },
  { no: 205, n: 300, name: 'Asthme & BPCO' },
]
const INDEX = {
  subjects: SUBJECTS,
  series: [{ sp: 'Cardiologie', sn: 228, q: ['Q1', 'Q2'] }, { sp: 'Cardiologie', sn: 232, q: ['Q3'] }, { sp: 'Pneumologie', sn: 205, q: ['Q4'] }],
  pre: { 228: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], 232: ['Q6', 'Q7', 'Q8', 'Q9', 'Q10'] },
  cases: [],
  uniq: 1092,
}
const now = Date.now(), day = 86400000
const STATE = { attempts: Array.from({ length: 24 }, (_, i) => ({ q: 'Q' + (i % 12), ok: i % 3 !== 0, t: now - (i % 6) * day, d: new Date(now - (i % 6) * day).toISOString().slice(0, 10) })), cards: {} }
const PROFILE = { username: 'e2e', full_name: 'Candidat E2E' }
const SCOPE = { track: 'residanat', faculty: 'tunis' }
const ACCESS = { status: 'paid', plan: 'Accès complet', since: '2026-09-01', until: '2027-06-30' }
const LECTURE = {
  specialty: 'Cardiologie', item: 'ITEM 228 · CNEM', reference: 'ESC / STCCV 2023', validated: 'Session 2025',
  title: 'Prise en charge des SCA avec sus-décalage de ST', author: 'Pr. M. Ben Salem', duration_seconds: 2900,
  college: 'Collège National de Cardiologie', chapters: [{ title: 'Introduction', at: 0.02 }, { title: 'ECG', at: 0.4 }],
  callout_title: 'Point discriminant au concours', exam_years: [2021, 2023], callout_text: 'Choisir la reperfusion selon le délai.',
  summary: ['Reperfusion la plus précoce possible.', 'Surveiller rythme et hémodynamique.'], questions_count: 12,
}
const NOTIFS = [{ id: 1, type: 'réponse', title: 'Réponse à ta question', text: 'Un modérateur a répondu.', at: Date.now(), read: false, target: { name: 'home' } }]
const published = []
window.__published = published

const objective = buildObjective({ exam_date: '2026-12-23', label: 'Concours', is_confirmed: true, goals: { daily_questions: 20, weekly_questions: 140, daily_minutes: 60 }, week: { answered: 6, target: 140 }, pace: { avg_per_day: 4, needed_per_day: 20, on_track: false } }, STATE)

function Harness() {
  const initial = new URLSearchParams(location.search).get('s') || 'home'
  const [view, setView] = useState({ name: initial })
  const go = v => setView(v)
  const noop = () => {}

  return (
    <Shell view={view} go={go} iface="residanat" objective={objective}
      user={{ id: 'u' }} profile={PROFILE} access={ACCESS} scope={SCOPE}>
      <main className="wrap">
        {new URLSearchParams(location.search).get('nav') === '1' && (
        <nav aria-label="harnais">
          {['home', 'train', 'arc', 'exams', 'library', 'course', 'videos', 'pre-requis', 'flashcards', 'lecture', 'forum', 'progression', 'history', 'profile', 'settings', 'parrainage', 'abonnement', 'search', 'ask', 'report', 'notifications', 'states', 'exam-session', 'moderation', 'suggestions', 'access', 'teachbank', 'arcedit', 'amphi', 'amphi-projection']
            .map(n => <button key={n} type="button" onClick={() => go({ name: n })}>{`aller-${n}`}</button>)}
        </nav>)}

        {view.name === 'train' && <TrainPage index={INDEX} state={STATE} go={go} onStart={noop} />}
        {view.name === 'arc' && <ArcHub go={go} specialty={null} onStart={noop} />}
        {view.name === 'exams' && <ExamsPage index={INDEX} state={STATE} onStart={noop} />}
        {view.name === 'library' && <LibraryPage index={INDEX} go={go} />}
        {view.name === 'course' && <CoursePage index={INDEX} go={go} init={{ course: 228 }} />}
        {view.name === 'videos' && <VideosList index={INDEX} go={go} />}
        {view.name === 'pre-requis' && <PreReadPage index={INDEX} go={go} onStart={noop} />}
        {view.name === 'flashcards' && <Flashcards index={INDEX} go={go} init={{ course: 228, deck: [] }} />}
        {view.name === 'lecture' && <LecturePlayer index={INDEX} go={go} init={{ course: 228, lecture: LECTURE }} />}
        {view.name === 'progression' && <ProgressionView index={INDEX} state={STATE} objective={objective} go={go} onStart={noop} />}
        {view.name === 'history' && <HistoryPage state={STATE} go={go} />}
        {view.name === 'profile' && <ProfilePage state={STATE} profile={PROFILE} scope={SCOPE} access={ACCESS} objective={objective} go={go} />}
        {view.name === 'settings' && <SettingsPage go={go} state={STATE} />}
        {view.name === 'parrainage' && <ParrainagePage profile={PROFILE} go={go} init={{ campaign: { title: 'Campagne spéciale', text: 'Accès offert pour les nouveaux inscrits.' } }} />}
        {view.name === 'abonnement' && <SubscriptionPage access={ACCESS} go={go} />}

        {view.name === 'exam-results' && <ExamResults init={view} go={go} />}
        {view.name === 'search' && <SearchPage index={INDEX} go={go} onStart={noop} />}
        {view.name === 'forum' && <ForumPage index={INDEX} go={go} />}
        {view.name === 'ask' && <AskModal questionId="Q1" onClose={() => go({ name: 'exam-session' })} onPublish={async p => { published.push(p) }} />}
        {view.name === 'exam-session' && <ExamSession init={{ ref: 'blanc', questions: QUESTIONS, duration_minutes: 180 }} go={go} />}
        {view.name === 'report' && <ReportModal questionId="Q1" onClose={() => go({ name: 'exam-session' })} onSubmit={async r => { published.push(r) }} />}
        {view.name === 'home' && <Home index={INDEX} state={STATE} setState={noop} go={go} access={ACCESS} onStart={noop} objective={objective} scope={SCOPE} profile={PROFILE} />}
        {view.name === 'notifications' && <NotificationsDrawer items={NOTIFS} go={go} onClose={() => go({ name: 'exam-session' })} />}
        {view.name === 'moderation' && <AdminReports go={go} />}
        {view.name === 'suggestions' && <AdminSuggestions go={go} />}
        {view.name === 'amphi' && <Amphi role="teacher" go={go}
          initial={{ sid: 'demo', code: '969626', step: 'history', results: [
            { choice: 'Douleur thoracique constrictive depuis 40 minutes', votes: 18 },
            { choice: 'Dyspnée d’effort avec orthopnée', votes: 7 },
            { choice: 'Palpitations avec malaise', votes: 3 },
          ] }}
          options={[
            'Douleur thoracique constrictive depuis 40 minutes',
            'Dyspnée d’effort avec orthopnée',
            'Palpitations avec malaise',
          ]} />}
        {view.name === 'amphi-projection' && <AmphiProjection caseInfo={{
          patient: 'Patient #ARC-2025-084 · M. Slim B., 58 ans',
          motif: 'Douleur rétrosternale aiguë constrictive',
          step: 'Étape 1/5 : Interrogatoire & triage d’urgence',
          vitals: [
            { label: 'Pression artérielle', value: '155/95', unit: 'mmHg', alert: true },
            { label: 'Fréquence cardiaque', value: '102', unit: 'bpm', alert: true },
            { label: 'Saturation SpO2', value: '96', unit: '%' },
            { label: 'Température', value: '37.1', unit: '°C' },
            { label: 'Glasgow', value: '15', unit: '/15' },
            { label: 'Glycémie', value: '8.2', unit: 'mmol/L' },
          ],
          history: 'Début à 06h30, douleur intense 9/10, arrivée à 08h45, pâleur et sueurs profuses.',
        }} demo={{
          state: { code: '969626', step: 'history', status: 'open', step_started_at: new Date(Date.now() - 96000).toISOString(), participants: 28, votes: 28 },
          results: [
            { choice: 'Douleur thoracique constrictive depuis 40 minutes', votes: 18 },
            { choice: 'Dyspnée d’effort avec orthopnée', votes: 7 },
            { choice: 'Palpitations avec malaise', votes: 3 },
          ],
        }} />}
        {view.name === 'arcedit' && <ArcCaseEditor caseId={null} onDone={() => {}} onCancel={() => {}} />}
        {view.name === 'teachbank' && <TeacherBank
          spec={{ label: 'Cardiologie' }}
          cases={[
            { id: 'c1', title: 'SCA ST+ chez un patient de 58 ans', motif_id: 'douleur_thoracique', status: 'published', updated_at: '2026-11-14T10:00:00Z' },
            { id: 'c2', title: 'Dyspnée aiguë avec orthopnée', motif_id: 'dyspnee', status: 'draft', updated_at: '2026-11-12T10:00:00Z' },
            { id: 'c3', title: 'Palpitations avec malaise', motif_id: 'palpitations', status: 'archived', updated_at: '2026-10-30T10:00:00Z' },
          ]}
          err={null}
          onPreview={() => {}} />}
        {view.name === 'access' && <AdminAccess go={go} />}
        {view.name === 'states' && <StateBlock kind="error" action="Réessayer" onAction={() => go({ name: 'exam-session' })} />}
      </main>
    </Shell>
  )
}

/* backend simulé */
const orig = window.fetch.bind(window)
window.fetch = (u, o) => {
  const s = String(u)
  if (s.includes('/api/pack')) {
    return Promise.resolve(new Response(
      '<article><h1>Cours 228 — Syndromes coronariens aigus</h1><p>Plan du cours : définition, épidémiologie, physiopathologie, diagnostic, prise en charge.</p><h2>1. Définition</h2><p>Syndrome coronarien aigu avec sus-décalage persistant du segment ST.</p><h2>2. Prise en charge</h2><p>Reperfusion la plus précoce possible ; angioplastie primaire si disponible dans les délais.</p><h2>3. Surveillance</h2><p>Rythme, hémodynamique, complications mécaniques.</p></article>',
      { status: 200, headers: { 'Content-Type': 'text/html' } }))
  }
  if (s.includes('search_questions')) {
    return Promise.resolve(new Response(JSON.stringify([
      { id: 'Q9', sp: 'Cardiologie', stem: 'Énoncé trouvé par la recherche', snippet: 'extrait de correction' },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }
  if (s.includes('/rest/v1/') || s.includes('/rpc/') || s.includes('/data/') || s.includes('supabase.co')) {
    return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }
  return orig(u, o)
}

createRoot(document.getElementById('root')).render(<Harness />)
