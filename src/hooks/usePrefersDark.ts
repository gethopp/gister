import { useSyncExternalStore } from 'react';

const query = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }
  const mql = window.matchMedia(query);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia(query).matches;
}

/**
 * Tracks the OS color-scheme preference, re-rendering when it flips.
 *
 * Mirrors the `mode="system"` behavior of the Astryx `<Theme>` provider so
 * non-Astryx surfaces (e.g. CodeMirror, which brings its own theme) can follow
 * light/dark alongside the rest of the app.
 */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
