export function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
export function youtubeUrl(value: unknown): string | null {
  const safe = httpsUrl(value);
  if (!safe) return null;
  const host = new URL(safe).hostname.toLowerCase();
  return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(
    host,
  )
    ? safe
    : null;
}
