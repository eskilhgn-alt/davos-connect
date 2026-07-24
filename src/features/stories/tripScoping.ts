/**
 * Pure trip-scoping helpers for the Stories domain.
 * Kept side-effect free so they can be unit-tested deterministically.
 */

export function buildStoryCacheKey(userId: string, tripId: string): string {
  return `guttahutte:stories:${userId}:${tripId}:v2`;
}

export function storyChannelName(tripId: string): string {
  return `stories-rt:${tripId}`;
}

export function storyChannelFilter(tripId: string): string {
  return `trip_id=eq.${tripId}`;
}

export interface WriteContext {
  tripId: string | null;
  isArchive: boolean;
}

/** True only when a story write (insert/like/view/delete) is allowed. */
export function canWriteStory(ctx: WriteContext): boolean {
  return !!ctx.tripId && !ctx.isArchive;
}

/** Filter a raw story row set to only rows tagged to the selected trip. */
export function filterStoriesForTrip<T extends { trip_id?: string | null }>(
  rows: readonly T[],
  tripId: string | null,
): T[] {
  if (!tripId) return [];
  return rows.filter((r) => r.trip_id === tripId);
}
