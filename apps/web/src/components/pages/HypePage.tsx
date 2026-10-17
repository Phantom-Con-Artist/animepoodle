'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { Flame, RefreshCw } from 'lucide-react';
import { kindLabel } from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { useHype, useHypeBoard } from '@/lib/hype-state';
import { stashStory, storyHref } from '@/lib/story';
import HypeButton from '../HypeButton';

export default function HypePage() {
  const app = useApp();
  const { wallet, sync } = useHype();
  const board = useHypeBoard(app.section.format);
  useEffect(() => {
    sync();
  }, [sync]);
  const year = board.data?.year || new Date().getUTCFullYear();
  return (
    <main className="page hype-page">
      <div className="page-head">
        <div>
          <h1>
            This year’s Hype <span className="hype-year">{year}</span>
          </h1>
          <p>
            The {app.section.plural} you’re cheering for. Send one point at a time and help shape
            this year’s chart.
          </p>
        </div>
      </div>
      <div className="hype-wallet" aria-live="polite">
        <Flame size={27} />
        <div>
          <strong>{wallet.remaining} of 10 Hype left today</strong>
          <p>Shared across all sections. Resets at midnight UTC.</p>
        </div>
        <div className="hype-points" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} className={i < wallet.remaining ? 'available' : ''} />
          ))}
        </div>
      </div>
      <div className="hype-chart-head">
        <div>
          <h2>{app.section.label} Hype</h2>
          <p>
            {board.data?.mode === 'hype'
              ? 'Community Hype leads the chart. Popularity breaks ties.'
              : `Starting with popular ${app.section.plural} released in ${year}. Real Hype points take the lead as they arrive.`}
          </p>
        </div>
        <button
          className="subtle-button"
          disabled={board.isValidating}
          onClick={() => void board.mutate()}
        >
          <RefreshCw size={15} /> Refresh chart
        </button>
      </div>
      {board.data && !board.data.votingAvailable && (
        <p className="hype-notice" role="status">
          Voting is temporarily unavailable. You can still explore the chart.
        </p>
      )}
      {board.error && (
        <p className="extras-error" role="alert">
          The Hype chart could not load.{' '}
          <button className="text-button" onClick={() => void board.mutate()}>
            Try again
          </button>
        </p>
      )}
      {board.isLoading && (
        <p className="extras-empty" role="status">
          Loading this year’s Hype…
        </p>
      )}
      {board.data && (
        <ol className="hype-chart">
          {board.data.entries.map(({ item, points }, index) => (
            <li className="hype-row" key={`${item.format}:${item.anilistId || item.id}`}>
              <span className="hype-rank" aria-label={`Rank ${index + 1}`}>
                {index + 1}
              </span>
              <Link
                className="hype-cover"
                href={storyHref(item)}
                onClick={() => stashStory(item)}
                tabIndex={-1}
                aria-hidden="true"
              >
                <img src={item.image} alt="" loading="lazy" />
              </Link>
              <div className="hype-title">
                <Link href={storyHref(item)} onClick={() => stashStory(item)}>
                  {app.name(item)}
                </Link>
                <small>
                  {kindLabel(item.mediaFormat)} · {item.year || 'TBA'}
                </small>
              </div>
              <div className="hype-score">
                <strong>{new Intl.NumberFormat().format(points)}</strong>
                <small>{points === 1 ? 'Hype point' : 'Hype points'}</small>
              </div>
              <HypeButton item={item} />
            </li>
          ))}
        </ol>
      )}
      {board.data && !board.data.entries.length && (
        <p className="extras-empty">
          No titles on this year’s chart yet. Open any title and send it some Hype to get it started.
        </p>
      )}
      <p className="hype-footnote">
        Each browser gets 10 points daily. Different devices have separate allowances. Hype is a
        community signal, with separate yearly charts for each section. Chart updates can take about
        a minute.
      </p>
    </main>
  );
}
