'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Award, Star } from 'lucide-react';
import {
  moods,
  seasonLabel,
  type AwardsResponse,
  type HighlightsResponse,
  type Title,
} from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { useApi } from '@/lib/useApi';
import { useEngine, useRemember } from '@/lib/taste-engine';
import { keyOf, stashStory, storyHref } from '@/lib/story';
import { useReading } from '@/lib/reading';
import HighlightHero from '../HighlightHero';
import Rail from '../Rail';

const isHighlights = (d: HighlightsResponse) => Array.isArray(d?.week) && Array.isArray(d?.year);
const isAwards = (d: AwardsResponse) => Array.isArray(d?.winners);

export default function HomePage() {
  const app = useApp();
  const router = useRouter();
  const { section } = app;
  const engine = useEngine();
  const highlights = useApi<HighlightsResponse>(
    `/api/highlights?format=${section.format}`,
    isHighlights,
    'Highlights are unavailable right now.',
  );
  const awards = useApi<AwardsResponse>(
    section.format === 'Anime' ? '/api/awards' : null,
    isAwards,
    'Award winners are unavailable right now.',
  );
  const h = highlights.data?.format === section.format ? highlights.data : undefined;
  const loaded = useMemo(
    () => (h ? [...h.week, ...h.month, ...h.year, ...h.seasonal, ...h.upcoming] : undefined),
    [h],
  );
  useRemember(loaded);

  const year = new Date().getFullYear();
  const inProgress = Object.values(app.library)
    .filter((e) => e.status === 'CURRENT' && e.item.format === section.format)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((e) => e.item);
  const upNext = Object.values(app.library)
    .filter((e) => e.status === 'PLANNING' && e.item.format === section.format)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((e) => e.item);
  const personal = app.feedback.length > 0 || app.savedKeys.length > 0;
  const matches = engine.rankedFor(section.format).slice(0, 12);
  // Reading sections: series opened in the reader, and ones with chapters out since.
  const reading = useReading();
  const linked = useMemo(() => {
    const byManga = new Map<string, Title>();
    for (const e of Object.values(app.library)) {
      const id = reading.links[keyOf(e.item)];
      if (id) byManga.set(id, e.item);
    }
    for (const p of Object.values(reading.series)) if (p.item) byManga.set(p.mangaId, p.item);
    return byManga;
  }, [app.library, reading]);
  const keepReading = Object.values(reading.series)
    .filter((p) => p.item?.format === section.format)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((p) => p.item!)
    .slice(0, 20);
  const newChapters = Object.entries(reading.fresh)
    .sort((a, b) => +new Date(b[1].latest.readableAt) - +new Date(a[1].latest.readableAt))
    .map(([id]) => linked.get(id))
    .filter((t): t is Title => !!t && t.format === section.format);
  const matchMap = useMemo(
    () => new Map(matches.map((r) => [`${r.item.format}:${r.item.id}`, r])),
    [matches],
  );
  const error = highlights.error && !h ? highlights.error.message : undefined;
  const watching = section.verb === 'watch' ? 'watching' : 'reading';

  return (
    <main className="page home-page">
      {h?.week.length ? (
        <HighlightHero
          items={h.week}
          label={section.verb === 'watch' ? 'Everyone’s watching this' : 'Everyone’s reading this'}
        />
      ) : (
        <div className="highlight highlight-loading" aria-busy={!error}>
          {error ? (
            <div className="extras-error" role="status">
              <p>{error}</p>
              <button className="text-button" onClick={() => void highlights.mutate()}>
                Try again
              </button>
            </div>
          ) : (
            <span className="skeleton-block" />
          )}
        </div>
      )}

      {newChapters.length > 0 && (
        <Rail
          id="new-chapters"
          title="New chapters for you"
          description="Fresh chapters of the series you’re reading. Open one to jump straight in."
          items={newChapters}
          href="/library?status=CURRENT"
        />
      )}
      {keepReading.length > 0 && (
        <Rail
          id="keep-reading"
          title="Keep reading"
          description="Right back to the page you stopped on."
          items={keepReading}
          href="/library?status=CURRENT"
        />
      )}
      {inProgress.length > 0 && (
        <Rail
          id="continue"
          title="Pick up where you left off"
          description="You were partway through these. They’ve been waiting for you."
          items={inProgress}
          href="/library?status=CURRENT"
        />
      )}

      <Rail
        id="week"
        title="This week"
        description={`The ${section.plural} nobody can stop talking about right now.`}
        items={h?.week}
        loading={highlights.isLoading}
        error={error}
        href="/browse?sort=TRENDING_DESC"
      />
      <Rail
        id="month"
        title="Fresh this month"
        description="New in the last 30 days. Get in early and say you were there from episode one."
        items={h?.month}
        loading={highlights.isLoading}
        error={error}
        empty={`Nothing new has landed this month yet. Give it a few days.`}
        href={`/browse?sort=POPULARITY_DESC&year=${year}`}
      />
      <Rail
        id="year"
        title={`The best of ${year} so far`}
        description="The ones people are scoring highest this year. Hard to go wrong here."
        items={h?.year}
        loading={highlights.isLoading}
        error={error}
        ranked
        href={`/top?year=${year}`}
      />
      {h?.season && (
        <Rail
          id="season"
          title={`${seasonLabel(h.season.season)} ${h.season.year} season`}
          description="This season’s lineup, crowd favourites first."
          items={h.seasonal}
          loading={highlights.isLoading}
          href="/seasonal"
        />
      )}

      {section.format === 'Anime' && (
        <section className="awards" aria-labelledby="awards-title">
          <div className="rail-head">
            <div>
              <h2 id="awards-title">
                <Award size={22} /> Anime of the Year
              </h2>
              <p>
                Every show that took home the top prize at the Crunchyroll Anime Awards. Each one
                earned it.
              </p>
            </div>
          </div>
          {awards.data?.winners.length ? (
            <ol className="award-list">
              {awards.data.winners.map((w) => (
                <li key={w.year}>
                  <AwardCard item={w.item} year={w.year} ceremony={w.ceremony} />
                </li>
              ))}
            </ol>
          ) : (
            <p className={awards.error ? 'extras-error' : 'extras-loading'}>
              {awards.error ? awards.error.message : 'Polishing the trophies…'}
            </p>
          )}
        </section>
      )}

      <Rail
        id="upcoming"
        title="On the horizon"
        description="Announced, not out yet. These are the ones people are counting down to."
        items={h?.upcoming}
        loading={highlights.isLoading}
        error={error}
        href="/browse?status=NOT_YET_RELEASED"
      />

      {upNext.length > 0 && (
        <Rail
          id="next"
          title="Waiting on your list"
          description="You said you’d get to these. Maybe tonight’s the night."
          items={upNext}
          href="/library?status=PLANNING"
        />
      )}

      {personal && matches.length > 0 && (
        <Rail
          id="matches"
          title="Picked with you in mind"
          description="Based on what you’ve rated and saved. The more you rate, the better we get."
          items={matches.map((m) => m.item)}
          matches={matchMap}
          href="/for-you"
        />
      )}

      <section className="mood-section" aria-labelledby="mood-title">
        <div className="rail-head">
          <div>
            <h2 id="mood-title">What’s the mood tonight?</h2>
            <p>Tell us how you feel and we’ll find {section.plural} to match.</p>
          </div>
        </div>
        <div className="mood-grid">
          {moods.map((m) => (
            <button
              key={m.name}
              className="mood-card"
              onClick={() => {
                app.setTaste(m.taste);
                app.notify(`Showing “${m.name}” ${section.plural}`);
                router.push('/for-you');
              }}
            >
              <span className="mood-emoji">{m.emoji}</span>
              <span>
                <strong>{m.name}</strong>
                <small>{m.description}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function AwardCard({ item, year, ceremony }: { item: Title; year: number; ceremony: string }) {
  const app = useApp();
  return (
    <Link className="award-card" href={storyHref(item)} onClick={() => stashStory(item)}>
      <img src={item.image} alt="" loading="lazy" />
      <span className="award-year">{year}</span>
      <span className="award-body">
        <strong>{app.name(item)}</strong>
        <small>{ceremony}</small>
        <span className="award-score">
          <Star size={12} fill="currentColor" /> {item.rating ? item.rating.toFixed(1) : '—'}
        </span>
      </span>
    </Link>
  );
}
