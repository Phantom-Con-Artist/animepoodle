'use client';
import { Children, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Keep each shelf's membership fixed while a preview borrows width from its neighbours. */
export default function TitleGrid({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(2);
  useLayoutEffect(() => {
    const el = root.current!;
    const measure = () => {
      const widths = getComputedStyle(el).gridTemplateColumns.split(' ').map(Number.parseFloat);
      setColumns(widths.length);
      el.style.setProperty('--shelf-poster-h', `${widths[0] / 0.7}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  const cards = Children.toArray(children);
  return (
    <div className="title-grid" ref={root}>
      {Array.from({ length: Math.ceil(cards.length / columns) }, (_, row) => {
        const shelf = cards.slice(row * columns, (row + 1) * columns);
        return (
          <div
            className="title-shelf"
            key={row}
            style={{
              gridTemplateColumns: Array.from({ length: columns }, () => 'minmax(0, 1fr)').join(
                ' ',
              ),
            }}
          >
            {shelf}
            {Array.from({ length: columns - shelf.length }, (_, i) => (
              <div key={`space-${i}`} aria-hidden="true" />
            ))}
          </div>
        );
      })}
    </div>
  );
}
