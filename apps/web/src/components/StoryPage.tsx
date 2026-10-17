'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  ArrowLeft,
  ArrowUpRight,
  Award,
  CalendarClock,
  ExternalLink,
  MessagesSquare,
  Star,
  ThumbsUp,
  Tv,
} from 'lucide-react';
import {
  isWatchFormat,
  kindLabel,
  mergeTitleMetadata,
  withEnglishTitle,
  seasonLabel,
  type CommunityResponse,
  type MediaDetails,
  type Title,
} from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { getJson } from '@/lib/useApi';
import {
  keyOf,
  parseStoryParams,
  readStash,
  stashStory,
  storyHref,
  type StoryParams,
} from '@/lib/story';
import StoryExtras from './StoryExtras';
import ReadPanel from './ReadPanel';
import Comments from './Comments';
import StatusMenu from './StatusMenu';
import HypeButton from './HypeButton';
import { releaseLabel } from './TitleCard';

const api = process.env.NEXT_PUBLIC_API_URL || '';
const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact' }).format(n);
const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
function countdown(airingAt: number) {
  const s = airingAt - Date.now() / 1000;
  if (s <= 0) return 'soon';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d
    ? `in ${d} day${d === 1 ? '' : 's'}, ${h} h`
    : `in ${h} h ${Math.floor((s % 3600) / 60)} min`;
}

export default function StoryPage() {
  const search = useSearchParams();
  const params = useMemo(() => parseStoryParams(new URLSearchParams(search.toString())), [search]);
  if (!params)
    return (
      <main className="page">
        <div className="empty-state story-missing">
          <h3>Hmm, we lost that one.</h3>
          <p>This link is missing its ID. Head back and pick something from the list.</p>
          <Link className="primary-button" href="/">
            Back to home
          </Link>
        </div>
      </main>
    );
  return <Story key={search.toString()} params={params} />;
}

