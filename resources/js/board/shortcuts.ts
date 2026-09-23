/**
 * Every keyboard binding on the board, declared once.
 *
 * The help overlay renders this list, and the card context menu renders a hint
 * chip next to any action that appears here — so a binding can never be added to
 * the handler without showing up in both places.
 *
 * Ported from PonyRec's `shortcuts.ts`, less `v` (View card): that opened a card
 * detail page this app does not have. The hover preview already enlarges a card,
 * so nothing is lost until there is a page to open.
 */
export interface Shortcut {
  /** The key as the user presses it (also what the hint chip displays). */
  key: string;
  label: string;
  /**
   * `card` bindings act on the card under the cursor (falling back to the one
   * whose context menu is open); `board` bindings always act on the board.
   */
  scope: 'card' | 'board';
}

export const SHORTCUTS: readonly Shortcut[] = [
  { key: 't', label: 'Tap / untap', scope: 'card' },
  { key: 'f', label: 'Turn face up / down', scope: 'card' },
  // One key, read from where the card is: nothing in a lane is hidden, so
  // there is no reveal to make, and retiring is the action a lane (and a card
  // already sitting in the Reveal Zone) actually wants.
  { key: 'r', label: 'Reveal, Retire from a lane / Reveal Zone, or remove a token', scope: 'card' },
  { key: 'h', label: 'Return to hand', scope: 'card' },
  // Numbered by the lane labels, which reverse when you are on the draw.
  { key: '1 2 3', label: 'Play to Adventure Lane 1 / 2 / 3', scope: 'card' },
  { key: 'z', label: 'Reset inspiration', scope: 'card' },
  { key: 'x', label: 'Promote Main Character a stage', scope: 'board' },
  { key: 'p', label: 'Top of deck to Plan', scope: 'board' },
  { key: 'Space', label: 'Next turn', scope: 'board' },
  { key: 'd', label: 'Draw a card', scope: 'board' },
  { key: 's', label: 'Reveal a Scene', scope: 'board' },
  { key: '?', label: 'Show / hide this list', scope: 'board' },
  { key: 'Esc', label: 'Close menu or dialog, or clear the selection', scope: 'board' },
];

/**
 * The bindings a context menu labels, for the card menu and the deck piles'
 * menus alike. Keyed by the menu action rather than the key, so renaming a
 * binding is a one-line change here.
 */
export const MENU_HINTS = {
  tap: 't',
  flip: 'f',
  reveal: 'r',
  // The same key, and only offered on the rows where it retires: a card in an
  // Adventure lane or in the Reveal Zone. Elsewhere `r` reveals, so hinting it
  // there would lie.
  retire: 'r',
  // Same key again, on a token: it has no Retire pile to go to, so `r` takes it
  // off the board. See isToken().
  removeToken: 'r',
  toHand: 'h',
  resetInspiration: 'z',
  // The deck piles' own menus. `p` plans the top of the deck, which is what the
  // Library pile's row does — but NOT what the card menu's "To Plan" row does
  // (that one tucks the hand card you right-clicked), so the two are separate
  // entries and only this one carries a key.
  draw: 'd',
  drawScene: 's',
  revealTopCard: 'r',
  topCardToPlan: 'p',
} as const;

/**
 * True when the keystroke belongs to whatever the user is typing into rather
 * than to the board. Without this, typing a deck name containing "d" would draw
 * a card. `isContentEditable` covers rich-text widgets that aren't inputs.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
