import type { Metadata } from 'next';
import { Suspense } from 'react';
import HypePage from '@/components/pages/HypePage';
export const metadata: Metadata = { title: 'This year’s Hype' };
export default function Page() {
  return (
    <Suspense>
      <HypePage />
    </Suspense>
  );
}
