import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBoardCardView, useBoardDispatch, useBoardPlanSlot, useBoardTokens } from '../context';
import { MENU_HINTS } from '../shortcuts';
import {
  ADVENTURE_ZONES,
  CardInstance,
  isToken,
  PILE_ZONES,
  PLAN_ZONES,
  STORY_ZONES,
  ZoneId,
} from '../types';

/** In-play zones a card retires from (vs. discarding from Hand) — both go to the Retire pile. */
const RETIRE_FROM: ZoneId[] = [...ADVENTURE_ZONES, ...STORY_ZONES, 'scene', 'reveal'];

/** The subset of those where `r` retires too, so the hint chip can be shown honestly. */
const RETIRE_ON_R: ZoneId[] = [...ADVENTURE_ZONES, 'reveal'];

/**
 * Zones where "Reveal" means something: the card is currently hidden from the
 * Rival. Everything in play is already public, so offering it there would be
 * noise. (Revealing the top of the deck lives on the Library pile menu instead,
 * since that card has no context menu of its own.)
 */
const REVEAL_FROM: ZoneId[] = ['hand', ...PLAN_ZONES];

/** Token flyout geometry: its fixed width, one row's height, and its scroll cap (px). */
const FLYOUT_W = 224;
const FLYOUT_ROW_H = 40;
const FLYOUT_MAX_H = 288;