function Story({ params }: { params: StoryParams }) {
  const app = useApp();
  const mediaId = params.anilistId ? -params.anilistId : params.malId;
  // Series only MangaDex lists load from MangaDex; AniList-only sections stay hidden.
  const mangadexOnly = !mediaId && !!params.mangadexId;
  const [stashed, setStashed] = useState<Title | null>(null);
  const [reviewPage, setReviewPage] = useState(1);
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  useEffect(() => setStashed(readStash(params)), [params]);

  const details = useSWR<MediaDetails, Error>(
    mangadexOnly
      ? `${api}/api/read/title/${params.mangadexId}`
      : `${api}/api/media/${mediaId}?format=${params.format}&page=1`,
    (url: string) => getJson<MediaDetails>(url, 'AniList details are unavailable right now.'),
    { revalidateOnFocus: false, dedupingInterval: 300000 },
  );
  const loaded = useMemo(() => {
    const fresh = details.data?.media;
    if (fresh && stashed) return mergeTitleMetadata([[stashed], [fresh]])[0] || fresh;
    return fresh || stashed;
  }, [details.data, stashed]);
  const malId = details.data?.malId || loaded?.malId || params.malId;
  const community = useSWR<CommunityResponse, Error>(
    malId ? `${api}/api/community?format=${params.format}&malId=${malId}&page=${reviewPage}` : null,
    async (url: string) => {
      const data = await getJson<CommunityResponse>(
        url,
        'MyAnimeList reviews are unavailable right now.',
      );
      if (!Array.isArray(data.reviews) || !Array.isArray(data.topics))
        throw new Error('MyAnimeList returned an unreadable response.');
      return data;
    },
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 600000 },
  );
  // MyAnimeList's official English title replaces a name guessed from AniList's synonyms.
  const item = useMemo(
    () => loaded && withEnglishTitle(loaded, community.data?.englishTitle, 'MyAnimeList'),
    [loaded, community.data?.englishTitle],
  );
  useEffect(() => {
    if (item) document.title = `${app.name(item)} · animepoodle`;
  }, [item, app]);

  if (!item)
    return (
      <main className="page">
        {details.error ? (
          <div className="empty-state story-missing">
            <h3>This page didn’t load.</h3>
            <p>{details.error.message}</p>
            <button className="primary-button" onClick={() => void details.mutate()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="story-loading" role="status" aria-label="Loading story">
            <span />
            <span />
            <span />
          </div>
        )}
      </main>
    );

  const profile = details.data?.profile;
  // The names not chosen as the heading, shown underneath for reference.
  const otherNames = [
    ...new Set(
      [item.titles?.english, item.titles?.romaji, item.titles?.native, item.original].filter(
        (n): n is string => !!n && n !== app.name(item),
      ),
    ),
  ];
  const banner = details.data?.bannerImage || item.bannerImage;
  const watch = isWatchFormat(item.format);
  const rating = app.ratingFor(item);
  const streaming = profile?.links?.filter((l) => l.type === 'STREAMING') || [];
  const official = profile?.links?.filter((l) => l.type === 'INFO') || [];
  const fandom = `https://community.fandom.com/wiki/Special:Search?scope=cross-wiki&query=${encodeURIComponent(item.title)}`;
  const studios = profile?.studioList?.length
    ? profile.studioList
    : (profile?.studios || []).map((name) => ({ id: 0, name }));
  const when =
    item.season && item.seasonYear
      ? `${seasonLabel(item.season)} ${item.seasonYear}`
      : item.year
        ? String(item.year)
        : 'TBA';
  const facts: [string, React.ReactNode][] = [
    ['Type', kindLabel(item.mediaFormat)],
    ['Status', item.status ? releaseLabel[item.status] : 'Unknown'],
    [
      watch ? 'Aired' : 'Published',
      `${when}${profile?.endYear && profile.endYear !== item.year ? ` – ${profile.endYear}` : ''}`,
    ],
    [watch ? 'Episodes' : 'Length', item.episodes],
    ...(profile?.duration
      ? [['Episode length', `${profile.duration} min`] as [string, string]]
      : []),
    ...(studios.length
      ? [
          [
            studios.length > 1 ? 'Studios' : 'Studio',
            <span key="s" className="fact-links">
              {studios.map((st) =>
                st.id ? (
                  <Link key={st.id} href={`/studio?id=${st.id}`}>
                    {st.name}
                  </Link>
                ) : (
                  <span key={st.name}>{st.name}</span>
                ),
              )}
            </span>,
          ] as [string, React.ReactNode],
        ]
      : []),
    ...(profile?.sourceMaterial ? [['Based on', profile.sourceMaterial] as [string, string]] : []),
    ...(profile?.popularity
      ? [['AniList members', compact(profile.popularity)] as [string, string]]
      : []),
    ...(profile?.favourites
      ? [['Favourited by', compact(profile.favourites)] as [string, string]]
      : []),
    ...(community.data?.rank ? [['MAL rank', `#${community.data.rank}`] as [string, string]] : []),
  ];
  const novel = item.mediaFormat === 'NOVEL';
  // The same story in another medium: anime ↔ manga, manhwa, manhua and light novels.
  const otherForms = (profile?.relations || [])
    .filter(
      (r) => isWatchFormat(r.item.format) !== watch || (r.item.mediaFormat === 'NOVEL') !== novel,
    )
    .filter((r) => !['Character', 'Other'].includes(r.relation))
    .slice(0, 6);
  const sectionsNav = [
    ['overview', 'Overview'],
    ...(!watch ? [['read', novel ? 'Reading' : 'Read here']] : []),
    ...(streaming.length || official.length
      ? [['where', watch ? 'Where to watch' : 'Where to read']]
      : []),
    ...(profile?.characters.length ? [['cast', 'Characters & cast']] : []),
    ...(profile?.relations?.length ? [['related', watch ? 'Seasons & related' : 'Related']] : []),
    ...(mangadexOnly ? [] : [['media', 'Trailer & reviews']]),
    ...(malId ? [['mal', 'MAL reviews']] : []),
    ['comments', 'Comments'],
  ];

  return (
    <main className="page story-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> Back
      </Link>
      <section className="story-hero">
        <div className="story-banner">
          <img
            src={banner && banner !== failedBanner ? banner : item.image}
            alt=""
            onError={() => setFailedBanner(banner || null)}
          />
        </div>
        <div className="story-head">
          <div className="story-poster" style={{ background: item.color }}>
            <img src={item.image} alt={`${app.name(item)} cover`} />
          </div>
          <div className="story-title-block">
            <div className="story-title-main">
              <div className="story-chips">
                <span className="chip chip-sky">{kindLabel(item.mediaFormat)}</span>
                {item.status && <span className="chip">{releaseLabel[item.status]}</span>}
                <span className="chip">{when}</span>
                <span className="chip chip-yellow">
                  <Star size={13} fill="currentColor" />{' '}
                  {item.rating ? item.rating.toFixed(1) : 'No score yet'}
                </span>
              </div>
              <h1>{app.name(item)}</h1>
              {otherNames.length > 0 && <p className="original-title">{otherNames.join(' / ')}</p>}
              {!!profile?.rankings?.length && (
                <ul className="rank-badges" aria-label="AniList rankings">
                  {profile.rankings.map((r) => (
                    <li key={r.label} className={r.kind === 'RATED' ? 'rated' : 'popular'}>
                      <Award size={14} /> #{r.rank} {r.label.toLowerCase()}
                    </li>
                  ))}
                </ul>
              )}
              {profile?.nextEpisode && (
                <p className="next-episode">
                  <CalendarClock size={16} /> Episode {profile.nextEpisode.episode} airs{' '}
                  {countdown(profile.nextEpisode.airingAt)}
                </p>
              )}
              <div className="story-actions">
                <StatusMenu item={item} />
                <label className="story-rating">
                  <span>Your rating</span>
                  <select
                    aria-label="My rating"
                    value={rating}
                    onChange={(e) => app.rate(item, Number(e.target.value))}
                  >
                    <option value="0">Not rated</option>
                    <option value="1">1 ★ Not for me</option>
                    <option value="2">2 ★ It was meh</option>
                    <option value="3">3 ★ Decent</option>
                    <option value="4">4 ★ Really liked it</option>
                    <option value="5">5 ★ Loved it, no notes</option>
                  </select>
                </label>
              </div>
            </div>
            <HypeButton item={item} hero />
          </div>
        </div>
      </section>

      <nav className="story-nav" aria-label="On this page">
        {sectionsNav.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <div className="story-layout">
        <div className="story-body">
          <section id="overview" className="story-panel">
            <h2>Synopsis</h2>
            <div className="genre-tags">
              {item.genres.map((g) => (
                <Link
                  key={g}
                  href={`/browse?genre=${encodeURIComponent(g)}`}
                  onClick={() => app.setSection(item.format)}
                >
                  {g}
                </Link>
              ))}
            </div>
            {item.description
              .split(/\n+/)
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className="synopsis">
                  {para}
                </p>
              ))}
            {community.data?.background && (
              <>
                <h3 className="story-subhead">Background</h3>
                <p className="synopsis">{community.data.background}</p>
              </>
            )}
            {item.tags && item.tags.length > 0 && (
              <>
                <h3 className="story-subhead">Themes</h3>
                <div className="tag-cloud">
                  {item.tags.slice(0, 14).map((t) => (
                    <span key={t.name}>{t.name}</span>
                  ))}
                </div>
              </>
            )}
          </section>

          {otherForms.length > 0 && (
            <section className="story-panel other-forms" aria-label="Other versions">
              <h2>{watch ? 'Read the story' : 'Also as'}</h2>
              <ul className="related-list">
                {otherForms.map((r) => {
                  const readable = !isWatchFormat(r.item.format);
                  const kind =
                    r.item.mediaFormat === 'NOVEL'
                      ? 'light novel'
                      : readable
                        ? r.item.format.toLowerCase()
                        : kindLabel(r.item.mediaFormat).toLowerCase();
                  return (
                    <li key={`${r.relation}-${keyOf(r.item)}`}>
                      <Link
                        href={`${storyHref(r.item)}${readable && r.item.mediaFormat !== 'NOVEL' ? '#read' : ''}`}
                        onClick={() => stashStory(r.item)}
                      >
                        <img src={r.item.image} alt="" loading="lazy" />
                        <span>
                          <em>
                            {readable ? 'Read the' : 'Watch the'}
                            {kind}
                          </em>
                          <strong>{app.name(r.item)}</strong>
                          <small>{r.relation}</small>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {!watch && (
            <section id="read" className="story-panel">
              <h2>{novel ? 'Reading this novel' : 'Read here'}</h2>
              {novel ? (
                <p className="panel-note">
                  Light novel text has no open source we can show, so animepoodle doesn’t host it.
                  The official places below sell or publish it
                  {otherForms.some((r) => !isWatchFormat(r.item.format))
                    ? ', and the manga version above can be read right here'
                    : ''}
                  .
                </p>
              ) : (
                <ReadPanel item={item} />
              )}
            </section>
          )}

          {(streaming.length > 0 || official.length > 0) && (
            <section id="where" className="story-panel">
              <h2>{watch ? 'Where to watch' : 'Where to read'}</h2>
              <p className="panel-note">
                The official homes for this one, straight from AniList. What you can see depends on
                where you live.
              </p>
              {streaming.length > 0 && (
                <div className="service-grid">
                  {streaming.map((l) => (
                    <a
                      key={l.url}
                      className="service"
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="service-dot" style={{ background: l.color || 'var(--sky)' }}>
                        <Tv size={15} />
                      </span>
                      <span>
                        <strong>{l.site}</strong>
                        {l.language && <small>{l.language}</small>}
                      </span>
                      <ExternalLink size={14} />
                    </a>
                  ))}
                </div>
              )}
              {official.length > 0 && (
                <div className="source-links">
                  {official.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.site}
                      {l.language ? ` (${l.language})` : ''} <ArrowUpRight size={13} />
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}

          {!!profile?.characters.length && (
            <section id="cast" className="story-panel">
              <div className="extras-heading">
                <h2>Characters & cast</h2>
                <a href={fandom} target="_blank" rel="noopener noreferrer">
                  Search Fandom wikis <ArrowUpRight size={13} />
                </a>
              </div>
              <ul className="cast-grid">
                {profile.characters.map((c) => (
                  <li key={c.id || c.name} className="cast">
                    <a
                      className="cast-person"
                      href={c.id ? `https://anilist.co/character/${c.id}` : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c.image ? (
                        <img src={c.image} alt="" loading="lazy" />
                      ) : (
                        <span className="cast-blank" />
                      )}
                      <span>
                        <strong>{c.name}</strong>
                        <small>{c.role}</small>
                      </span>
                    </a>
                    {c.voiceActor && (
                      <a
                        className="cast-person cast-va"
                        href={c.voiceActor.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span>
                          <strong>{c.voiceActor.name}</strong>
                          <small>Japanese voice</small>
                        </span>
                        {c.voiceActor.image ? (
                          <img src={c.voiceActor.image} alt="" loading="lazy" />
                        ) : (
                          <span className="cast-blank" />
                        )}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {!!profile.staff?.length && (
                <>
                  <h3 className="story-subhead">Staff</h3>
                  <ul className="staff-list">
                    {profile.staff.map((s) => (
                      <li key={`${s.name}-${s.role}`}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.name}
                        </a>
                        <span>{s.role}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {!!profile?.relations?.length && (
            <section id="related" className="story-panel">
              <h2>{watch ? 'Seasons & related' : 'Related'}</h2>
              <ul className="related-list">
                {profile.relations.map((r) => (
                  <li key={`${r.relation}-${keyOf(r.item)}`}>
                    <Link href={storyHref(r.item)} onClick={() => stashStory(r.item)}>
                      <img src={r.item.image} alt="" loading="lazy" />
                      <span>
                        <em>{r.relation}</em>
                        <strong>{app.name(r.item)}</strong>
                        <small>
                          {kindLabel(r.item.mediaFormat)}, {r.item.year || 'TBA'}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!mangadexOnly && (
            <section id="media" className="story-panel">
              <h2>Trailer, reviews & music</h2>
              {details.data ? (
                <StoryExtras key={keyOf(item)} item={item} initial={details.data} />
              ) : details.error ? (
                <p className="extras-error">{details.error.message}</p>
              ) : (
                <p className="extras-loading" role="status">
                  Loading trailer and reviews…
                </p>
              )}
            </section>
          )}

          {malId && (
            <section id="mal" className="story-panel">
              <div className="extras-heading">
                <h2>MyAnimeList reviews</h2>
                {community.data && (
                  <a
                    href={`${community.data.malUrl}/reviews`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    All reviews on MAL <ArrowUpRight size={13} />
                  </a>
                )}
              </div>
              {community.error && !community.data ? (
                <div className="extras-error" role="status">
                  <p>{community.error.message}</p>
                  <button className="text-button" onClick={() => void community.mutate()}>
                    Try again
                  </button>
                </div>
              ) : !community.data ? (
                <p className="extras-loading" role="status">
                  Loading reviews from MyAnimeList…
                </p>
              ) : (
                <>
                  {community.data.notice && (
                    <p className="review-notice">{community.data.notice}</p>
                  )}
                  {community.data.reviews.length ? (
                    <div className="mal-reviews" aria-busy={community.isValidating}>
                      {community.data.reviews.map((r) => (
                        <article key={r.id} className="mal-review">
                          <header>
                            {r.avatar ? (
                              <img src={r.avatar} alt="" loading="lazy" />
                            ) : (
                              <span className="avatar">{r.author[0]}</span>
                            )}
                            <div>
                              <strong>{r.author}</strong>
                              <small>{day(r.date)}</small>
                            </div>
                            {r.score !== null && (
                              <span className="review-score">
                                {r.score}
                                <small>/10</small>
                              </span>
                            )}
                          </header>
                          {r.verdict && <span className="verdict">{r.verdict}</span>}
                          {r.spoiler ? (
                            <details>
                              <summary>Contains spoilers. Show review</summary>
                              <p>{r.excerpt}</p>
                            </details>
                          ) : (
                            <p>{r.excerpt}</p>
                          )}
                          <footer className="review-footer">
                            <span>
                              <ThumbsUp size={12} /> {r.reactions} reactions
                            </span>
                            <a href={r.url} target="_blank" rel="noopener noreferrer">
                              Read the full review <ArrowUpRight size={12} />
                            </a>
                          </footer>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="extras-empty">
                      No MyAnimeList reviews yet. Maybe you’ll write the first one?
                    </p>
                  )}
                  {(community.data.hasNextPage || reviewPage > 1) && (
                    <div className="review-pagination">
                      <button
                        className="text-button"
                        disabled={reviewPage <= 1 || community.isValidating}
                        onClick={() => setReviewPage((p) => p - 1)}
                      >
                        Previous
                      </button>
                      <span aria-live="polite">Page {reviewPage}</span>
                      <button
                        className="text-button"
                        disabled={!community.data.hasNextPage || community.isValidating}
                        onClick={() => setReviewPage((p) => p + 1)}
                      >
                        More MAL reviews
                      </button>
                    </div>
                  )}
                  {community.data.topics.length > 0 && (
                    <>
                      <h3 className="story-subhead">Forum threads</h3>
                      <ul className="topic-list">
                        {community.data.topics.map((t) => (
                          <li key={t.id}>
                            <a href={t.url} target="_blank" rel="noopener noreferrer">
                              <strong>{t.title}</strong>
                              <small>
                                Started by {t.author}
                                {t.date ? `, ${day(t.date)}` : ''}
                              </small>
                            </a>
                            <span className="topic-count">
                              <MessagesSquare size={13} /> {t.comments}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          <section id="comments" className="story-panel">
            <Comments
              term={
                params.anilistId
                  ? `anilist-${params.anilistId}`
                  : malId
                    ? `mal-${params.format.toLowerCase()}-${malId}`
                    : `mangadex-${params.mangadexId}`
              }
              title={app.name(item)}
            />
          </section>
        </div>

        <aside className="story-aside">
          <section className="story-panel facts-panel">
            <h2>Details</h2>
            <dl>
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="source-links">
              {details.data?.url && (
                <a href={details.data.url} target="_blank" rel="noopener noreferrer">
                  AniList <ArrowUpRight size={13} />
                </a>
              )}
              {malId && (
                <a
                  href={
                    community.data?.malUrl ||
                    `https://myanimelist.net/${watch ? 'anime' : 'manga'}/${malId}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  MyAnimeList <ArrowUpRight size={13} />
                </a>
              )}
              <a href={fandom} target="_blank" rel="noopener noreferrer">
                Fandom wikis <ArrowUpRight size={13} />
              </a>
            </div>
          </section>
          {!!profile?.recommendations.length && (
            <section className="story-panel">
              <h2>If this one got you</h2>
              <ul className="rec-list">
                {profile.recommendations.slice(0, 6).map((rec) => (
                  <li key={keyOf(rec)}>
                    <Link href={storyHref(rec)} onClick={() => stashStory(rec)}>
                      <img src={rec.image} alt="" loading="lazy" />
                      <span>
                        <strong>{app.name(rec)}</strong>
                        <small>
                          {kindLabel(rec.mediaFormat)}
                          {rec.year ? `, ${rec.year}` : ''}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="story-disclaimer">
            We point you to official places to watch and read. Chapters read here come from MangaDex
            and its translation groups; we never host episodes or chapters ourselves.
          </p>
        </aside>
      </div>
    </main>
  );
}
