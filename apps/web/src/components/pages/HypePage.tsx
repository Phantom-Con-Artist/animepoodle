'use client';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, Flame, RefreshCw, Star } from 'lucide-react';
import { kindLabel, type Title } from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { useHype, useHypeBoard } from '@/lib/hype-state';
import { stashStory, storyHref } from '@/lib/story';
import HypeButton from '../HypeButton';
import { releaseLabel } from '../TitleCard';

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
            <HypeRow
              key={`${item.format}:${item.anilistId || item.id}`}
              item={item}
              points={points}
              rank={index + 1}
            />
          ))}
        </ol>
      )}
      {board.data && !board.data.entries.length && (
        <p className="extras-empty">
          No titles on this year’s chart yet. Open any title and send it some Hype to get it
          started.
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

/** One chart entry. Hovering (or tapping More) unfolds the synopsis and details. */
function HypeRow({ item, points, rank }: { item: Title; points: number; rank: number }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const href = storyHref(item);
  const when =
    item.season && item.seasonYear
      ? `${item.season[0]}${item.season.slice(1).toLowerCase()} ${item.seasonYear}`
      : item.year || 'TBA';
  return (
    <li className={`hype-row ${open ? 'is-open' : ''}`}>
      <span className="hype-rank" aria-label={`Rank ${rank}`}>
        {rank}
      </span>
      <Link
        className="hype-cover"
        href={href}
        onClick={() => stashStory(item)}
        tabIndex={-1}
        aria-hidden="true"
      >
        <img src={item.image} alt="" loading="lazy" />
      </Link>
      <div className="hype-title">
        <Link href={href} onClick={() => stashStory(item)}>
          {app.name(item)}
        </Link>
        <small>
          {kindLabel(item.mediaFormat)} · {item.year || 'TBA'}
        </small>
        <button
          type="button"
          className="hype-more"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Less' : 'More'} <ChevronDown size={14} />
        </button>
      </div>
      <div className="hype-score">
        <strong>{new Intl.NumberFormat().format(points)}</strong>
        <small>{points === 1 ? 'Hype point' : 'Hype points'}</small>
      </div>
      <HypeButton item={item} />
      <div className="hype-details" id={detailsId}>
        <div className="hype-details-inner">
          <div className="hero-meta">
            <span>
              <Star size={13} fill="currentColor" /> {item.rating ? item.rating.toFixed(1) : 'New'}
            </span>
            {item.status && <em>{releaseLabel[item.status]}</em>}
            <em>{when}</em>
            {item.episodes && <em>{item.episodes}</em>}
            {item.genres.slice(0, 3).map((g) => (
              <em key={g}>{g}</em>
            ))}
          </div>
          {item.description && <p>{item.description}</p>}
          <Link className="text-button" href={href} onClick={() => stashStory(item)}>
            See details <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </li>
  );
}
