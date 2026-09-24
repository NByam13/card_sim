import { HIDDEN_ZONES } from '../sync/types';
import {
  BoardCardBacksProvider,
  BoardDispatchProvider,
  BoardReadOnlyProvider,
  BoardZoomProvider,
  CardBacks,
} from '../context';
import { MlpGameZone } from '../mlp/MlpTable';
import { EMPTY_SELECTION } from '../selection';
import { MirrorState } from '../sync/hydrate';

/**
 * The opponent's half of the table: their board, drawn read-only and flipped so
 * their lanes face yours.
 *
 * Its own provider stack rather than sharing the board's. The mirror has no
 * dispatch, no selection and no keyboard focus of its own, and isolating it is
 * what stops a key aimed at a card ever landing on a board this browser does not
 * own.
 *
 * @see documentation/board-sync/spec.md
 */
export default function MirrorBoard({
  state,
  scale,
  backs,
  name,
  present,
}: {
  state: MirrorState | null;
  scale: number;
  /** The shared backs, which every deck's snapshot carries identically. */
  backs: CardBacks | null;
  name: string;
  present: boolean;
}) {
  if (!state) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
        {present ? `Waiting for ${name} to deal…` : `${name} is not here.`}
      </div>
    );
  }

  return (
    <BoardReadOnlyProvider value={true}>
      <BoardZoomProvider value={scale}>
        <BoardCardBacksProvider value={backs}>
          {/* Nothing in a mirror dispatches; a rogue action should throw here
              rather than silently reach the real board's reducer. */}
          <BoardDispatchProvider
            value={() => {
              throw new Error('the opponent’s mirror cannot dispatch');
            }}
          >
            <div className="space-y-1">
              <div className="flex items-baseline justify-between px-1 text-xs text-gray-500">
                <span className="font-medium text-gray-700">{name}</span>
                <span>
                  {HIDDEN_ZONES.map((zone) => `${LABELS[zone]} ${state.counts[zone]}`).join(' · ')}
                  {!present && ' · away'}
                </span>
              </div>

              <MlpGameZone
                state={state}
                scale={scale}
                selection={EMPTY_SELECTION}
                setSelection={() => {}}
                controls={null}
                mirrored
              />
            </div>
          </BoardDispatchProvider>
        </BoardCardBacksProvider>
      </BoardZoomProvider>
    </BoardReadOnlyProvider>
  );
}

const LABELS: Record<(typeof HIDDEN_ZONES)[number], string> = {
  hand: 'Hand',
  library: 'Deck',
  sceneDeck: 'Scenes',
};
