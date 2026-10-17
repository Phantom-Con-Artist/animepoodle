import type { Metadata } from 'next';
import { Suspense } from 'react';
import LibraryPage from '@/components/pages/LibraryPage';
export const metadata: Metadata = { title: 'My library' };
export default function Page() {
  return (
    <Suspense>
      <LibraryPage />
    </Suspense>
  );
}
