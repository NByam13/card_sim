import { router } from '@inertiajs/react';

/**
 * Reload everything scoped to the game in progress. In a Bo3 the match may have
 * moved on to the next game, and its game number, turn order and cursor only
 * make sense together.
 */
export function reloadIntoCurrentGame(): void {
  router.reload({ only: ['game', 'cursor', 'turnOrder'] });
}

/** Whether a request was refused because it was for a game the match has moved on from. */
export function isStaleGame(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 409;
}
