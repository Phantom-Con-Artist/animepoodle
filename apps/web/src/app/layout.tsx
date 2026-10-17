import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  icons: { icon: '/icon.svg' },
  title: 'animepoodle — Find your next obsession',
  description:
    'A little you. A little magic. Discover anime, manga, manhwa, manhua and donghua with recommendations shaped by your taste.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
