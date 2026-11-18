import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { translate } from './translations';
import type { Lang } from './translations';

export type { Lang };

const STORAGE_KEY = 'lexora-lang';
const LANGS: Lang[] = ['fr', 'en', 'ar'];

function readLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS.includes(saved as Lang)) return saved as Lang;
  } catch {
    /* storage may be unavailable */
  }
  return 'fr';
}

let currentLang: Lang = 'fr';

/** Locale for Intl formatting in helpers that run outside React. */
export function getLocale(): string {
  if (currentLang === 'ar') return 'ar-TN';
  if (currentLang === 'en') return 'en-US';
  return 'fr-TN';
}

interface Ctx {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (text: string) => string;
  rtl: boolean;
}

const C = createContext<Ctx | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const rtl = lang === 'ar';

  useEffect(() => {
    currentLang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage may be unavailable */
    }
  }, [lang, rtl]);

  const setLang = useCallback((next: Lang) => {
    if (LANGS.includes(next)) setLangState(next);
  }, []);
  const t = useCallback((text: string) => translate(text, lang), [lang]);

  return <C.Provider value={{ lang, setLang, t, rtl }}>{children}</C.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/* -------------------------------------------------------------------------- */
/* DOM translation                                                            */
/* -------------------------------------------------------------------------- */

const originalText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Map<string, string>>();
const TRANSLATED_ATTRS = ['placeholder', 'title', 'aria-label'];

function skipTextNode(node: Text): boolean {
  const el = node.parentElement;
  if (!el || el.closest('script, style, [data-no-i18n]')) return true;
  if (el.classList.contains('material-symbols-outlined')) return true;
  // Language names and live data must never be translated.
  if (el.closest('[data-lang], [data-user-name], [data-org-name], [data-org-name-inline], [data-today]')) return true;
  return false;
}

function walkText(root: HTMLElement, visit: (node: Text) => void): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  nodes.forEach(visit);
}

/** Translate every static text node and attribute inside a mounted fragment. */
export function translateDom(root: HTMLElement, lang: Lang): void {
  walkText(root, (node) => {
    if (skipTextNode(node)) return;
    let source = originalText.get(node);
    if (source === undefined) {
      source = node.nodeValue ?? '';
      if (!source.trim()) return;
      originalText.set(node, source);
    }
    const leading = source.match(/^\s*/)?.[0] ?? '';
    const trailing = source.match(/\s*$/)?.[0] ?? '';
    node.nodeValue = leading + translate(source.trim(), lang) + trailing;
  });

  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    TRANSLATED_ATTRS.forEach((attr) => {
      let store = originalAttrs.get(el);
      if (!store) {
        store = new Map();
        originalAttrs.set(el, store);
      }
      const current = el.getAttribute(attr);
      if (!store.has(attr) && current) store.set(attr, current);
      const source = store.get(attr);
      if (source) el.setAttribute(attr, translate(source, lang));
    });
  });
}

/** Wire every language selector inside a mounted fragment. */
export function wireLangChips(root: HTMLElement, setLang: (lang: Lang) => void): void {
  root.querySelectorAll<HTMLElement>('[data-lang], button').forEach((el) => {
    const attr = el.dataset.lang;
    let lang: Lang | null = null;
    if (attr && LANGS.includes(attr as Lang)) {
      lang = attr as Lang;
    } else {
      const label = (el.textContent ?? '').trim();
      if (label === 'Français' || label === 'FR') lang = 'fr';
      else if (label === 'العربية' || label === 'عربي' || label === 'العربى') lang = 'ar';
      else if (label === 'English' || label === 'EN') lang = 'en';
    }
    if (lang) el.onclick = () => setLang(lang as Lang);
  });
}

/** Reflect the active language on selector chips. */
export function paintLangChips(root: HTMLElement, lang: Lang): void {
  root.querySelectorAll<HTMLElement>('[data-lang]').forEach((el) => {
    const active = el.dataset.lang === lang;
    el.classList.toggle('bg-surface-container-lowest', active);
    el.classList.toggle('text-on-surface', active);
    el.classList.toggle('shadow-sm', active);
    el.classList.toggle('font-semibold', active);
  });
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(getLocale()).format(n);
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(getLocale(), options ?? {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(value);
}
