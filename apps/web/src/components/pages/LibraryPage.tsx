'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, LayoutGrid, List, Sparkles, Star } from 'lucide-react';
import { chapterLabel, kindLabel, type Format } from '@animepoodle/shared';
import { sections, useApp } from '@/lib/app-state';
import {
  libraryStatuses,
  statusFilterLabel,
  statusTone,
  type LibraryEntry,
  type LibraryStatus,
} from '@/lib/library';
import { keyOf, stashStory, storyHref } from '@/lib/story';
import { useReading } from '@/lib/reading';
import { readHref } from '../Reader';
import TitleCard from '../TitleCard';
import TitleGrid from '../TitleGrid';
import StatusMenu from '../StatusMenu';
import Poodle from '../Poodle';
import { pageKanji } from '@/lib/kanji';

const sorts = [
  ['updated', 'Recently updated'],
  ['title', 'Title A–Z'],
  ['score', 'AniList score'],
  ['mine', 'My rating'],
] as const;
const VIEW_KEY = 'animepoodle-library-view';

export default function LibraryPage() {
  const app = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = libraryStatuses.includes(params.get('status') as LibraryStatus)
    ? (params.get('status') as LibraryStatus)
    : null;
  const format = sections.some((s) => s.format === params.get('section'))
    ? (params.get('section') as Format)
    : null;
  const sort = sorts.some(([v]) => v === params.get('sort')) ? params.get('sort')! : 'updated';
  const [view, setView] = useState<'grid' | 'list'>('grid');
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === 'list') setView('list');
    } catch {}
  }, []);
  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false });
  };

  const entries = useMemo(() => Object.values(app.library), [app.library]);
  const byStatus = (s: LibraryStatus | null, f: Format | null) =>
    entries.filter((e) => (!s || e.status === s) && (!f || e.item.format === f)).length;
  const visible = useMemo(() => {
    const list = entries.filter(
      (e) => (!status || e.status === status) && (!format || e.item.format === format),
    );
    const cmp: Record<string, (a: LibraryEntry, b: LibraryEntry) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      title: (a, b) => a.item.title.localeCompare(b.item.title),
      score: (a, b) => b.item.rating - a.item.rating,
      mine: (a, b) => app.ratingFor(b.item) - app.ratingFor(a.item),
    };
    return list.sort(cmp[sort]);
  }, [entries, status, format, sort, app]);
  // With every section showing, group so anime and comics stay visibly separate.
  const groups = format
    ? [{ section: sections.find((s) => s.format === format)!, items: visible }]
    : sections
        .map((s) => ({ section: s, items: visible.filter((e) => e.item.format === s.format) }))
        .filter((g) => g.items.length);

  return (
    <main className="page library-page">
      <div className="page-head" data-kanji={pageKanji.library}>
        <div>
          <h1>My library</h1>
          <p>
            Everything you’re watching, reading, loved or saving for later, all in one place. It
            lives in this browser and nowhere else.
          </p>
        </div>
      </div>

      <div className="library-stats" aria-label="Library summary">
        <div>
          <strong>{entries.length}</strong>
          <span>titles</span>
        </div>
        {libraryStatuses.map((s) => (
          <div key={s} className={`tone-${statusTone[s]}`}>
            <strong>{byStatus(s, null)}</strong>
            <span>{statusFilterLabel[s]}</span>
          </div>
        ))}
      </div>

      <div className="status-tabs" role="tablist" aria-label="Status">
        <button
          role="tab"
          aria-selected={!status}
          className={!status ? 'selected' : ''}
          onClick={() => update({ status: null })}
        >
          All <span>{byStatus(null, format)}</span>
        </button>
        {libraryStatuses.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            className={status === s ? 'selected' : ''}
            onClick={() => update({ status: s })}
          >
            {statusFilterLabel[s]} <span>{byStatus(s, format)}</span>
          </button>
        ))}
      </div>

      <div className="library-toolbar">
        <div className="kind-chips" role="group" aria-label="Section">
          <button
            aria-pressed={!format}
            className={!format ? 'selected' : ''}
            onClick={() => update({ section: null })}
          >
            All sections
          </button>
          {sections.map((s) => (
            <button
              key={s.format}
              aria-pressed={format === s.format}
              className={format === s.format ? 'selected' : ''}
              onClick={() => update({ section: s.format })}
            >
              {s.label} <span>{byStatus(status, s.format)}</span>
            </button>
          ))}
        </div>
        <div className="library-controls">
          <select
            aria-label="Sort library"
            value={sort}
            onChange={(e) => update({ sort: e.target.value === 'updated' ? null : e.target.value })}
          >
            {sorts.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <div className="view-toggle" role="group" aria-label="Layout">
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                aria-label={v === 'grid' ? 'Grid view' : 'List view'}
                className={view === v ? 'selected' : ''}
                onClick={() => {
                  setView(v);
                  try {
                    localStorage.setItem(VIEW_KEY, v);
                  } catch {}
                }}
              >
                {v === 'grid' ? <LayoutGrid size={16} /> : <List size={16} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!app.ready ? null : visible.length ? (
        groups.map((g) => (
          <section
            key={g.section.format}
            className="library-group"
            aria-labelledby={`lib-${g.section.format}`}
          >
            {!format && (
              <h2 id={`lib-${g.section.format}`}>
                {g.section.label} <span>{g.items.length}</span>
              </h2>
            )}
            {view === 'grid' ? (
              <TitleGrid>
                {g.items.map((e) => (
                  <TitleCard key={`${e.item.format}:${e.item.id}`} item={e.item} />
                ))}
              </TitleGrid>
            ) : (
              <ul className="library-list">
                {g.items.map((e) => (
                  <LibraryRow key={`${e.item.format}:${e.item.id}`} entry={e} />
                ))}
              </ul>
            )}
          </section>
        ))
      ) : (
        <div className="empty-state">
          <Poodle />
          <h3>
            {entries.length
              ? 'Nothing here with these filters.'
              : 'Your library’s looking a little lonely.'}
          </h3>
          <p>
            {entries.length
              ? 'Pick another status or section.'
              : 'Tap the bookmark on any cover and tell us if you’re watching it, finished it or saving it for later.'}
          </p>
          {!entries.length && (
            <Link className="primary-button" href="/">
              Find something
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

function LibraryRow({ entry }: { entry: LibraryEntry }) {
  const app = useApp();
  const { item } = entry;
  const rating = app.ratingFor(item);
  const reading = useReading();
  const mangaId = reading.links[keyOf(item)];
  const fresh = mangaId ? reading.fresh[mangaId] : undefined;
  const progress = mangaId ? reading.series[mangaId] : undefined;
  return (
    <li className="library-row">
      <Link
        href={storyHref(item)}
        onClick={() => stashStory(item)}
        className="library-cover"
        tabIndex={-1}
        aria-hidden="true"
      >
        <img src={item.image} alt="" loading="lazy" />
      </Link>
      <div className="library-main">
        <Link className="chart-title" href={storyHref(item)} onClick={() => stashStory(item)}>
          {app.name(item)}
        </Link>
        <div className="chart-meta">
          <span className="chip">{kindLabel(item.mediaFormat)}</span>
          <span>{item.year || 'TBA'}</span>
          <span>{item.episodes}</span>
          <span>
            <Star size={12} fill="currentColor" /> {item.rating ? item.rating.toFixed(1) : '—'}
          </span>
        </div>
        {(fresh || progress) && (
          <Link
            className={fresh ? 'read-new library-read' : 'library-read'}
            href={readHref(fresh ? fresh.latest.id : progress!.chapterId, item)}
            onClick={() => stashStory(item)}
          >
            {fresh ? (
              <>
                <Sparkles size={14} /> New: {chapterLabel(fresh.latest)}
              </>
            ) : (
              <>
                <BookOpen size={14} /> Continue {chapterLabel(progress!).toLowerCase()}
              </>
            )}
          </Link>
        )}
        <small>
          Updated{' '}
          {new Date(entry.updatedAt).toLocaleDateString([], {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </small>
      </div>
      <div className="library-actions">
        <StatusMenu item={item} />
        <select
          aria-label={`My rating for ${app.name(item)}`}
          value={rating}
          onChange={(e) => app.rate(item, Number(e.target.value))}
        >
          <option value="0">Not rated</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {'★'.repeat(n)} {n}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
