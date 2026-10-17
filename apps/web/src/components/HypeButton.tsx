'use client';
import { Flame, LoaderCircle } from 'lucide-react';
import type { Title } from '@animepoodle/shared';
import { useHype } from '@/lib/hype-state';
import { useApp } from '@/lib/app-state';

export default function HypeButton({
  item,
  compact = false,
  hero = false,
}: {
  item: Title;
  compact?: boolean;
  hero?: boolean;
}) {
  const { wallet, busy, hype } = useHype();
  const app = useApp();
  return (
    <button
      type="button"
      className={`hype-button ${compact ? 'hype-compact' : ''} ${hero ? 'hype-hero' : ''}`}
      disabled={busy || wallet.remaining === 0}
      aria-label={`Hype ${app.name(item)}${wallet.remaining ? `: ${wallet.remaining} points left today` : ': daily limit reached'}`}
      title={`${wallet.remaining} of 10 Hype left today · shared across all sections · resets midnight UTC`}
      onClick={() => hype(item)}
    >
      {busy ? (
        <LoaderCircle size={hero ? 34 : 15} className="hype-spinner" />
      ) : (
        <Flame size={hero ? 34 : 15} />
      )}
      <span>{wallet.remaining ? '+1 Hype' : 'All hyped'}</span>
      {hero && (
        <small>
          {wallet.remaining
            ? `${wallet.remaining} of 10 left today`
            : 'Fresh points at midnight UTC'}
        </small>
      )}
    </button>
  );
}
