import { useEffect, useRef } from 'react';

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
 */
export default function StitchPage({ html, setup, setupKey = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && setup) setup(ref.current);
    // `setup` is a fresh closure on every render; setupKey controls when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, setupKey]);

  return <div ref={ref} className="contents" dangerouslySetInnerHTML={{ __html: html }} />;
}
