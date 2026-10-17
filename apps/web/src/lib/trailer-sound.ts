'use client';
import { useSyncExternalStore } from 'react';

// Background trailers start muted (browsers block sound without a click). Once someone turns
// sound on, later trailers start with sound too, and the choice is remembered.
const KEY = 'animepoodle-trailer-sound';
const listeners = new Set<() => void>();
let on = false;
try {
  on = typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
} catch {}

export function setTrailerSound(next: boolean) {
  on = next;
  try {
    localStorage.setItem(KEY, next ? '1' : '0');
  } catch {}
  listeners.forEach((l) => l());
}
export function useTrailerSound() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on,
    () => false,
  );
}
/** Sends a command to a YouTube iframe player (needs enablejsapi=1 in its URL). */
export function youtubeCommand(frame: HTMLIFrameElement | null, func: 'mute' | 'unMute') {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
}
