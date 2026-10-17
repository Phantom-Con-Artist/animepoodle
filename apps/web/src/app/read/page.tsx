import type { Metadata } from 'next';
import { Suspense } from 'react';
import Reader from '@/components/Reader';
export const metadata: Metadata = { title: 'Reading' };
export default function Read() {
  return (
    <Suspense>
      <Reader />
    </Suspense>
  );
}
