import type { Metadata } from 'next';
import { Suspense } from 'react';
import BrowsePage from '@/components/pages/BrowsePage';
export const metadata: Metadata = { title: 'Browse' };
export default function Browse() {
  return (
    <Suspense>
      <BrowsePage />
    </Suspense>
  );
}
