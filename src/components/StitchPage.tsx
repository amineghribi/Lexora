import { useEffect, useRef } from 'react';
import { paintLangChips, translateDom, useI18n } from '../lib/i18n';

type Setup = (root: HTMLElement) => void;

interface Props {
  html: string;
  setup?: Setup;
  /** Change this to re-run `setup` after the underlying data changes. */
  setupKey?: string | number;
}

/**
 * Renders an untouched Stitch HTML fragment and runs a DOM setup callback.
 * The wrapper uses `display: contents` so the Stitch layout owns the page.
 * Static text is translated after mount and whenever the language changes.
 */
export default function StitchPage({ html, setup, setupKey = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { lang } = useI18n();

  useEffect(() => {
    if (ref.current && setup) setup(ref.current);
    // `setup` is a fresh closure on every render; setupKey controls when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, setupKey]);

  useEffect(() => {
    if (!ref.current) return;
    translateDom(ref.current, lang);
    paintLangChips(ref.current, lang);
  }, [html, lang, setupKey]);

  return <div ref={ref} className="contents" dangerouslySetInnerHTML={{ __html: html }} />;
}
