/** Where a game is in its lifecycle. Mirrors `app/Enums/GameStatus.php`; keep the two in step. */
export const GameStatus = {
  Waiting: 'waiting',
  Active: 'active',
  Finished: 'finished',
} as const;

export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];
