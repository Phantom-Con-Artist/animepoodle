import type { Metadata } from 'next';
import { Suspense } from 'react';
import StudioPage from '@/components/pages/StudioPage';
export const metadata: Metadata = { title: 'Studio' };
export default function Page() {
  return (
    <Suspense>
      <StudioPage />
    </Suspense>
  );
}
