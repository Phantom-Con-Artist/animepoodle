/** AniList caps (and sometimes fakes) pageInfo.total at 5,000, so it can't be shown as is. */
const ANILIST_CAP = 5000;

/** An honest title count: exact once everything has loaded, otherwise "what we have+". */
export function titleCount(total: number | undefined, loaded: number, more: boolean) {
  if (!more) return loaded.toLocaleString();
  if (total && total < ANILIST_CAP) return total.toLocaleString();
  return `${loaded.toLocaleString()}+`;
}
