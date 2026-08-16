/**
 * Display formatting for video metadata.
 *
 * These lived inline in the Hugo template, where the only way to catch a fault
 * was to look at a rendered page: Go prints a failed format verb as page copy
 * rather than erroring, so every view count under a thousand shipped as
 * "%!d(float64=203) views" and the build still passed. Here they are ordinary
 * functions with ordinary tests.
 */

/** "82.0K views", "1.2M views", "203 views". */
export function formatViews(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${Math.round(n)} views`;
}

/** Coarse relative age: "today", "3d ago", "2w ago", "5mo ago", "2y ago". */
export function formatAge(publishedAt, nowMs = Date.now()) {
  const then = Date.parse(publishedAt);
  if (Number.isNaN(then)) return '';

  const days = Math.floor((nowMs - then) / 86_400_000);
  if (days < 0) return 'today';
  if (days < 1) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** The watch URL for a video id. Ids are case-sensitive. */
export function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}
