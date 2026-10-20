'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import { moods } from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { useEngine } from '@/lib/taste-engine';
import TitleCard from '../TitleCard';
import TitleGrid from '../TitleGrid';
import Poodle from '../Poodle';
import { moodKanji, pageKanji } from '@/lib/kanji';

export default function ForYouPage() {
  const app = useApp();
  const { section } = app;
  const engine = useEngine();
  const ranked = engine.rankedFor(section.format).slice(0, 48);
  const matches = useMemo(
    () => new Map(ranked.map((r) => [`${r.item.format}:${r.item.id}`, r])),
    [ranked],
  );
  return (
    <main className="page for-you-page">
      <div className="page-head" data-kanji={pageKanji.forYou}>
        <div>
          <h1>For you</h1>
          <p>
            {section.label} ranked by your ratings, library and taste settings. Each section has its
            own picks, and nothing leaves your browser.
          </p>
        </div>
        <button className="subtle-button" onClick={() => app.setMixerOpen(true)}>
          <Settings2 size={16} /> Settings
        </button>
      </div>
      <div className="mood-strip" role="group" aria-label="Moods">
        {moods.map((m) => (
          <button
            key={m.name}
            className="mood-chip"
            onClick={() => {
              app.setTaste(m.taste);
              app.notify(`Showing “${m.name}” ${section.plural}`);
            }}
          >
            <span className="mood-kanji" aria-hidden="true">
              {moodKanji[m.name] ?? m.emoji}
            </span>{' '}
            {m.name}
          </button>
        ))}
      </div>
      <h2 className="results-head">Your top {section.plural} matches</h2>
      {ranked.length ? (
        <TitleGrid>
          {ranked.map((r) => (
            <TitleCard
              key={`${r.item.format}:${r.item.id}`}
              item={r.item}
              match={matches.get(`${r.item.format}:${r.item.id}`)}
            />
          ))}
        </TitleGrid>
      ) : (
        <div className="empty-state">
          <Poodle />
          <h3>We don’t know you well enough yet.</h3>
          <p>
            Open Home or Browse for {section.plural} first. Everything you look at becomes a
            candidate here.
          </p>
          <Link className="primary-button" href="/browse">
            Browse {section.plural}
          </Link>
        </div>
      )}
    </main>
  );
}
