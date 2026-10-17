import type { Metadata } from 'next';
import { Suspense } from 'react';
import ForYouPage from '@/components/pages/ForYouPage';
export const metadata: Metadata = { title: 'For you' };
export default function Page() {
  return (
    <Suspense>
      <ForYouPage />
    </Suspense>
  );
}
