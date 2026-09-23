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
 * which collapses the ※ shining marker, the Day/Night art variants and the
 * alt-art promos, so `BP02-ER01`, `※BP02-ER01D` and `※BP02-ER01-P` are all one
 * printing.
 *
 * PonyRec sends this as `copy_key` and that is the answer whenever it is there.
 *
 * ---
 *
 * **The fallback is a stand-in**, for decks snapshotted before the endpoint
 * carried the field (NByam13/kayou_structured#170). PonyRec computes the key
 * from `printed_number`, which the endpoint does not send, so it is
 * approximated from the `variant` object it does: an art variant's trailing
 * letter is the variant suffix, and dropping it leaves the base number.
 *
 * That approximation gets the shining and art-variant cases right and **promos
 * wrong**, since an alt-art promo carries no `variant` and its `-P` suffix
 * survives. It cannot do better from what it is given — which is the whole
 * reason the field was added upstream.
 *
 * Only `arrangeSceneDeck` reads this, and it degrades gracefully either way: a
 * Scene Deck misread as multi-printing just shuffles without floating its
 * shining copies. Delete the fallback once no stored snapshot predates the
 * field.
 *
 * @see documentation/local-board/spec.md
 */
export function copyKey(card: Pick<Card, 'card_number' | 'copy_key' | 'variant'>): string {
  if (card.copy_key) {
    return card.copy_key;
  }

  const base = card.card_number.replace(/※/g, '');

  return card.variant?.kind === 'art' ? base.replace(/[A-Z]$/, '') : base;
}

/** A shining printing. The ※ marker leads the rarity code (`※ER`, `※CR`). */
export function isShining(card: Pick<Card, 'rarity'>): boolean {
  return card.rarity.startsWith('※');
}
