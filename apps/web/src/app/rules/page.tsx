import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Site & community rules',
  description: 'How animepoodle works, what data it uses, and how to behave in comment threads.',
};

const site = [
  {
    title: 'We help you find things, we don’t host them',
    body: 'animepoodle shows information about anime, manga, manhwa, manhua and Chinese animation. We don’t host or link to episodes, chapters or scans. Use official services to watch or read.',
  },
  {
    title: 'Where the information comes from',
    body: 'Titles, synopses, scores, characters, trailers and AniList reviews come from AniList. MyAnimeList reviews, forum threads and extra artwork come from MyAnimeList through Jikan. Opening and ending songs come from AnimeThemes. Reviews and threads belong to the people who wrote them. We show short excerpts and link to the full text.',
  },
  {
    title: 'Your data stays in your browser',
    body: 'Your library, ratings and taste settings are stored in this browser only. We don’t have accounts and don’t collect them. Clearing your browser data deletes them.',
  },
  {
    title: 'Recommendations are guesses',
    body: 'Match scores come from genres, tags and your own ratings, worked out on your device. They’re a starting point, not a verdict on what you’ll enjoy.',
  },
  {
    title: 'Adult content is filtered out',
    body: 'We ask AniList to leave out adult titles and drop tags marked as adult or spoiler. If something inappropriate slips through, report it on our GitHub issues page.',
  },
  {
    title: 'Fair use of the site',
    body: 'Please don’t scrape the site or hammer the API. It runs on free tiers and shares rate limits with the services above. Heavy automated traffic may be blocked.',
  },
];

const community = [
  {
    title: 'Be kind',
    body: 'Talk about the story, not the person. No insults, slurs, harassment or pile-ons. You can disagree about a show without being rude.',
  },
  {
    title: 'Mark your spoilers',
    body: 'Not everyone is caught up. Say “Spoiler” at the start of your comment and name the episode or chapter. Hide the details in a <details> block if you can.',
  },
  {
    title: 'Stay on topic',
    body: 'Each thread belongs to one title. Keep comments about that story, its adaptation, music or characters.',
  },
  {
    title: 'No piracy links',
    body: 'Don’t post links to unofficial streams, scans or downloads. Links to official platforms, publishers and news sites are welcome.',
  },
  {
    title: 'No spam or self-promotion',
    body: 'No ads, referral links or repeated posts. Sharing your own fan art or review is fine if it adds something to the conversation.',
  },
  {
    title: 'Keep it safe for everyone',
    body: 'No sexual content involving characters who are minors or look like minors. No graphic gore, hate speech or personal information about anyone, including yourself.',
  },
  {
    title: 'What happens if you break the rules',
    body: 'Comments that break these rules are hidden or deleted. Repeat or serious cases are blocked from the repository. Report a comment by reacting with 👎 and opening a GitHub issue that links to it.',
  },
];

export default function Rules() {
  return (
    <>
      <main className="page rules-main">
        <h1>Site & community rules</h1>
        <p className="rules-lede">
          The short version: we help you find stories, your data stays with you, and comment threads
          are for people who like talking about anime and comics. Be decent.
        </p>
        <nav className="rules-jump" aria-label="On this page">
          <a href="#site">How the site works</a>
          <a href="#community">Comment rules</a>
          <a href="#comments">About comments</a>
        </nav>
        <section id="site" className="rules-section">
          <h2>How the site works</h2>
          <ol className="rules-list">
            {site.map((rule) => (
              <li key={rule.title}>
                <h3>{rule.title}</h3>
                <p>{rule.body}</p>
              </li>
            ))}
          </ol>
        </section>
        <section id="community" className="rules-section rules-community">
          <h2>Comment rules</h2>
          <ol className="rules-list">
            {community.map((rule) => (
              <li key={rule.title}>
                <h3>{rule.title}</h3>
                <p>{rule.body}</p>
              </li>
            ))}
          </ol>
        </section>
        <section id="comments" className="rules-section">
          <h2>About comments</h2>
          <div className="rules-note">
            <p>
              Comments run on Giscus, which saves each thread as a GitHub Discussion. Anyone can
              read them without an account. To post or react, you sign in with GitHub inside the
              comment box. animepoodle never sees your password.
            </p>
            <p>
              Your comments are public on GitHub and follow{' '}
              <a href="https://docs.github.com/site-policy/github-terms/github-community-guidelines">
                GitHub’s community guidelines
              </a>{' '}
              as well as the rules above. You can edit or delete them on GitHub at any time.
            </p>
          </div>
        </section>
        <p className="rules-updated">Last updated 17 October 2026.</p>
      </main>
    </>
  );
}
