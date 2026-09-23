import { Card } from '@/types/cards';

/**
 * The MLP domain facts the deal borrows, ported from PonyRec's
 * `resources/js/decks/legality.ts`.
 *
 * The audit's plan is for these to end up inside the MLP setup module once the
 * board is generalised. Until then they live here, where the two things that
 * need them (the Story-stage ordering and the Scene Deck arrangement) can find
 * them.
 */

export const STORY_STAGE_NUMBER: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

/** Sort rank for a story card's stage (unknown stages sort last). */
export function storyStageRank(stage: string | null | undefined): number {
  return STORY_STAGE_NUMBER[stage ?? ''] ?? 99;
}

/**
 * The base printing a card is a copy of: the identity PonyRec's 4-copy cap uses,
 * which collapses the ※ shining marker and the Day/Night art variants so
 * `BP02-ER01`, `※BP02-ER01` and `※BP02-ER01D` are all one printing.
 *
 * ---
 *
 * **This is a stand-in.** PonyRec computes it as
 * `replace(printed_number || card_number, '※', '')`, and `printed_number` is
 * precisely what collapses an art variant (`Card::copyKey()` reads it when
 * `variant_kind === 'art'`). The deck endpoint does not return `printed_number`,
 * so that path is reconstructed here from the `variant` object it does return:
 * an art variant's trailing letter is the variant suffix, and dropping it leaves
 * the base number.
 *
 * The right fix is on PonyRec — `printed_number` already survives `CardPool`'s
 * column pruning, annotated "client copyKey", so the field exists and is meant
 * for this consumer; the deck endpoint simply omitted it. When it lands, this
 * whole function becomes the one-line original.
 *
 * Only `arrangeSceneDeck` reads this, and it degrades gracefully: a Scene Deck
 * misread as multi-printing just shuffles without floating its shining copies.
 *
 * @see documentation/local-board/spec.md
 */
export function copyKey(card: Pick<Card, 'card_number' | 'variant'>): string {
  const base = card.card_number.replace(/※/g, '');

  return card.variant?.kind === 'art' ? base.replace(/[A-Z]$/, '') : base;
}

/** A shining printing. The ※ marker leads the rarity code (`※ER`, `※CR`). */
export function isShining(card: Pick<Card, 'rarity'>): boolean {
  return card.rarity.startsWith('※');
}
