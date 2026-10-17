'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Dices,
  Flame,
  Heart,
  Library,
  Menu,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  X,
  Dog,
  BookOpen,
  Play,
  Globe2,
  Leaf,
  Info,
} from 'lucide-react';
import { catalog, defaultTaste, formats, moods, type Title, type Taste } from '@animepoodle/shared';
import { useRecommendations } from '@/lib/useRecommendations';
import Poodle from './Poodle';
import StoryDetail from './StoryDetail';
import TasteMixer from './TasteMixer';
import TitleCard from './TitleCard';
import CardTrailer from './CardTrailer';
type View = 'Discover' | 'For you' | 'My library';
const keyOf = (t: Title) => `${t.format}:${t.id}`;
const genreList = [
  'All genres',
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Mystery',
  'Romance',
  'Slice of Life',
];
export default function Discovery() {
  const [view, setView] = useState<View>('Discover');
  const [format, setFormat] = useState('All');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('All genres');
  const [sort, setSort] = useState('Popular');
  const [filters, setFilters] = useState(false);
  const [menu, setMenu] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedTitles, setSavedTitles] = useState<Title[]>([]);
  const [taste, setTaste] = useState<Taste>(defaultTaste);
  const [variety, setVariety] = useState(1.2);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [selected, setSelected] = useState<Title | null>(null);
  const [mixer, setMixer] = useState(false);
  const [mood, setMood] = useState('');
  const [toast, setToast] = useState('');
  const [live, setLive] = useState<Title[] | null>(null);
  const [liveStatus, setLiveStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('animepoodle-profile') || 'null');
      if (raw) {
        if (Array.isArray(raw.saved))
          setSaved(raw.saved.filter((x: unknown) => typeof x === 'string'));
        if (Array.isArray(raw.savedTitles))
          setSavedTitles(
            raw.savedTitles.filter(
              (x: Title) =>
                x &&
                typeof x.title === 'string' &&
                Array.isArray(x.features) &&
                x.features.length === 6 &&
                formats.includes(x.format),
            ),
          );
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
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(
          'animepoodle-profile',
          JSON.stringify({ saved, savedTitles, taste, variety }),
        );
      } catch {
        setStorageError(true);
      }
  }, [ready, saved, savedTitles, taste, variety]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    request.current?.abort();
    setLive(null);
    setLiveStatus('');
    setSource('');
    setLoading(false);
  }, [query, format]);
  useEffect(() => () => request.current?.abort(), []);
  const allItems = useMemo(
    () =>
      Array.from(
        new Map([...catalog, ...savedTitles, ...(live || [])].map((t) => [keyOf(t), t])).values(),
      ),
    [savedTitles, live],
  );
  const { ranked, engine } = useRecommendations(allItems, taste, saved, variety);
  const matches = useMemo(() => new Map(ranked.map((r) => [keyOf(r.item), r])), [ranked]);
  const filtered = useMemo(() => {
    let list =
      view === 'My library' ? allItems.filter((t) => saved.includes(keyOf(t))) : live || catalog;
    if (view === 'For you') list = ranked.map((r) => r.item);
    list = list.filter(
      (t) =>
        (format === 'All' || t.format === format) &&
        (genre === 'All genres' || t.genres.includes(genre)) &&
        ((live && view !== 'My library') ||
          `${t.title} ${t.original} ${t.genres.join(' ')}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    );
    if (sort === 'Top rated') return [...list].sort((a, b) => b.rating - a.rating);
    if (sort === 'Newest') return [...list].sort((a, b) => b.year - a.year);
    return list;
  }, [view, allItems, saved, live, ranked, format, genre, query, sort]);
  function navigate(next: View) {
    setView(next);
    setMenu(false);
    setQuery('');
    setFormat('All');
    setGenre('All genres');
    setSort('Popular');
  }
  function toggleSave(item: Title) {
    const k = keyOf(item);
    const exists = saved.includes(k);
    setSaved((s) => (exists ? s.filter((x) => x !== k) : [...s, k]));
    setSavedTitles((s) =>
      exists ? s.filter((x) => keyOf(x) !== k) : [...s.filter((x) => keyOf(x) !== k), item],
    );
    setToast(
      exists
        ? 'Removed from your library'
        : 'Added to your library. Your taste just got a little more you.',
    );
  }
  function surprise() {
    const pool = ranked.filter((r) => format === 'All' || r.item.format === format).slice(0, 10);
    if (pool.length) setSelected(pool[Math.floor(Math.random() * pool.length)].item);
    else setToast('Try another format for a fresh discovery.');
  }
  async function liveSearch(broaden = false) {
    if (query.trim().length < 2) {
      setLiveStatus('Type at least two characters to search the wider catalog.');
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLiveStatus('');
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ''}/api/search?q=${encodeURIComponent(query.trim())}&format=${format}${broaden ? '&broaden=1' : ''}`,
        { signal: controller.signal },
      );
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Live search is unavailable right now. Please try again shortly.');
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Live search is unavailable.');
      if (!controller.signal.aborted) {
        setLive(data.items);
        setSource(data.source);
        setLiveStatus(
          data.notice || (data.items.length ? '' : 'No live results found. Try a different title.'),
        );
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setLiveStatus(e instanceof Error ? e.message : 'Live search is unavailable.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  function pickMood(name: string, values: Taste) {
    setTaste(values);
    setMood(name);
    setView('For you');
    setQuery('');
    setFormat('All');
    setGenre('All genres');
    setSort('Popular');
    setToast(`Finding your “${name.toLowerCase()}” kind of story`);
  }
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <a href="/" className="brand" aria-label="animepoodle home">
          <span className="brand-mark">
            <Dog size={27} />
          </span>
          <span>
            anime<span className="text-coral">poodle</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <div className="sidebar-caption">YOUR NEXT RABBIT HOLE</div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${view === 'Discover' ? 'active' : ''}`}
            onClick={() => navigate('Discover')}
          >
            <Compass size={19} />
            Discover
            <span className="nav-indicator" />
          </button>
          <button
            className={`nav-item ${view === 'For you' ? 'active' : ''}`}
            onClick={() => navigate('For you')}
          >
            <Sparkles size={19} />
            For you<span className="small-badge">✦</span>
          </button>
          <button
            className={`nav-item ${view === 'My library' ? 'active' : ''}`}
            onClick={() => navigate('My library')}
          >
            <Library size={19} />
            My library{saved.length > 0 && <span className="count">{saved.length}</span>}
          </button>
        </nav>
        <div className="nav-divider" />
        <div className="sidebar-label">EXPLORE A LITTLE</div>
        <button
          className="nav-item"
          onClick={() => {
            navigate('Discover');
            setSort('Top rated');
            section.current?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <TrendingUp size={19} />
          Top rated
        </button>
        <button
          className="nav-item"
          onClick={() => {
            navigate('Discover');
            setFormat('Manga');
          }}
        >
          <BookOpen size={19} />
          Manga & more
        </button>
        <button className="nav-item" onClick={surprise}>
          <Dices size={19} />
          Surprise me
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-spark">✦</span>
            <p>Good taste is a journey.</p>
            <span>Let’s find your next favorite.</span>
            <button onClick={() => setMixer(true)}>
              Meet your taste <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="profile" onClick={() => setMixer(true)}>
            <span className="avatar">M</span>
            <span>
              <strong>My little universe</strong>
              <small>{saved.length} stories collected</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Your universe <span>/</span> <strong>{view}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <span className="local-label">
              <span /> Made for your kind of curious
            </span>
            <button
              className="avatar avatar-small"
              aria-label="Open taste profile"
              onClick={() => setMixer(true)}
            >
              M
            </button>
          </div>
        </header>
        <main>
          <div className="page-intro">
            <div>
              <div className="eyebrow">
                A WHOLE WORLD OF STORIES <span>✦</span>
              </div>
              <h1>
                {view === 'Discover' ? (
                  <>
                    Find your next <span className="text-coral">obsession.</span>
                  </>
                ) : view === 'For you' ? (
                  <>
                    Very you. <span className="text-lavender">A little unexpected.</span>
                  </>
                ) : (
                  <>
                    Your own <span className="text-coral">little universe.</span>
                  </>
                )}
              </h1>
              <p>
                {view === 'Discover'
                  ? 'From the first episode to the last panel. Find something that stays with you.'
                  : view === 'For you'
                    ? 'Stories matched to your taste, with a little room for happy accidents.'
                    : 'All the stories you want to get lost in, collected in one place.'}
              </p>
            </div>
            <button className="subtle-button intro-surprise" onClick={surprise}>
              <Dices size={17} /> Surprise me
            </button>
          </div>
          <div className="search-row">
            <div className="search-box">
              <Search size={20} />
              <input
                ref={search}
                aria-label="Search stories"
                placeholder="Search anime, manga, manhwa… or your next world"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query) void liveSearch();
                }}
              />
              {query ? (
                <button
                  aria-label="Clear search"
                  className="icon-button"
                  onClick={() => setQuery('')}
                >
                  <X size={17} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
            </div>
            <button
              className={`filter-button ${filters ? 'selected' : ''}`}
              aria-expanded={filters}
              onClick={() => setFilters(!filters)}
            >
              <SlidersHorizontal size={18} />
              <span>Filters</span>
              {genre !== 'All genres' && <span className="filter-dot" />}
            </button>
          </div>
          <div className="format-row" role="group" aria-label="Story format">
            {formats.map((f, i) => (
              <button
                key={f}
                aria-pressed={format === f}
                className={`format-pill ${format === f ? 'selected' : ''}`}
                onClick={() => setFormat(f)}
              >
                {i === 0 ? (
                  <Compass size={15} />
                ) : i === 1 ? (
                  <Play size={14} />
                ) : i === 2 ? (
                  <BookOpen size={14} />
                ) : null}
                {f === 'All' ? 'All stories' : f === 'Donghua' ? 'Donghua / Chinese anime' : f}
                {f === 'Manhwa' && <span className="country-dot">KR</span>}
                {f === 'Manhua' && <span className="country-dot">CN</span>}
              </button>
            ))}
          </div>
          {filters && (
            <div className="filter-panel">
              <label>
                Genre
                <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                  {genreList.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label>
                Sort by
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {['Popular', 'Top rated', 'Newest'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <button
                className="text-button"
                onClick={() => {
                  setGenre('All genres');
                  setSort('Popular');
                  setFormat('All');
                }}
              >
                Reset filters
              </button>
            </div>
          )}
          {storageError && (
            <p className="status-message" role="status">
              Browser storage is unavailable. Your changes will last for this session.
            </p>
          )}
          {view === 'Discover' && !query && (
            <div className="hero-grid">
              <section className="feature-hero" aria-label="Featured story">
                <img
                  src="/images/hero.jpg"
                  alt="Frieren and her companions overlooking a sweeping fantasy landscape at sunset"
                  className="hero-art"
                />
                <div className="hero-shade" />
                <CardTrailer item={catalog[0]} />
                <div className="hero-content">
                  <span className="feature-label">
                    <span /> THE SPOTLIGHT
                  </span>
                  <h2>
                    Some journeys
                    <br />
                    stay with you.
                  </h2>
                  <p>Frieren: Beyond Journey’s End</p>
                  <div className="hero-meta">
                    <span>
                      <Star size={13} fill="currentColor" /> 9.3
                    </span>
                    <i /> Adventure <i /> Fantasy <i /> 2023
                  </div>
                  <button className="primary-button" onClick={() => setSelected(catalog[0])}>
                    Meet your next favorite <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-bottom">
                  <span>
                    <Leaf size={13} /> A little wonder goes a long way.
                  </span>
                </div>
              </section>
              <section className="taste-teaser">
                <div className="taste-tag">
                  <Sparkles size={13} /> YOUR TASTE, BUT DEEPER
                </div>
                <h2>
                  A little you.
                  <br />A little magic.
                </h2>
                <p>
                  Great recommendations start
                  <br />
                  with what makes you, you.
                </p>
                <Poodle className="hero-poodle" />
                <div className="orbit orbit-one">♡</div>
                <div className="orbit orbit-two">✧</div>
                <button onClick={() => setMixer(true)}>
                  Find my story <ArrowUpRight size={17} />
                </button>
                <span className="taste-footnote">No algorithmic déjà vu.</span>
              </section>
            </div>
          )}
          <section ref={section} className="catalog-section">
            <div className="section-header">
              <div>
                <div className="section-title">
                  <span className={`section-icon ${view === 'For you' ? 'lavender' : ''}`}>
                    {view === 'My library' ? (
                      <Bookmark size={19} />
                    ) : query ? (
                      <Search size={19} />
                    ) : view === 'For you' ? (
                      <Sparkles size={20} />
                    ) : (
                      <Flame size={20} />
                    )}
                  </span>
                  <h2>
                    {query
                      ? `Results for “${query}”`
                      : view === 'My library'
                        ? 'The keepers'
                        : view === 'For you'
                          ? 'A shelf with your name on it'
                          : format === 'All'
                            ? 'Worth the hype'
                            : `Explore ${format}`}
                  </h2>
                  {!query && view === 'Discover' && (
                    <span className="section-tag">THE FAN FAVORITES</span>
                  )}
                </div>
                <p>
                  {query
                    ? `${filtered.length} ${filtered.length === 1 ? 'story' : 'stories'} found${source ? ` · ${source}` : ' in the curated collection'}`
                    : view === 'My library'
                      ? `${saved.length} stories, infinite possibilities.`
                      : view === 'For you'
                        ? 'Based on your taste, mood, and the stories you save.'
                        : 'The stories everyone’s falling into. Your turn?'}
                </p>
              </div>
              <div className="section-actions">
                {view === 'For you' ? (
                  <button className="text-button" onClick={() => setMixer(true)}>
                    <Settings2 size={15} />
                    Tune my taste
                  </button>
                ) : (
                  <label className="sort-select">
                    <ArrowDownWideNarrow size={15} />
                    <select
                      aria-label="Sort stories"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      {['Popular', 'Top rated', 'Newest'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                )}
              </div>
            </div>
            {query && view !== 'My library' && (
              <div className="live-search-bar">
                <span>
                  <Globe2 size={15} />
                  Looking beyond this little collection?
                </span>
                <button disabled={loading} onClick={() => void liveSearch()}>
                  {loading
                    ? 'Searching…'
                    : `Search all ${format === 'All' ? 'stories' : format.toLowerCase()}`}
                  <ArrowUpRight size={14} />
                </button>
                {live && format !== 'Donghua' && (
                  <button
                    className="broaden-search"
                    disabled={loading}
                    onClick={() => void liveSearch(true)}
                  >
                    Broaden with Jikan <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            )}
            {liveStatus && (
              <p className="status-message" role="status">
                {liveStatus}
              </p>
            )}
            {filtered.length ? (
              <div className="title-grid">
                {filtered
                  .slice(0, view === 'Discover' && !query && format === 'All' ? 6 : 36)
                  .map((item, index) => (
                    <TitleCard
                      key={keyOf(item)}
                      item={item}
                      index={index}
                      saved={saved.includes(keyOf(item))}
                      match={view === 'For you' ? matches.get(keyOf(item)) : undefined}
                      onOpen={() => setSelected(item)}
                      onSave={() => toggleSave(item)}
                    />
                  ))}
              </div>
            ) : (
              <div className="empty-state">
                <Poodle />
                <h3>
                  {view === 'My library'
                    ? 'Your next favorite belongs here.'
                    : 'A fresh rabbit hole awaits.'}
                </h3>
                <p>
                  {view === 'My library'
                    ? 'Tap a bookmark on any story to start your collection.'
                    : 'Try another title, format, or genre. There’s a whole world out there.'}
                </p>
                <button className="primary-button" onClick={() => navigate('Discover')}>
                  Explore stories <ArrowRight size={16} />
                </button>
              </div>
            )}
          </section>
          {!query && view !== 'My library' && (
            <section className="mood-section">
              <div className="section-header">
                <div>
                  <div className="section-title">
                    <span className="section-icon lavender">
                      <Heart size={19} />
                    </span>
                    <h2>What’s your story mood?</h2>
                  </div>
                  <p>Sometimes, a feeling is all you need to start.</p>
                </div>
                <span className="handwritten">follow your feeling ↴</span>
              </div>
              <div className="mood-grid">
                {moods.map((m) => (
                  <button
                    key={m.name}
                    className={`mood-card ${mood === m.name ? 'mood-active' : ''}`}
                    onClick={() => pickMood(m.name, m.taste)}
                  >
                    <span className="mood-emoji">{m.emoji}</span>
                    <span>
                      <strong>{m.name}</strong>
                      <small>{m.description}</small>
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>
            </section>
          )}
          {view === 'Discover' && !query && (
            <section className="recommendation-section">
              <div className="section-header">
                <div>
                  <div className="section-title">
                    <span className="section-icon lavender">
                      <Sparkles size={20} />
                    </span>
                    <h2>Off the beaten watchlist</h2>
                    <span className="section-tag lavender-tag">PICKED FOR YOU</span>
                  </div>
                  <p>A few stories we think you’ll really click with.</p>
                </div>
                <button className="text-button" onClick={() => navigate('For you')}>
                  See my picks <ArrowRight size={15} />
                </button>
              </div>
              <div className="mini-grid">
                {ranked.slice(0, 3).map(({ item, score, reason }) => (
                  <article key={keyOf(item)} className="mini-card">
                    <CardTrailer item={item} />
                    <button className="mini-card-main" onClick={() => setSelected(item)}>
                      <img
                        src={item.image}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <span>
                        <small>
                          <Sparkles size={11} />
                          {Math.round(score)}% taste match
                        </small>
                        <strong>{item.title}</strong>
                        <em>{reason}</em>
                        <span className="mini-genre">
                          {item.format} <i>·</i> {item.genres[0]}
                        </span>
                      </span>
                      <ArrowUpRight size={17} />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          <footer>
            <span className="footer-brand">
              <Dog size={17} /> animepoodle<span className="text-coral">.</span>
            </span>
            <span>For the stories you haven’t met yet.</span>
            <button className="privacy-note" onClick={() => setMixer(true)}>
              <span /> Your taste stays on your device <Info size={12} />
            </button>
          </footer>
        </main>
      </div>
      {selected && (
        <StoryDetail
          selected={selected}
          match={matches.get(keyOf(selected))}
          saved={saved.includes(keyOf(selected))}
          onSave={() => toggleSave(selected)}
          onClose={() => setSelected(null)}
        />
      )}
      {mixer && (
        <TasteMixer
          taste={taste}
          setTaste={setTaste}
          variety={variety}
          setVariety={setVariety}
          engine={engine}
          onClose={() => setMixer(false)}
          onTasteChange={() => setMood('')}
          onShowStories={() => {
            setMixer(false);
            navigate('For you');
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
