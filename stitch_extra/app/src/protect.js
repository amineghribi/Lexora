// Protection légère des pages de révision et de l'ARC (affichées dans un iframe sandbox) :
// impression et « Enregistrer en PDF » désactivés (page blanche), copie, glisser-déposer et raccourcis d'impression / d'enregistrement bloqués.
// Une capture d'écran ou une copie à la main restent possibles : aucun site ne peut l'empêcher. Le filigrane au pseudo de l'élève sert à remonter à la source.
const CSS = '<style>@media print{html,body{display:none!important}}html,body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}input,textarea{-webkit-user-select:text;user-select:text}</style>'
const JS = '<script>(function(){var s=function(e){e.preventDefault();return false};'
  + '["copy","cut","dragstart","contextmenu"].forEach(function(n){document.addEventListener(n,s)});'
  + 'document.addEventListener("keydown",function(e){var k=(e.key||"").toLowerCase();if((e.ctrlKey||e.metaKey)&&(k==="p"||k==="s"||k==="u"||k==="c"||k==="x"||k==="a")){e.preventDefault()}});'
  + 'window.addEventListener("beforeprint",function(){document.documentElement.style.display="none"});'
  + 'window.addEventListener("afterprint",function(){document.documentElement.style.display=""})})();</script>'
export function protect(html) {
  const add = CSS + JS
  if (typeof html !== 'string') return html
  // On n'insère qu'au tout début du document (après un éventuel doctype) : chercher « <head> » plus loin tombe
  // dans le code JavaScript des pages (ex. l'ARC) et casse la page.
  const lead = html.slice(0, 4000)
  const m = lead.match(/^\s*<!doctype[^>]*>/i)
  if (m) return m[0] + add + html.slice(m[0].length)
  return add + html
}
