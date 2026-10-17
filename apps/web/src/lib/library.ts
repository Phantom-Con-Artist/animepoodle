import { isWatchFormat, type Format, type Title } from '@animepoodle/shared';

/** Same statuses AniList uses, so the meaning is familiar to anyone who tracks there. */
export const libraryStatuses = ['CURRENT', 'PLANNING', 'COMPLETED', 'PAUSED', 'DROPPED'] as const;
export type LibraryStatus = (typeof libraryStatuses)[number];
export interface LibraryEntry {
  item: Title;
  status: LibraryStatus;
  updatedAt: number;
}

export function statusLabel(status: LibraryStatus, format?: Format) {
  const watch = !format || isWatchFormat(format);
  switch (status) {
    case 'CURRENT':
      return watch ? 'Watching' : 'Reading';
    case 'PLANNING':
      return 'Next on my list';
    case 'COMPLETED':
      return watch ? 'Watched' : 'Read';
    case 'PAUSED':
      return 'On hold';
    case 'DROPPED':
      return 'Dropped';
  }
}
/** Neutral wording for filters that span both anime and comics. */
export const statusFilterLabel: Record<LibraryStatus, string> = {
  CURRENT: 'In progress',
  PLANNING: 'Next on my list',
  COMPLETED: 'Finished',
  PAUSED: 'On hold',
  DROPPED: 'Dropped',
};
export const statusTone: Record<LibraryStatus, string> = {
  CURRENT: 'sky',
  PLANNING: 'yellow',
  COMPLETED: 'mint',
  PAUSED: 'violet',
  DROPPED: 'muted',
};
