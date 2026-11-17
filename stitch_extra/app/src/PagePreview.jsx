import React, { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { openPdf, pdfDocUrl } from './pdf.js'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

const docs = new Map()
const getDoc = key => {
  if (!docs.has(key)) {
    const p = pdfDocUrl(key).then(url => pdfjs.getDocument(url).promise)
    p.catch(() => docs.delete(key)) // permet de réessayer après un refus ou une panne
    docs.set(key, p)
  }
  return docs.get(key)
}

const STOP = new Set('dans pour avec sans sont etre avoir cette cela plus moins tout tous toute toutes entre chez dont ainsi donc comme mais aussi peut peuvent leur leurs elle elles ils nous vous vers sous sur par une des les aux est ete fait faire lors alors apres avant tres bien quel quels quelle quelles lequel lesquels laquelle'.split(' '))
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const prefix = w => w.slice(0, 5)

// Mots-clés des bonnes réponses (poids fort) et de l’énoncé (contexte)
function keywords(texts) {
  const set = new Set()
  for (const t of texts) {
    for (const w of t.split(/[^\p{L}\p{N}]+/u)) {
      const n = norm(w)
      if (n.length >= 4 && !STOP.has(n)) set.add(prefix(n))
    }
  }
  return set
}

function computeHighlights(words, ans, ctx) {
  // découpe en phrases (fin de phrase : . ; : ! ?)
  const sents = []
  let cur = []
  words.forEach((w, i) => {
    cur.push(i)
    if (/[.;:!?]$/.test(w.raw) && cur.length >= 4) { sents.push(cur); cur = [] }
  })
  if (cur.length) sents.push(cur)
  const scored = sents.map(ix => {
    const seen = new Set()
    let sc = 0
    for (const i of ix) {
      const n = words[i].n
      if (n.length < 4) continue
      const p = prefix(n)
      if (seen.has(p)) continue
      if (ans.has(p)) { sc += 2; seen.add(p) } else if (ctx.has(p)) { sc += 1; seen.add(p) }
    }
    return { ix, sc, norm: sc / Math.sqrt(ix.length) }
  })
  const best = Math.max(0, ...scored.map(s => s.norm))
  const marked = new Array(words.length).fill(false)
  if (best <= 0) return marked
  scored.filter(s => s.sc >= 3 && s.norm >= Math.max(0.5, best * 0.6))
    .sort((a, b) => b.norm - a.norm).slice(0, 3)
    .forEach(s => s.ix.forEach(i => { marked[i] = true }))
  return marked
}

export default function PagePreview({ cp, answerTexts, ctxTexts }) {
  const [page, setPage] = useState(cp[1] || 1)
  const [state, setState] = useState('load')
  const [total, setTotal] = useState(0)
  const wrap = useRef(), box = useRef(), canvas = useRef()
  const key = cp[0]

  useEffect(() => { setPage(cp[1] || 1) }, [cp[0], cp[1]])

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        setState('load')
        const doc = await getDoc(key)
        if (dead) return
        setTotal(doc.numPages)
        const p = Math.min(Math.max(1, page), doc.numPages)
        const pg = await doc.getPage(p)
        const base = pg.getViewport({ scale: 1 })
        const width = Math.min(wrap.current.clientWidth || 800, 900)
        const scale = width / base.width
        const vp = pg.getViewport({ scale })
        const dpr = window.devicePixelRatio || 1
        const c = canvas.current
        c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr)
        c.style.width = vp.width + 'px'; c.style.height = vp.height + 'px'
        const ctx = c.getContext('2d')
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        await pg.render({ canvasContext: ctx, viewport: vp }).promise
        if (dead) return
        const tc = await pg.getTextContent()
        const words = []
        for (const it of tc.items) {
          if (!it.str || !it.str.trim()) continue
          const t = pdfjs.Util.transform(vp.transform, it.transform)
          const fs = Math.hypot(t[2], t[3])
          const wpx = it.width * scale
          const len = it.str.length || 1
          const re = /\S+/g
          let m
          while ((m = re.exec(it.str))) {
            const n = norm(m[0])
            if (!n) continue
            words.push({ n, raw: m[0], x: t[4] + (m.index / len) * wpx, w: (m[0].length / len) * wpx, y: t[5] - fs, h: fs * 1.15 })
          }
        }
        const ans = keywords(answerTexts), ctxSet = keywords(ctxTexts)
        const marked = computeHighlights(words, ans, ctxSet)
        const b = box.current
        b.innerHTML = ''
        let firstY = null
        const rects = []
        words.forEach((w, i) => {
          if (!marked[i]) return
          const last = rects[rects.length - 1]
          if (last && Math.abs(last.y - w.y) < w.h * 0.5 && w.x - (last.x + last.w) < w.h * 1.2) {
            last.w = Math.max(last.w, w.x + w.w - last.x)
          } else rects.push({ x: w.x, y: w.y, w: w.w, h: w.h })
        })
        rects.forEach(r => {
          const d = document.createElement('div')
          d.className = 'hl'
          d.style.cssText = `left:${r.x - 2}px;top:${r.y}px;width:${r.w + 4}px;height:${r.h}px`
          b.appendChild(d)
          if (firstY === null || r.y < firstY) firstY = r.y
        })
        wrap.current.scrollTop = firstY === null ? 0 : Math.max(0, firstY - 60)
        setState('ok')
      } catch (e) {
        console.error(e)
        if (!dead) setState('err')
      }
    })()
    return () => { dead = true }
  }, [key, page])

  return (
    <div className="pv">
      <div className="pv-bar">
        <button className="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
        <span>Cours · page {page}{total ? ` / ${total}` : ''}</span>
        <button className="ghost" disabled={total && page >= total} onClick={() => setPage(p => p + 1)}>→</button>
        <a className="link" href="#" target="_blank" rel="noreferrer" onClick={e => openPdf(e, key, page)}>Ouvrir le PDF</a>
      </div>
      {state === 'err' && <p className="muted">Impossible d’afficher la page. Connecte-toi, ou réessaie dans quelques minutes si tu as ouvert beaucoup de cours.</p>}
      <div className="pv-wrap" ref={wrap}>
        <div className="pv-page">
          <canvas ref={canvas} />
          <div className="pv-hl" ref={box} />
        </div>
        {state === 'load' && <p className="muted pv-load">Chargement de la page…</p>}
      </div>
    </div>
  )
}
