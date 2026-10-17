'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  defaultTaste,
  formats,
  type Feedback,
  type Format,
  type Taste,
  type Title,
  type TitleLanguage,
  displayTitle,
} from '@animepoodle/shared';
import { validTitle } from './local-catalog';
import { keyOf } from './story';
import { libraryStatuses, statusLabel, type LibraryEntry, type LibraryStatus } from './library';

export interface SectionMeta {
  format: Format;
  label: string;
  plural: string;
  origin: string;
  verb: 'watch' | 'read';
}
export const sections: SectionMeta[] = [
  { format: 'Anime', label: 'Anime', plural: 'anime', origin: 'Japan', verb: 'watch' },
  {
    format: 'Donghua',
    label: 'Chinese anime',
    plural: 'Chinese anime',
    origin: 'China',
    verb: 'watch',
  },
  { format: 'Manga', label: 'Manga', plural: 'manga', origin: 'Japan', verb: 'read' },
  { format: 'Manhwa', label: 'Manhwa', plural: 'manhwa', origin: 'Korea', verb: 'read' },
  { format: 'Manhua', label: 'Manhua', plural: 'manhua', origin: 'China', verb: 'read' },
];
export const sectionOf = (format: Format) => sections.find((s) => s.format === format)!;

const PROFILE_KEY = 'animepoodle-profile';
const SECTION_KEY = 'animepoodle-section';
const PREFS_KEY = 'animepoodle-prefs';

export interface Prefs {
  /** Which name to show: English, Romaji or the original Japanese/Korean/Chinese. */
  titleLanguage: TitleLanguage;
  /** Play trailers when the pointer rests on a card or highlight. */
  hoverPreviews: boolean;
}
const defaultPrefs: Prefs = { titleLanguage: 'english', hoverPreviews: true };

interface AppState {
  ready: boolean;
  section: SectionMeta;
  setSection: (format: Format) => void;
  library: Record<string, LibraryEntry>;
  entryFor: (item: Title) => LibraryEntry | undefined;
  setStatus: (item: Title, status: LibraryStatus | null) => void;
  feedback: Feedback[];
  ratingFor: (item: Title) => number;
  rate: (item: Title, rating: number) => void;
  clearRatings: () => void;
  taste: Taste;
  setTaste: React.Dispatch<React.SetStateAction<Taste>>;
  variety: number;
  setVariety: (v: number) => void;
  /** Library keys that count as positive signals for recommendations. */
  savedKeys: string[];
  storageError: boolean;
  toast: string;
  notify: (message: string) => void;
  mixerOpen: boolean;
  setMixerOpen: (open: boolean) => void;
  prefs: Prefs;
  setPrefs: (next: Partial<Prefs>) => void;
  /** The item's title in the chosen language. */
  name: (item: Title) => string;
}
const Ctx = createContext<AppState | null>(null);
export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

