'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, Trash2 } from 'lucide-react';
import { type Title } from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { libraryStatuses, statusLabel, statusTone } from '@/lib/library';

/**
 * Library control. `compact` is the icon button on covers; the full version shows the status
 * as text, for story pages.
 */
export default function StatusMenu({ item, compact = false }: { item: Title; compact?: boolean }) {
  const app = useApp();
  const entry = app.entryFor(item);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const label = entry ? statusLabel(entry.status, item.format) : 'Add to library';
  return (
    <div className={`status-menu ${compact ? 'compact' : ''}`} ref={root}>
      <button
        className={`status-trigger ${entry ? `tone-${statusTone[entry.status]}` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={compact ? `${entry ? label : 'Add'}: ${item.title}` : undefined}
        title={compact ? label : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {entry ? <Check size={compact ? 16 : 17} /> : <Bookmark size={compact ? 16 : 17} />}
        {!compact && <span>{label}</span>}
        {!compact && <ChevronDown size={15} />}
      </button>
      {open && (
        <div
          className="status-popover"
          role="menu"
          id={menuId}
          aria-label={`Library status for ${item.title}`}
        >
          {libraryStatuses.map((status) => (
            <button
              key={status}
              role="menuitemradio"
              aria-checked={entry?.status === status}
              className={`tone-${statusTone[status]}`}
              onClick={() => {
                app.setStatus(item, status);
                setOpen(false);
              }}
            >
              <span className="status-dot" />
              {statusLabel(status, item.format)}
              {entry?.status === status && <Check size={15} />}
            </button>
          ))}
          {entry && (
            <button
              role="menuitem"
              className="status-remove"
              onClick={() => {
                app.setStatus(item, null);
                setOpen(false);
              }}
            >
              <Trash2 size={15} />
              Remove from library
            </button>
          )}
        </div>
      )}
    </div>
  );
}
