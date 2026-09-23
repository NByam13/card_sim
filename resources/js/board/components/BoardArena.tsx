import { Deck } from '@/types/cards';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoardFocusProvider, BoardTokensProvider } from '../context';
import { useHoverFollowsPointer } from '../hoverTarget';
import { MlpGameZone, MlpOutOfPlayBar } from '../mlp/MlpTable';
import {
  EMPTY_SELECTION,
  pruneSelection,
  selectionAfterClick,
  selectionAfterToggle,
} from '../selection';
import { GameState, ZoneId } from '../types';
import { useBoardShortcuts } from '../useBoardShortcuts';
import { nextPlanSlot, promotionTarget, useGame } from '../useGame';
import BoardControls from './BoardControls';
import BoardShell from './BoardShell';
import Randomizers from './Randomizers';
import ShortcutOverlay from './ShortcutOverlay';
import ShortcutsButton from './ShortcutsButton';
import Toast from './Toast';
import ZoneViewerModal from './ZoneViewerModal';

/**
 * A whole playable board: the game state, everything that acts on it, and the
 * surfaces layered over it.
 *
 * Ported from PonyRec's `PlaytestArena.tsx`. What did not come over is the
 * multiplayer half — the shared turn cursor, the rival's mirror, the action log
 * and the announcement toast — which arrives with the slices that own it.
 *
 * @see documentation/local-board/spec.md
 */

/** How long a toast stays up. */
const TOAST_MS = 1800;