function validFeedback(entry: Feedback) {
  return (
    entry &&
    validTitle(entry.item) &&
    Number.isInteger(entry.rating) &&
    entry.rating >= 1 &&
    entry.rating <= 5
  );
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [format, setFormat] = useState<Format>('Anime');
  const [library, setLibrary] = useState<Record<string, LibraryEntry>>({});
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [taste, setTaste] = useState<Taste>(defaultTaste);
  const [variety, setVariety] = useState(1.2);
  const [storageError, setStorageError] = useState(false);
  const [toast, setToast] = useState('');
  const [mixerOpen, setMixerOpen] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(defaultPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(location.search).get('section');
      const stored = fromUrl || localStorage.getItem(SECTION_KEY);
      if (stored && stored !== 'All' && formats.includes(stored as Format))
        setFormat(stored as Format);
      const savedPrefs = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (savedPrefs)
        setPrefsState({
          titleLanguage: ['english', 'romaji', 'native'].includes(savedPrefs.titleLanguage)
            ? savedPrefs.titleLanguage
            : 'english',
          hoverPreviews: savedPrefs.hoverPreviews !== false,
        });
      const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      if (raw) {
        const next: Record<string, LibraryEntry> = {};
        if (raw.library && typeof raw.library === 'object')
          for (const [k, e] of Object.entries(raw.library as Record<string, LibraryEntry>))
            if (e && validTitle(e.item) && libraryStatuses.includes(e.status)) next[k] = e;
        // Older versions only had a bookmark list. Those become "Next on my list".
        if (Array.isArray(raw.savedTitles))
          for (const item of raw.savedTitles)
            if (validTitle(item) && !next[keyOf(item)])
              next[keyOf(item)] = { item, status: 'PLANNING', updatedAt: Date.now() };
        setLibrary(next);
        if (Array.isArray(raw.feedback))
          setFeedback(raw.feedback.filter(validFeedback).slice(-500));
        if (
          Array.isArray(raw.taste) &&
          raw.taste.length === 6 &&
          raw.taste.every((x: unknown) => typeof x === 'number' && x >= 0 && x <= 1)
        )
          setTaste(raw.taste);
        if (typeof raw.variety === 'number' && raw.variety >= 0 && raw.variety <= 3)
          setVariety(raw.variety);
      }
    } catch {
      setStorageError(true);
    }
    setReady(true);
  }, []);

  const savedKeys = useMemo(
    () =>
      Object.entries(library)
        .filter(([, e]) => e.status !== 'DROPPED')
        .map(([k]) => k),
    [library],
  );

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({
          library,
          // Kept for the recommendation worker and older builds.
          saved: savedKeys,
          savedTitles: Object.values(library).map((e) => e.item),
          feedback,
          taste,
          variety,
        }),
      );
    } catch {
      setStorageError(true);
    }
  }, [ready, library, savedKeys, feedback, taste, variety]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Other tabs (or a story page opened in a new tab) keep this one in sync.
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key !== PROFILE_KEY || !e.newValue) return;
      try {
        const raw = JSON.parse(e.newValue);
        if (raw.library) setLibrary(raw.library);
        if (Array.isArray(raw.feedback)) setFeedback(raw.feedback.filter(validFeedback));
      } catch {}
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const setPrefs = useCallback((next: Partial<Prefs>) => {
    setPrefsState((current) => {
      const merged = { ...current, ...next };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    });
  }, []);
  const setSection = useCallback((next: Format) => {
    setFormat(next);
    try {
      localStorage.setItem(SECTION_KEY, next);
    } catch {}
  }, []);
  const setStatus = useCallback((item: Title, status: LibraryStatus | null) => {
    const k = keyOf(item);
    setLibrary((current) => {
      const next = { ...current };
      if (status) next[k] = { item, status, updatedAt: Date.now() };
      else delete next[k];
      return next;
    });
    setToast(
      status
        ? `${displayTitle(item, prefsRef.current.titleLanguage)} → ${statusLabel(status, item.format)}`
        : `Took ${displayTitle(item, prefsRef.current.titleLanguage)} off your list`,
    );
  }, []);
  const rate = useCallback((item: Title, rating: number) => {
    setFeedback((current) =>
      [
        ...current.filter((f) => keyOf(f.item) !== keyOf(item)),
        ...(rating ? [{ item, rating }] : []),
      ].slice(-500),
    );
    setToast(rating ? 'Got it. Your picks will shift a little.' : 'Rating cleared');
  }, []);

  const value: AppState = {
    ready,
    section: sectionOf(format),
    setSection,
    library,
    entryFor: (item) => library[keyOf(item)],
    setStatus,
    feedback,
    ratingFor: (item) => feedback.find((f) => keyOf(f.item) === keyOf(item))?.rating || 0,
    rate,
    clearRatings: () => {
      setFeedback([]);
      setToast('Ratings cleared.');
    },
    taste,
    setTaste,
    variety,
    setVariety,
    savedKeys,
    storageError,
    toast,
    notify: setToast,
    mixerOpen,
    setMixerOpen,
    prefs,
    setPrefs,
    name: (item) => displayTitle(item, prefs.titleLanguage),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
