import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/lib/app-state';
import { EngineProvider } from '@/lib/taste-engine';
import AppShell from '@/components/AppShell';
// Mincho for display and the kanji marks, a quiet Japanese gothic for everything else. Served
// by Google Fonts so browsers fetch only the unicode-range slices a page really uses; self-hosting
// would bundle every Japanese slice of every weight.
const fonts =
  'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap';
export const metadata: Metadata = {
  icons: { icon: '/icon.svg' },
  title: { default: 'animepoodle', template: '%s · animepoodle' },
  description:
    'Discover and track anime, Chinese anime, manga, manhwa and manhua. Live charts, seasonal lists, reviews and private recommendations.',
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2ede3' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1a17' },
  ],
};
// Applies the saved theme before first paint so there is no light/dark flash.
const themeScript = `try{var t=localStorage.getItem('animepoodle-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
// Marks each image once it has loaded (or failed), so CSS can shimmer until then and fade in.
// Load events don't bubble, so listen in the capture phase from the very start; a new src
// on a reused image shimmers again.
const imageScript = `(function(){var m=function(i){i.dataset.loaded=''};document.addEventListener('load',function(e){if(e.target.tagName==='IMG')m(e.target)},true);document.addEventListener('error',function(e){if(e.target.tagName==='IMG')m(e.target)},true);document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('img').forEach(function(i){if(i.complete)m(i)});new MutationObserver(function(l){l.forEach(function(r){var i=r.target;if(i.tagName==='IMG'&&!i.complete)delete i.dataset.loaded})}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['src']})})})()`;
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={fonts} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: imageScript }} />
      </head>
      <body>
        <AppProvider>
          <EngineProvider>
            <AppShell>{children}</AppShell>
          </EngineProvider>
        </AppProvider>
      </body>
    </html>
  );
}
