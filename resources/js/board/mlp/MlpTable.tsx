import { Dispatch, ReactNode } from 'react';
import { HandWiring } from '../components/BoardShell';
import { BASE_WIDTH } from '../components/CardFace';
import DeckPile from '../components/DeckPile';
import HandZone from '../components/HandZone';
import SelectionChip from '../components/SelectionChip';
import Zone from '../components/Zone';
import { EMPTY_SELECTION } from '../selection';
import { MENU_HINTS } from '../shortcuts';
import { ADVENTURE_ZONES, GameState, laneNumber, PLAN_ZONES, STORY_ZONES } from '../types';
import { Action } from '../useGame';

/**
 * The MLP table: where its zones sit, and what its piles offer.
 *
 * This is the half of PonyRec's `PlaytestBoard` where the game *is* the code —
 * a Main Character rail, three Adventure lanes and a Reveal gutter, four Story
 * stages each with a Plan overlapping it, a Scene fan, and an out-of-play bar of
 * Scene Deck / Hand / Library / Retire. None of it generalises by being
 * parameterised, which is why the audit calls for a setup module to supply a
 * layout component rather than a config describing one.
 *
 * Kept in its own directory so the shape of that eventual seam is already
 * visible: `board/` is the generic table, `board/mlp/` is this game's answer to
 * it. The seam itself is not built yet — see the spec.
 *
 * @see documentation/local-board/spec.md
 */

const STAGE_LABELS = ['I', 'II', 'III', 'IV'];

/** Actions the piles' menus fire, all owned by the arena above this. */
export interface TableActions {
  onShuffleSceneDeck: () => void;
  onOpenSceneDeck: () => void;
  onOpenLibrary: () => void;
  onOpenRetire: () => void;
  onDrawFromLibrary: () => void;
  onRevealScene: () => void;
  /** BP02-C13: top of the Main Deck becomes a Plan, face down. */
  onTopCardToPlan: () => void;
  /** Show the top card of the Main Deck to the opponent. */
  onRevealTopCard: () => void;
}

