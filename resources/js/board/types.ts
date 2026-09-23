import { Card } from '@/types/cards';

/**
 * The board's shape, ported from PonyRec's playtest board.
 *
 * Still typed against MLP on purpose. The plan is for zones to become data
 * supplied by a selectable game setup, but that generalisation happens *after*
 * two browsers play a full match here — porting to parity first is what gives it
 * a working reference to be checked against.
 *
 * @see documentation/local-board/spec.md
 */

/**
 * Every bucket the snap-mode board can hold cards in. Story stages and their
 * Plans are split into discrete zones (one per stage I–IV) so cards snap to a
 * specific stage. `mainChar` holds the single Main Character.
 */
export type ZoneId =
  | 'library'
  | 'hand'
  | 'adventureL'
  | 'adventureC'
  | 'adventureR'
  | 'scene'
  | 'sceneDeck'
  | 'storyI'
  | 'storyII'
  | 'storyIII'
  | 'storyIV'
  | 'planI'
  | 'planII'
  | 'planIII'
  | 'planIV'
  | 'retire'
  | 'reveal'
  | 'mainChar';

/** The 3 Adventure lanes — contact is resolved per lane, so they're distinct zones. */
export const ADVENTURE_ZONES: ZoneId[] = ['adventureL', 'adventureC', 'adventureR'];
export const STORY_ZONES: ZoneId[] = ['storyI', 'storyII', 'storyIII', 'storyIV'];
export const PLAN_ZONES: ZoneId[] = ['planI', 'planII', 'planIII', 'planIV'];

/**
 * Zones where a card is out of play in a pile, so the only thing worth doing to
 * it is moving it somewhere else. A retired card has no board state: tapping it,
 * turning it face down, or putting counters on it means nothing, and offering
 * those makes the card menu read like the card is still in play. Both the card
 * menu and the keyboard read this, so the two cannot drift.
 *
 * Only Retire, because it is the only pile whose cards you interact with
 * individually. The Library and Scene Deck hand their *top* card to the keyboard
 * (that is how `r` reveals the top of the deck), and that card is on its way
 * somewhere, so it keeps the full set.
 */
export const PILE_ZONES: ZoneId[] = ['retire'];

/** Every zone id, in a stable order — used to build the empty zone map. */
export const ALL_ZONES: ZoneId[] = [
  'library',
  'hand',
  ...ADVENTURE_ZONES,
  'scene',
  'sceneDeck',
  ...STORY_ZONES,
  ...PLAN_ZONES,
  'retire',
  'reveal',
  'mainChar',
];

/**
 * One physical copy of a card on the board. `uid` is unique per copy (a deck can
 * run 4 of a card), so it — not the card number — is the drag/sortable key.
 */
export interface CardInstance {
  uid: string;
  card: Card;
  tapped: boolean;
  faceDown: boolean;
  counters: number;
  /** Override for the card's printed inspiration; null = use card.inspiration. */
  inspiration: number | null;
}

export interface GameState {
  zones: Record<ZoneId, CardInstance[]>;
  turn: number;
  /** False until Start Game, which gates Plan dealing and the Mulligan. */
  started: boolean;
  /**
   * Whether this player is on the play. The *only* thing it changes is that
   * the first player's opening Scene enters face down — deliberately not a
   * rules engine (players take their own turn-1 draw by clicking their deck).
   * Null until the toggle is touched; the turn-order slice will set it from the
   * server-held roll.
   */
  goingFirst: boolean | null;
  /**
   * Whether this player has spent their one mulligan (rules 103.4.1c). Only a
   * fresh deal clears it, since RESTART rebuilds from `initialState`, so the cap
   * is per game rather than per hand.
   */
  mulliganed: boolean;
}

export const OPENING_HAND_SIZE = 5;
export const PLAN_COUNT = 4;

/**
 * Whether a card is a token (Candy, a Present) rather than a card out of the
 * deck. Tokens are spawned onto an Adventure lane and removed from the board
 * outright, so they answer to a different set of actions: nothing that would
 * send one to the Retire pile, the hand, or a deck it was never in. Both the
 * card menu and the keyboard read this, so the two cannot drift.
 */
export function isToken(card: Pick<Card, 'subtype'>): boolean {
  return card.subtype === 'token';
}

/**
 * Whether a card in `zone` renders sideways.
 *
 * Story cards always lie landscape. A **Plan** is the subtle one: its physical
 * slot on the Story stage is horizontal, but the card art is not — so face down
 * it lies flat in the slot (landscape), and turning it face up stands the card
 * up (portrait) so it can actually be read. A face-up Plan therefore overhangs
 * its slot, which is fine: it's a transient state (the card is about to go to
 * hand or to Retire), and letting the stage row grow instead would cost
 * permanent vertical height.
 *
 * The Main Character always stands vertical, even on a landscape Story stage.
 */
export function rendersLandscape(
  zone: ZoneId,
  faceDown: boolean,
  subtype?: string | null
): boolean {
  if (subtype === 'main-character') return false;
  if (PLAN_ZONES.includes(zone)) return faceDown;
  return STORY_ZONES.includes(zone);
}

/**
 * The contact-order number (1–3) shown on an Adventure lane, or null for any
 * other zone.
 *
 * Contact sweeps from the acting player's first lane, and the direction flips
 * by seat: the **first** player sweeps left→right, so their leftmost lane is
 * Lane 1; the **second** player sweeps right→left, so their *rightmost* lane is
 * Lane 1 and the numbering reverses. Because the two seats face each other and
 * sweep in opposite directions, lanes that physically oppose across the table
 * always share a number (Lane 1 meets Lane 1). A seat that isn't decided yet
 * uses the first-player numbering.
 */
export function laneNumber(zone: ZoneId, goingFirst: boolean | null): number | null {
  const index = ADVENTURE_ZONES.indexOf(zone);
  if (index === -1) return null;

  return goingFirst === false ? ADVENTURE_ZONES.length - index : index + 1;
}

/**
 * The Adventure lane a contact-order number names, or null when it isn't one.
 *
 * The exact inverse of `laneNumber`, so the `1`/`2`/`3` shortcuts target the lane
 * the board *labels* with that number. For the player on the draw that is not the
 * lane sitting in that position on screen.
 */
export function laneZoneForNumber(n: number, goingFirst: boolean | null): ZoneId | null {
  return ADVENTURE_ZONES.find((zone) => laneNumber(zone, goingFirst) === n) ?? null;
}