interface Props {
  instance: CardInstance;
  /** The zone the card sits in — gates the Retire (in-play) / Discard (Hand) actions. */
  zone: ZoneId;
  /** Viewport coordinates where the menu opens (the right-click point). */
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * Right-click / ⋮ menu of per-card actions.
 *
 * Ported from PonyRec's `CardContextMenu.tsx`. Its "View card" row opened a card
 * detail page; here it opens a dialog over the board, which is what a player
 * mid-game wanted from it anyway.
 */
export default function CardContextMenu({ instance, zone, x, y, onClose }: Props) {
  const dispatch = useBoardDispatch();
  const viewCard = useBoardCardView();
  const planSlotAvailable = useBoardPlanSlot() !== null;
  const tokens = useBoardTokens();
  const { uid } = instance;
  // A token has almost no board state of its own: it is not tapped, not turned
  // face down, has no Inspiration and no counters, and was never in a deck it
  // could go back to. So its menu is one row, Remove token, and every other row
  // is gated on this. See Deck.tokens.
  const token = isToken(instance.card);
  // Tokens go onto Characters. An Item sharing the lane cannot be given Candy, so
  // it is not offered the row, though nothing stops a player dragging a token onto
  // one from another lane. A deck that references no token gets no row at all.
  const canSpawnTokens =
    ADVENTURE_ZONES.includes(zone) && tokens.length > 0 && instance.card.subtype === 'character';
  // Where the token flyout sits, or null while it is closed. Measured off the
  // menu and the row rather than laid out beside them, because the menu is a
  // fixed-position portal with `overflow-hidden`, which would clip a nested
  // absolute panel.
  const [flyout, setFlyout] = useState<{ left: number; top: number } | null>(null);
  // A card in a pile is out of play, so the menu offers only the rows that take
  // it somewhere. See PILE_ZONES.
  const inPile = PILE_ZONES.includes(zone);
  // MOVE_CARD with no index appends, and the Retire pile shows its last card on
  // top, so a plain move lands the card on top of the discard pile.
  const toRetire = () => dispatch({ type: 'MOVE_CARD', uid, toZone: 'retire' });

  // Anchor the menu at the click point, but flip it up/left when it would spill off
  // the viewport (e.g. right-clicking a Hand card near the bottom edge). useLayoutEffect
  // measures and corrects before paint, so there's no visible jump.
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    setPos({ left, top });
  }, [x, y]);

  // Close on any outside click, scroll, or Escape.
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  /**
   * Open the token flyout beside its row: to the menu's right normally, and to
   * its left when that would run off the screen. The panel's height is known
   * from the row count (capped by FLYOUT_MAX_H, past which it scrolls), so the
   * top can be clamped into the viewport without measuring it first. Measuring
   * would mean rendering it off-screen for a frame.
   */
  const openFlyout = (event: { currentTarget: HTMLElement }) => {
    const menu = menuRef.current;
    if (!menu) return;
    const menuBox = menu.getBoundingClientRect();
    const rowBox = event.currentTarget.getBoundingClientRect();
    const margin = 8;
    const spillsRight = menuBox.right + FLYOUT_W > window.innerWidth - margin;
    const height = Math.min(tokens.length * FLYOUT_ROW_H + 8, FLYOUT_MAX_H);

    setFlyout({
      left: spillsRight ? Math.max(margin, menuBox.left - FLYOUT_W) : menuBox.right,
      // Aligned with its row, lifted only as far as it must be to stay on screen.
      top: Math.max(margin, Math.min(rowBox.top - 4, window.innerHeight - height - margin)),
    });
  };

  /**
   * One menu row. `hint` is the keyboard binding for the same action, drawn
   * from the shared MENU_HINTS table so the menu and the help overlay agree.
   */
  const item = (label: string, onClick: () => void, hint?: string) => (
    <button
      onClick={run(onClick)}
      // Moving onto any other row dismisses the flyout, the way a submenu behaves
      // everywhere else. Otherwise it hangs over the menu you have moved on to.
      onMouseEnter={() => setFlyout(null)}
      className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-emerald-50"
    >
      <span>{label}</span>
      {hint && (
        <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-semibold text-gray-400">
          {hint}
        </kbd>
      )}
    </button>
  );

  return createPortal(
    // Menu and flyout share a wrapper so that leaving the pair, rather than
    // leaving either one of them, is what dismisses the flyout. It also holds a
    // click anywhere in either back from the window-level close handler.
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onMouseLeave={() => setFlyout(null)}
      style={{ display: 'contents' }}
    >
      <div
        ref={menuRef}
        style={{ left: pos.left, top: pos.top }}
        // z-60, above a pile viewer's z-50 overlay: this menu is also opened on a
        // row inside the Retire viewer, and at equal z-index which one wins would
        // come down to portal mount order.
        className="fixed z-60 min-w-45 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
      >
        {/* Reading the card. First, and the only row offered unconditionally: it
            changes nothing, and it means the same in a pile, on a token and on a
            card lying face down — which is yours, and which you already know. */}
        {item('View card', () => viewCard(instance.card), MENU_HINTS.view)}
        <div className="my-1 border-t border-gray-100" />
        {/* Everything about how the card sits on the board, which is meaningless
                for one lying in a pile and for a token, which has no such state. */}
        {!inPile && !token && (
          <>
            {item(
              instance.tapped ? 'Untap' : 'Tap',
              () => dispatch({ type: 'TAP', uid }),
              MENU_HINTS.tap
            )}
            {item(
              instance.faceDown ? 'Turn face-up' : 'Turn face-down',
              () => dispatch({ type: 'FLIP', uid }),
              MENU_HINTS.flip
            )}
            {/* Entering the Reveal Zone turns the card face up, so this shows a
                        hidden card to the Rival in one action. */}
            {REVEAL_FROM.includes(zone) &&
              item(
                'Reveal',
                () => dispatch({ type: 'MOVE_CARD', uid, toZone: 'reveal' }),
                MENU_HINTS.reveal
              )}
            <div className="my-1 border-t border-gray-100" />
          </>
        )}
        {/* Candy, a Present: the cards a deck puts *onto* a Character. The list is
                whatever this deck references (PonyRec resolves them), so a deck that
                references none shows no row at all. The token lands in the lane, tucked
                behind what is already there. */}
        {canSpawnTokens && (
          <>
            <button
              onMouseEnter={openFlyout}
              onClick={(e) => (flyout ? setFlyout(null) : openFlyout(e))}
              aria-haspopup="menu"
              aria-expanded={flyout !== null}
              className={`flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-emerald-50 ${
                flyout ? 'bg-emerald-50' : ''
              }`}
            >
              <span>Add token</span>
              <span aria-hidden="true" className="text-xs text-gray-400">
                &#9656;
              </span>
            </button>
            <div className="my-1 border-t border-gray-100" />
          </>
        )}
        {/* Picking a card back up. MOVE_CARD reveals on entering the hand, so a
                face-down Plan taken this way arrives readable. */}
        {!token &&
          zone !== 'hand' &&
          item(
            'To hand',
            () => dispatch({ type: 'MOVE_CARD', uid, toZone: 'hand' }),
            MENU_HINTS.toHand
          )}
        {/* Scenes belong to the Scene Deck; everything else to the Main Deck.
                Index 0 is the top (DRAW splices from the front); appending is the bottom. */}
        {!token &&
          item('Send to top of deck', () =>
            dispatch({
              type: 'MOVE_CARD',
              uid,
              toZone: instance.card.subtype === 'scene' ? 'sceneDeck' : 'library',
              toIndex: 0,
            })
          )}
        {!token &&
          item('Send to bottom of deck', () =>
            dispatch({
              type: 'MOVE_CARD',
              uid,
              toZone: instance.card.subtype === 'scene' ? 'sceneDeck' : 'library',
            })
          )}
        {/* BP02-SR07 tucks a card from hand under a Story stage — it must arrive
                face down, so the Rival never learns what you hid. */}
        {zone === 'hand' &&
          planSlotAvailable &&
          item('To Plan (face down)', () => dispatch({ type: 'TO_PLAN', uid }))}
        {/* The `r` hint rides only the rows where the key actually retires, meaning a
                lane or the Reveal Zone. From a Story stage or the Scene Zone it still
                reveals, so hinting it there would lie. */}
        {!token &&
          RETIRE_FROM.includes(zone) &&
          item('Retire', toRetire, RETIRE_ON_R.includes(zone) ? MENU_HINTS.retire : undefined)}
        {/* A token was never in the decklist, so it leaves the board outright
                rather than landing in the Retire pile and its viewer. */}
        {token &&
          item(
            'Remove token',
            () => dispatch({ type: 'REMOVE_CARD', uid }),
            MENU_HINTS.removeToken
          )}
        {zone === 'hand' && item('Discard', toRetire)}
        {/* Numbers a card carries while it is in play. A pile does not track them,
                and a card coming back out of one starts fresh. A token has neither:
                Candy has no printed Inspiration and nothing counts on it. */}
        {!inPile && !token && (
          <>
            <div className="my-1 border-t border-gray-100" />
            {item('Set inspiration…', () => {
              const raw = window.prompt(
                'Set inspiration to:',
                String(instance.inspiration ?? instance.card.inspiration ?? 0)
              );
              if (raw === null) return;
              const value = Number(raw);
              if (Number.isFinite(value)) dispatch({ type: 'SET_INSPIRATION', uids: [uid], value });
            })}
            {item(
              'Reset inspiration',
              () => dispatch({ type: 'SET_INSPIRATION', uids: [uid], value: null }),
              MENU_HINTS.resetInspiration
            )}
            <div className="my-1 border-t border-gray-100" />
            {item('Add counter', () => dispatch({ type: 'ADD_COUNTER', uid }))}
            {item('Remove counter', () => dispatch({ type: 'REMOVE_COUNTER', uid }))}
            {item('Reset counters', () => dispatch({ type: 'RESET_COUNTERS', uid }))}
          </>
        )}
      </div>

      {/* The token flyout. Candy and the Presents are the cards a deck puts *onto*
          a Character. The list is whatever this deck references (PonyRec resolves them),
          so a deck that references none never opens one. The token lands in the
          lane, tucked behind what is already there. */}
      {flyout && (
        <div
          role="menu"
          style={{ left: flyout.left, top: flyout.top, width: FLYOUT_W, maxHeight: FLYOUT_MAX_H }}
          className="fixed z-61 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        >
          {tokens.map((tokenCard) => {
            const thumb = tokenCard.thumb_url;
            return (
              <button
                key={tokenCard.card_number}
                role="menuitem"
                onClick={run(() =>
                  dispatch({ type: 'SPAWN_TOKEN', card: tokenCard, toZone: zone })
                )}
                className="flex w-full items-center gap-2 px-3 py-1 text-left text-sm text-gray-700 hover:bg-emerald-50"
              >
                {thumb && (
                  <img src={thumb} alt="" className="h-8 w-6 shrink-0 rounded-sm object-cover" />
                )}
                <span className="truncate">{tokenCard.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
}