/** The table proper — everything in play. Lives inside the shell's scroll area. */
export function MlpGameZone({
  state,
  scale,
  selection,
  setSelection,
  controls,
}: {
  state: GameState;
  scale: number;
  selection: ReadonlySet<string>;
  setSelection: (next: ReadonlySet<string>) => void;
  controls: ReactNode;
}) {
  const z = (id: (typeof ADVENTURE_ZONES)[number] | Parameters<typeof laneNumber>[0]) =>
    state.zones[id];

  // Reserve room for one portrait card plus padding, so a zone holds its size
  // before and after a drop and grows in step with the card zoom.
  const slot = {
    minWidth: BASE_WIDTH * scale + 24,
    minHeight: (BASE_WIDTH * scale * 88) / 63 + 16,
  };

  return (
    // Bordered and raised to set the table apart from the out-of-play bar. Grows
    // to fill the scroll area so a short board still reaches down to the bar.
    // Stays at 1× scale; cards size themselves from the zoom factor.
    <div className="relative grid flex-1 grid-cols-[auto_1fr_auto] gap-3 rounded-xl border border-gray-300 bg-white/70 p-2">
      {/*
        Anchored to this box rather than the viewport, so it keeps the table's
        top-left corner whatever the board is zoomed to.
      */}
      <SelectionChip count={selection.size} onClear={() => setSelection(EMPTY_SELECTION)} />

      {/* Left rail — the Main Character waits here, level with the Scene Zone. */}
      <div className="flex flex-col justify-around">
        <Zone
          id="mainChar"
          label="Main Character"
          cards={z('mainChar')}
          // Centre the card in a slot sized to hold one, so the rail keeps its
          // width whether or not the Main Character is currently seated in it.
          fill
          style={slot}
        />
      </div>

      {/* Centre: Adventure lanes → Story stages → Scene Zone. */}
      <div className="flex flex-col justify-between space-y-3">
        {/*
          Lanes stay centred in the column so they will line up with the
          opponent's across the seam. The Reveal Zone lives in the right-hand
          gutter — the equal 1fr cells keep the lanes centred no matter how much
          it holds, and it costs the board no extra height.
        */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
          <div aria-hidden />
          <div className="flex justify-center gap-3">
            {ADVENTURE_ZONES.map((aid) => (
              <Zone
                key={aid}
                id={aid}
                // Numbered by contact order, which reverses when you are on the
                // draw (the rightmost lane becomes Lane 1).
                label={`Lane ${laneNumber(aid, state.goingFirst)}`}
                cards={z(aid)}
                // A character and the item adorned onto it share a lane — overlap
                // them so the item peeks out from behind the character.
                overlap
                style={slot}
              />
            ))}
          </div>
          <div className="flex min-w-0 justify-start">
            <Zone
              id="reveal"
              // Short on purpose: the longer "Reveal Zone" wraps inside the
              // zone's own header at low zoom.
              label="Reveal"
              cards={z('reveal')}
              count={z('reveal').length}
              // Dashed and set well off the lanes so it never reads as a fourth
              // Adventure lane.
              className="ml-6 max-w-full border-dashed"
              style={slot}
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {STORY_ZONES.map((sid, i) => (
            // A stage stacks a landscape Story card (bottom) and a 50%-overlapping
            // Plan (top half), 1.45 card-widths tall, with the portrait Main
            // Character standing on top once it advances onto the stage.
            <div key={sid} className="relative">
              <Zone
                id={sid}
                label={`Story ${STAGE_LABELS[i]}`}
                cards={z(sid)}
                stack
                stackHeight={1.45 * BASE_WIDTH * scale}
              />
              <Zone
                id={PLAN_ZONES[i]}
                label="Plan"
                cards={z(PLAN_ZONES[i])}
                bare
                centered
                // Pinned to the top of the stack area (below the ~26px header) so
                // it overlaps exactly the Story card's top half.
                className="absolute inset-x-1 top-1 z-10 min-h-6"
              />
            </div>
          ))}
        </div>

        <Zone
          id="scene"
          label="Scene Zone"
          cards={z('scene')}
          count={z('scene').length}
          // A Scene Deck runs to 15 cards, so let them slide under each other
          // like the Hand rather than wrapping onto a second row and eating
          // height the two-player table cannot spare.
          fan
          // Scales with the cards instead of a fixed floor, which left dead space
          // when zoomed out and cramped them zoomed in.
          style={{ minHeight: (BASE_WIDTH * scale * 88) / 63 + 16 }}
        />
      </div>

      {/*
        Right rail: controls. Opted out of the marquee, since dragging from a gap
        between two buttons is a slip rather than an attempt to select the board
        behind them. Opted back into text selection, so a log can be copied.
      */}
      <div data-no-marquee className="flex flex-col items-center space-y-2 select-text">
        {controls}
      </div>
    </div>
  );
}

/**
 * Scene Deck | Hand | Library | Retire.
 *
 * `relative` only to keep the stacking it had as a sticky element; it must never
 * be `fixed` or `sticky`, and must never move inside the scroll area above it.
 * See the shell.
 */
export function MlpOutOfPlayBar({
  state,
  dispatch,
  hand,
  actions,
}: {
  state: GameState;
  dispatch: Dispatch<Action>;
  hand: HandWiring;
  actions: TableActions;
}) {
  return (
    <div className="relative z-30 flex shrink-0 items-start gap-3 border-t-2 border-gray-300 bg-gray-100/95 px-4 pt-3 pb-2 backdrop-blur sm:px-6 lg:px-8">
      <div className="shrink-0">
        <DeckPile
          id="sceneDeck"
          label="Scene Deck"
          cards={state.zones.sceneDeck}
          onDraw={actions.onRevealScene}
          menu={{
            label: 'Scene Deck',
            items: [
              { label: 'Shuffle', onClick: actions.onShuffleSceneDeck },
              { label: 'View', onClick: actions.onOpenSceneDeck },
              {
                label: 'Draw scene',
                onClick: actions.onRevealScene,
                hint: MENU_HINTS.drawScene,
              },
            ],
          }}
        />
      </div>

      <div className="flex min-w-0 flex-1">
        <HandZone cards={state.zones.hand} cardsRef={hand.cardsRef} dropIndex={hand.dropIndex} />
      </div>

      <div className="shrink-0">
        <DeckPile
          id="library"
          label="Library"
          cards={state.zones.library}
          onDraw={actions.onDrawFromLibrary}
          menu={{
            label: 'Library',
            items: [
              { label: 'Shuffle', onClick: () => dispatch({ type: 'SHUFFLE_LIBRARY' }) },
              { label: 'View', onClick: actions.onOpenLibrary },
              { label: 'Draw', onClick: actions.onDrawFromLibrary, hint: MENU_HINTS.draw },
              {
                label: 'Reveal top card',
                onClick: actions.onRevealTopCard,
                hint: MENU_HINTS.revealTopCard,
              },
              {
                label: 'Top card to Plan',
                onClick: actions.onTopCardToPlan,
                hint: MENU_HINTS.topCardToPlan,
              },
            ],
          }}
        />
      </div>

      <div className="shrink-0">
        <DeckPile
          id="retire"
          label="Retire"
          cards={state.zones.retire}
          faceUp
          topFromEnd
          // Looking through your own discard pile is the only thing this pile is
          // for, so the whole zone is the way in. The menu keeps the same action
          // for anyone arriving by keyboard or right-click.
          onOpenPile={actions.onOpenRetire}
          menu={{ label: 'Retire', items: [{ label: 'View', onClick: actions.onOpenRetire }] }}
        />
      </div>
    </div>
  );
}
