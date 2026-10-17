'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, Check, Dog, Library, Menu, Play, Search, Settings2, X } from 'lucide-react';
import { isWatchFormat } from '@animepoodle/shared';
import { sections, useApp } from '@/lib/app-state';
import { useReading } from '@/lib/reading';
import { useChapterUpdates } from '@/lib/reading-updates';
import ThemeToggle from './ThemeToggle';
import TasteMixer from './TasteMixer';

const nav = [
  { href: '/', label: 'Home' },
  { href: '/browse', label: 'Browse' },
  { href: '/top', label: 'Top rated' },
  { href: '/hype', label: 'This year’s Hype' },
  { href: '/seasonal', label: 'Seasonal', watchOnly: true },
  { href: '/for-you', label: 'For you' },
];
// Pages that show one section at a time get the section switcher.
const sectionPages = ['/', '/browse', '/top', '/seasonal', '/for-you', '/hype'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const libraryCount = Object.keys(app.library).length;
  useChapterUpdates();
  const newChapters = Object.keys(useReading().fresh).length;
  const watch = isWatchFormat(app.section.format);
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  useEffect(() => setMenu(false), [pathname]);
  // Sticky elements below the header need its real height, which changes per page.
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const update = () =>
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      app.notify('Type at least two characters to search.');
      return;
    }
    router.push(`/browse?q=${encodeURIComponent(q)}`);
  }

  const links = nav.filter((n) => !n.watchOnly || watch);
  // The reader takes the whole screen; it has its own bars.
  if (pathname.startsWith('/read')) return <>{children}</>;
  return (
    <div className="site">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="site-header" ref={header}>
        <div className="site-header-inner">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            aria-expanded={menu}
            onClick={() => setMenu(true)}
          >
            <Menu size={20} />
          </button>
          <Link href="/" className="brand" aria-label="animepoodle home">
            <span className="brand-mark">
              <Dog size={22} />
            </span>
            <span className="brand-word">
              animepoodle<span className="brand-dot">.</span>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            {links.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={active(n.href) ? 'active' : ''}
                aria-current={active(n.href) ? 'page' : undefined}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <form className="header-search" role="search" onSubmit={submit}>
            <Search size={17} />
            <input
              ref={search}
              aria-label="Search stories"
              placeholder={`Search ${app.section.plural}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>/</kbd>
          </form>
          <div className="header-actions">
            <Link
              href="/library"
              className={`library-link ${active('/library') ? 'active' : ''}`}
              aria-label={`My library, ${libraryCount} titles${newChapters ? `, ${newChapters} with new chapters` : ''}`}
            >
              <Library size={18} />
              <span>My library</span>
              {libraryCount > 0 && <span className="count">{libraryCount}</span>}
              {newChapters > 0 && <span className="new-dot" aria-hidden="true" />}
            </Link>
            <ThemeToggle />
            <button
              className="icon-button taste-button"
              aria-label="Open settings"
              onClick={() => app.setMixerOpen(true)}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </div>
        {sectionPages.includes(pathname) && (
          <div className="section-bar">
            <div className="section-bar-inner" role="group" aria-label="Section">
              {sections.map((s) => (
                <button
                  key={s.format}
                  aria-pressed={app.section.format === s.format}
                  className={`section-tab ${app.section.format === s.format ? 'selected' : ''}`}
                  onClick={() => {
                    app.setSection(s.format);
                    if (pathname === '/seasonal' && s.verb === 'read') router.push('/browse');
                  }}
                >
                  {s.verb === 'watch' ? <Play size={14} /> : <BookOpen size={14} />}
                  {s.label}
                  <small>{s.origin}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {menu && (
        <>
          <button
            className="drawer-scrim"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          />
          <div className="drawer" role="dialog" aria-label="Navigation">
            <div className="drawer-head">
              <span className="brand-word">
                animepoodle<span className="brand-dot">.</span>
              </span>
              <button
                className="icon-button"
                aria-label="Close navigation"
                onClick={() => setMenu(false)}
              >
                <X size={18} />
              </button>
            </div>
            <nav aria-label="Mobile navigation">
              {[
                ...links,
                { href: '/library', label: 'My library' },
                { href: '/rules', label: 'Site rules' },
              ].map((n) => (
                <Link key={n.href} href={n.href} className={active(n.href) ? 'active' : ''}>
                  {n.label}
                  {active(n.href) && <Check size={16} />}
                </Link>
              ))}
            </nav>
            <div className="drawer-tools">
              <ThemeToggle />
              <button
                className="subtle-button"
                onClick={() => {
                  setMenu(false);
                  app.setMixerOpen(true);
                }}
              >
                <Settings2 size={16} /> Settings
              </button>
            </div>
          </div>
        </>
      )}

      <div id="content" className="site-content">
        {app.storageError && (
          <p className="status-message page-width" role="status">
            Your browser is blocking storage, so your library and ratings will be lost when you
            close this tab.
          </p>
        )}
        {children}
      </div>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-about">
            <span className="footer-brand">
              <Dog size={18} /> animepoodle
            </span>
            <p>
              A cosy corner of the internet for finding your next favourite anime, donghua, manga,
              manhwa or manhua, and keeping track of the ones you fall for. Your library stays in
              this browser.
            </p>
          </div>
          <div>
            <h2>Explore</h2>
            <Link href="/browse">Browse</Link>
            <Link href="/top">Top rated</Link>
            <Link href="/hype">This year’s Hype</Link>
            <Link href="/seasonal">Seasonal anime</Link>
            <Link href="/for-you">For you</Link>
          </div>
          <div>
            <h2>Sections</h2>
            {sections.map((s) => (
              <Link
                key={s.format}
                href={`/browse?section=${s.format}`}
                onClick={() => app.setSection(s.format)}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <div>
            <h2>About</h2>
            <Link href="/rules">Site & community rules</Link>
            <Link href="/rules#site">Where our data comes from</Link>
            <a
              href="https://github.com/Phantom-Con-Artist/animepoodle"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source code
            </a>
          </div>
        </div>
        <p className="footer-credit">
          Data from AniList, MyAnimeList (via Jikan) and AnimeThemes. We don’t host episodes or
          chapters.
        </p>
      </footer>

      {app.mixerOpen && <TasteMixer />}
      {app.toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {app.toast}
        </div>
      )}
    </div>
  );
}
