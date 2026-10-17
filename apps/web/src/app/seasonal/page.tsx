import type { Metadata } from 'next';
import { Suspense } from 'react';
import SeasonalPage from '@/components/pages/SeasonalPage';
export const metadata: Metadata = { title: 'Seasonal anime' };
export default function Page() {
  return (
    <Suspense>
      <SeasonalPage />
    </Suspense>
  );
}
