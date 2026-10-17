import type { Metadata, Viewport } from 'next';
import { Dela_Gothic_One, Schibsted_Grotesk } from 'next/font/google';
import './globals.css';
import { HypeProvider } from '@/lib/hype-state';
import { AppProvider } from '@/lib/app-state';
import { EngineProvider } from '@/lib/taste-engine';
import AppShell from '@/components/AppShell';
const display = Dela_Gothic_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});
const body = Schibsted_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-body' });
export const metadata: Metadata = {
  icons: { icon: '/icon.svg' },
  title: { default: 'animepoodle', template: '%s · animepoodle' },
  description:
    'Discover and track anime, Chinese anime, manga, manhwa and manhua. Live charts, seasonal lists, reviews and private recommendations.',
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4fb' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1a2c' },
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
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: imageScript }} />
      </head>
      <body>
        <AppProvider>
          <HypeProvider>
            <EngineProvider>
              <AppShell>{children}</AppShell>
            </EngineProvider>
          </HypeProvider>
        </AppProvider>
      </body>
    </html>
  );
}
