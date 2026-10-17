import type { Metadata } from 'next';
import HomePage from '@/components/pages/HomePage';
export const metadata: Metadata = {
  title: { absolute: 'animepoodle: discover and track anime, manga and manhwa' },
};
export default function Home() {
  return <HomePage />;
}
