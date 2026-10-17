import type { Metadata } from 'next';
import { Suspense } from 'react';
import TopPage from '@/components/pages/TopPage';
export const metadata: Metadata = { title: 'Top rated' };
export default function Page() {
  return (
    <Suspense>
      <TopPage />
    </Suspense>
  );
}
