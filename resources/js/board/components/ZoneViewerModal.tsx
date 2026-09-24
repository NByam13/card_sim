import Modal from '@/components/Modal';
import { Dispatch, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { BoardDispatchProvider, useBoardFocus } from '../context';
import { isTypingTarget } from '../shortcuts';
import { CardInstance } from '../types';
import { Action } from '../useGame';
import { HoverPreview } from './BoardCard';
import CardContextMenu from './CardContextMenu';

/** Ported from PonyRec's `ZoneViewerModal.tsx`. */

const ACTION_BTN =
  'rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 transition hover:bg-gray-50';

/** How long the pointer must rest on a row before its zoom preview pops, matching the board. */
const HOVER_DWELL_MS = 500;

/**
 * One card in the viewer: thumbnail, name, and whatever tutor buttons the zone
 * offers.
 *
 * A `live` row is a full citizen of the board rather than a list entry. It shows
 * the same hover zoom every other card on the table shows, reports itself as the
 * keyboard's target, and opens the same right-click menu, so browsing your Retire
 * pile and pulling a card back to a lane takes the keys you already use.
 *
 * Only the Retire pile gets that. Library and Scene Deck are hidden piles, and
 * taking a card out of one has to reshuffle what reading it exposed (the TUTOR
 * action, which the buttons here dispatch and a raw shortcut would not), so those
 * two keep the preview and leave the keyboard alone.
 */
function ViewerRow({
  instance,
  live,
  actions,
}: {
  instance: CardInstance;
  live: boolean;
  actions: ReactNode;
}) {
  const focus = useBoardFocus();
  const [preview, setPreview] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const startHover = () => {
    clearTimeout(dwell.current);
    dwell.current = setTimeout(() => setPreview(true), HOVER_DWELL_MS);
    if (!live) return;
    focus.setHovered(instance.uid);
    // The search field takes focus when the viewer opens and would otherwise
    // swallow every card key as a search term. Moving the pointer onto a card is
    // the player aiming at that card, so the keyboard goes with it; clicking back
    // into the field takes it straight back.
    const active = document.activeElement;
    if (active instanceof HTMLElement && isTypingTarget(active)) active.blur();
  };

  const endHover = () => {
    clearTimeout(dwell.current);
    setPreview(false);
    if (live) focus.setHovered(null);
  };

  // A shortcut can move this card out of the pile, unmounting the row while the
  // pointer still rests on it. Nothing fires mouseleave then, so release the
  // dwell timer here.
  useEffect(() => () => clearTimeout(dwell.current), []);

  return (
    <div
      // The same marker a board card carries, so the hit test that re-resolves
      // the keyboard's target after every move can find this row too.
      data-card-uid={live ? instance.uid : undefined}
      onMouseEnter={startHover}
      onMouseLeave={endHover}
      onContextMenu={
        live
          ? (e) => {
              e.preventDefault();
              focus.setSelected(instance.uid);
              setMenu({ x: e.clientX, y: e.clientY });
            }
          : undefined
      }
      className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-gray-50"
    >
      <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-gray-200">
        {instance.card.thumb_url && (
          <img src={instance.card.thumb_url} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-800">{instance.card.name}</p>
        <p className="text-xs capitalize text-gray-400">{instance.card.subtype ?? 'card'}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">{actions}</div>

      {preview && <HoverPreview card={instance.card} />}

      {menu && (
        <CardContextMenu
          instance={instance}
          zone="retire"
          x={menu.x}
          y={menu.y}
          onClose={() => {
            focus.setSelected(null);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Searchable viewer for a hidden/pile zone. Library and Retire can tutor a card to
 * hand (Library also to the top of the deck); pulling from the library reshuffles
 * the remainder, handled in the reducer's TUTOR action.
 */
export default function ZoneViewerModal({
  zone,
  cards,
  dispatch,
  onClose,
}: {
  zone: 'library' | 'retire' | 'sceneDeck';
  cards: CardInstance[];
  dispatch: Dispatch<Action>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const title = zone === 'library' ? 'Library' : zone === 'sceneDeck' ? 'Scene Deck' : 'Retire';
  // Retire is public and its cards move by plain MOVE_CARD, so its rows can carry
  // the board's own card behaviour. See the note on ViewerRow.
  const live = zone === 'retire';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? cards.filter((c) => c.card.name.toLowerCase().includes(q)) : cards;
  }, [cards, query]);

  return (
    <Modal show onClose={onClose} maxWidth="lg">
      {/* A row's context menu dispatches like any card on the board does, and it
                reads the dispatcher from context. This modal is a sibling of the board
                rather than a child of it, so it has to provide its own. */}
      <BoardDispatchProvider value={dispatch}>
        <div className="bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-gray-900">
              {title} <span className="text-sm font-normal text-gray-400">({cards.length})</span>
            </h2>
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700">
              Close
            </button>
          </div>

          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()} by name…`}
            className="mb-3 w-full rounded-lg border-gray-300 text-sm focus:border-accent-500 focus:ring-accent-500"
          />

          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">No matching cards.</p>
            )}
            {filtered.map((c) => (
              <ViewerRow
                key={c.uid}
                instance={c}
                live={live}
                actions={
                  <>
                    {zone === 'sceneDeck' && (
                      <button
                        onClick={() => dispatch({ type: 'TUTOR', uid: c.uid, toZone: 'scene' })}
                        className={ACTION_BTN}
                      >
                        To scene
                      </button>
                    )}
                    <button
                      onClick={() => dispatch({ type: 'TUTOR', uid: c.uid, toZone: 'hand' })}
                      className={ACTION_BTN}
                    >
                      To hand
                    </button>
                    {zone === 'library' && (
                      <button
                        onClick={() =>
                          dispatch({ type: 'TUTOR', uid: c.uid, toZone: 'library', toTop: true })
                        }
                        className={ACTION_BTN}
                      >
                        To top
                      </button>
                    )}
                    {/* The counterpart to "To top": TUTOR with no index appends,
                                        and a draw takes index 0, so appending is the bottom. */}
                    {zone !== 'retire' && (
                      <button
                        onClick={() => dispatch({ type: 'TUTOR', uid: c.uid, toZone: zone })}
                        className={ACTION_BTN}
                      >
                        To bottom
                      </button>
                    )}
                  </>
                }
              />
            ))}
          </div>
        </div>
      </BoardDispatchProvider>
    </Modal>
  );
}
