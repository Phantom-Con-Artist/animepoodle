'use client';
import { useEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';

// Giscus stores each story's thread in GitHub Discussions. Reading needs no account;
// posting asks for a GitHub sign-in inside the widget (Giscus has no anonymous mode).
const config = {
  repo: process.env.NEXT_PUBLIC_GISCUS_REPO || 'Phantom-Con-Artist/animepoodle',
  repoId: process.env.NEXT_PUBLIC_GISCUS_REPO_ID || 'R_kgDOVNeddA',
  category: process.env.NEXT_PUBLIC_GISCUS_CATEGORY || 'Story threads',
  categoryId: process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID || 'DIC_kwDOVNeddM4DIyDc',
};

function giscusTheme() {
  const root = document.documentElement.dataset.theme;
  const dark =
    root === 'dark' || (!root && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? 'dark_dimmed' : 'light';
}

export default function Comments({ term, title }: { term: string; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const ready = !!config.categoryId;

  useEffect(() => {
    const el = host.current;
    if (!ready || !el) return;
    el.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    Object.entries({
      'data-repo': config.repo,
      'data-repo-id': config.repoId,
      'data-category': config.category,
      'data-category-id': config.categoryId,
      'data-mapping': 'specific',
      'data-term': term,
      'data-strict': '1',
      'data-reactions-enabled': '1',
      'data-emit-metadata': '0',
      'data-input-position': 'top',
      'data-theme': giscusTheme(),
      'data-lang': 'en',
      'data-loading': 'lazy',
    }).forEach(([k, v]) => script.setAttribute(k, v));
    el.appendChild(script);

    // Keep the widget in step with the site's theme toggle and the OS setting.
    const sync = () => {
      const frame = el.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
      frame?.contentWindow?.postMessage(
        { giscus: { setConfig: { theme: giscusTheme() } } },
        'https://giscus.app',
      );
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', sync);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', sync);
    };
  }, [ready, term]);

  return (
    <section className="comments" aria-labelledby="comments-heading">
      <div className="extras-heading">
        <h3 id="comments-heading">
          <MessageCircle size={18} />
          Comments
        </h3>
        <a href="/rules#community">Community rules</a>
      </div>
      <p className="comments-note">
        Anyone can read along. To join in, sign in with GitHub in the box below. Mark your spoilers,
        and be kind.
      </p>
      {ready ? (
        <div ref={host} className="giscus-host" aria-label={`Comments about ${title}`} />
      ) : (
        <p className="extras-empty">
          Comments aren’t switched on yet. The site owner needs to enable GitHub Discussions and add
          the Giscus category ID.
        </p>
      )}
    </section>
  );
}