function useToast() {
  const [message, setMessage] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toast = useCallback((next: string) => {
    setMessage(next);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { message, show, toast };
}

export default function BoardArena({
  deck,
  scale,
  savedState,
  onState,
  header,
}: {
  deck: Deck;
  /** Card zoom factor (the board itself stays at 1×; only cards scale). */
  scale: number;
  /** Resume from a persisted board instead of dealing fresh. */
  savedState?: GameState | null;
  /** Fires with every new game state, including the initial one on mount. */
  onState?: (state: GameState) => void;
  /**
   * Caller chrome that scrolls above the table. Handed to the shell so it lands
   * inside the scroll area; rendering it here as a sibling would pin it above
   * the board instead.
   */
  header?: ReactNode;
}) {
  const { state, dispatch } = useGame(deck, savedState);
  const { message, show, toast } = useToast();
  const [viewer, setViewer] = useState<Extract<ZoneId, 'library' | 'retire' | 'sceneDeck'> | null>(
    null
  );
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Which card the keyboard shortcuts act on. Tracked here rather than in the
  // shell so the hook can resolve the uid against the current state.
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // The marquee multi-selection. Local UI state on purpose: it is never part of
  // `GameState`, so it will never be persisted, redacted, or sent to an
  // opponent. What you have highlighted is yours alone.
  const [selection, setSelection] = useState<ReadonlySet<string>>(EMPTY_SELECTION);
  const clearSelection = useCallback(() => setSelection(EMPTY_SELECTION), []);
  const focus = useMemo(
    () => ({
      setHovered,
      setSelected,
      selection,
      clickCard: (uid: string) => setSelection((s) => selectionAfterClick(s, uid)),
      toggleCard: (uid: string) => setSelection((s) => selectionAfterToggle(s, uid)),
    }),
    [selection]
  );

  // A card can leave the selection without anyone deselecting it: a token is
  // removed from the board outright, and a card sent to a pile stops being drawn
  // as a card at all. Either way the chip would go on counting something nobody
  // can see. `pruneSelection` returns the same set when nothing changed, so this
  // settles immediately instead of re-rendering the board on every state change.
  useEffect(() => {
    setSelection((s) => pruneSelection(s, state.zones));
  }, [state]);

  // Mouse events alone leave `hovered` stale whenever the board re-lays out
  // under a still cursor, which is exactly what revealing a card from hand does.
  useHoverFollowsPointer(state, setHovered);

  const toggleShortcuts = useCallback(() => setShowShortcuts((open) => !open), []);

  // Escape drops the selection, but only once the surfaces that already own
  // Escape have had it. A pile viewer is the thing you meant to close, and
  // clearing the selection out from under it would be a second, unasked-for
  // undo. The card menu closes itself, so it is not checked here.
  useEffect(() => {
    if (selection.size === 0 || viewer !== null || showShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, viewer, showShortcuts, clearSelection]);

  // The callback rides a ref so the effect fires on state changes only — a
  // parent re-render with a fresh closure must not re-announce an unchanged
  // state.
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  useEffect(() => {
    onStateRef.current?.(state);
  }, [state]);

  // Playing a half-built deck is allowed; just flag what is missing. The deck
  // endpoint deliberately does not refuse an incomplete deck, so deciding what
  // one means is the table's job.
  const issues = useMemo(() => {
    const sum = (zone: string) =>
      deck.cards.filter((e) => e.zone === zone).reduce((n, e) => n + e.quantity, 0);
    const list: string[] = [];
    if (!deck.main_character) list.push('no Main Character');
    if (sum('story') !== 4) list.push('Story Deck incomplete');
    if (sum('main') < 50) list.push('Main Deck under 50');
    if (sum('scene') < 15) list.push('Scene Deck under 15');
    return list;
  }, [deck]);

  const draw = () => {
    if (state.zones.library.length === 0) {
      toast('Main Deck is empty');
      return;
    }
    dispatch({ type: 'DRAW', n: 1 });
  };

  const nextTurn = () => {
    if (state.zones.library.length === 0) {
      toast('Main Deck empty — you would lose in a real game');
    }
    dispatch({ type: 'NEXT_TURN' });
  };

  const revealScene = () => {
    if (state.zones.sceneDeck.length === 0) {
      toast('Scene Deck is empty');
      return;
    }
    dispatch({ type: 'REVEAL_SCENE' });
  };

  /**
   * Show the top card of the Main Deck to your opponent. The top card has no
   * context menu of its own (the pile renders it directly), so this is the
   * Library menu's counterpart to a hand card's Reveal.
   */
  const revealTopCard = () => {
    const top = state.zones.library[0];
    if (!top) {
      toast('Main Deck is empty');
      return;
    }
    dispatch({ type: 'MOVE_CARD', uid: top.uid, toZone: 'reveal' });
  };

  /**
   * Move the top card of the Main Deck into a Plan slot, face down — the
   * BP02-C13 effect. The slot is chosen by the reducer (refills run IV→I).
   */
  const topCardToPlan = () => {
    const top = state.zones.library[0];
    if (!top) {
      toast('Main Deck is empty');
      return;
    }
    if (!nextPlanSlot(state.zones)) {
      toast('All four Plan slots are full');
      return;
    }
    dispatch({ type: 'TO_PLAN', uid: top.uid });
  };

  /**
   * Advance the Main Character one Story stage (its rail → I → II → III → IV).
   * Board-scoped rather than hover-scoped: the Main Character sits on the far
   * rail, often off-screen at the zoom levels people actually play at.
   */
  const promoteStage = () => {
    const target = promotionTarget(state.zones);
    if (!target) {
      toast('No Main Character on the board');
      return;
    }
    if (!target.to) {
      toast('Already at Story Stage IV');
      return;
    }
    dispatch({ type: 'PROMOTE_STAGE' });
  };

  useBoardShortcuts({
    state,
    dispatch,
    hovered,
    selected,
    selection,
    onDraw: draw,
    onNextTurn: nextTurn,
    onRevealScene: revealScene,
    onTopCardToPlan: topCardToPlan,
    onPromoteStage: promoteStage,
    onToggleHelp: toggleShortcuts,
    // A pile viewer is the softer keyboard case: the Retire pile is public and
    // its rows are real cards, so it keeps the card bindings and hovering a row
    // aims them, while the hidden piles hand nothing over. Pulling out of those
    // has to reshuffle what reading them exposed (the TUTOR action), which a raw
    // shortcut would skip.
    enabled: viewer === null || viewer === 'retire',
    scope: viewer === null ? 'all' : 'card',
  });

  const controls = (
    <>
      <BoardControls
        started={state.started}
        goingFirst={state.goingFirst}
        onGoingFirstChange={(value) => dispatch({ type: 'SET_GOING_FIRST', goingFirst: value })}
        onStartGame={() => dispatch({ type: 'START_GAME' })}
        mulliganed={state.mulliganed}
        onMulligan={() => dispatch({ type: 'MULLIGAN' })}
        onRestart={() => dispatch({ type: 'RESTART' })}
        onShuffleLibrary={() => dispatch({ type: 'SHUFFLE_LIBRARY' })}
        onDraw={draw}
        onNextTurn={nextTurn}
      />
      <Randomizers onResult={toast} />
      <ShortcutsButton onClick={toggleShortcuts} />
    </>
  );

  return (
    <BoardTokensProvider value={deck.tokens}>
      <BoardFocusProvider value={focus}>
        <BoardShell
          state={state}
          dispatch={dispatch}
          scale={scale}
          backs={deck.card_backs ?? null}
          selection={selection}
          setSelection={setSelection}
          header={
            <>
              {header}
              {issues.length > 0 && !noticeDismissed && (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                  <span>Incomplete deck — playing what&rsquo;s here ({issues.join(', ')}).</span>
                  <button
                    onClick={() => setNoticeDismissed(true)}
                    className="shrink-0 font-semibold hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </>
          }
          gameZone={
            <MlpGameZone
              state={state}
              scale={scale}
              selection={selection}
              setSelection={setSelection}
              controls={controls}
            />
          }
          outOfPlayBar={(hand) => (
            <MlpOutOfPlayBar
              state={state}
              dispatch={dispatch}
              hand={hand}
              actions={{
                onShuffleSceneDeck: () => dispatch({ type: 'SHUFFLE_SCENE_DECK' }),
                onOpenSceneDeck: () => setViewer('sceneDeck'),
                onOpenLibrary: () => setViewer('library'),
                onOpenRetire: () => setViewer('retire'),
                onDrawFromLibrary: draw,
                onRevealScene: revealScene,
                onTopCardToPlan: topCardToPlan,
                onRevealTopCard: revealTopCard,
              }}
            />
          )}
        />

        {viewer && (
          <ZoneViewerModal
            zone={viewer}
            cards={state.zones[viewer]}
            dispatch={dispatch}
            onClose={() => setViewer(null)}
          />
        )}

        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}

        <Toast show={show} message={message} />
      </BoardFocusProvider>
    </BoardTokensProvider>
  );
}
