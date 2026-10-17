import type { Metadata } from 'next';
import { Suspense } from 'react';
import StoryPage from '@/components/StoryPage';
export const metadata: Metadata = { title: 'Title details' };
export default function Story() {
  return (
    <Suspense>
      <StoryPage />
    </Suspense>
  );
}
