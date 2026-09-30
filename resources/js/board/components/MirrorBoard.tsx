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
import MirrorRetire from './MirrorRetire';
import ZoomControls from './ZoomControls';

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
  onScaleChange,
  backs,
  name,
  present,
  goingFirst,
}: {
  state: MirrorState | null;
  scale: number;
  /** The mirror keeps its own scale: it is glanced at where your board is worked on. */
  onScaleChange: (next: number) => void;
  /** The shared backs, which every deck's snapshot carries identically. */
  backs: CardBacks | null;
  name: string;
  present: boolean;
  /** Whether the opponent is on the play, which numbers their lanes. Null until decided. */
  goingFirst: boolean | null;
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
              <div className="flex items-center justify-between gap-3 px-1 text-xs text-gray-500">
                <span className="font-medium text-gray-700">{name}</span>
                <div className="flex items-center gap-3">
                  <span>
                    {HIDDEN_ZONES.map((zone) => `${LABELS[zone]} ${state.counts[zone]}`).join(
                      ' · '
                    )}
                    {!present && ' · away'}
                  </span>
                  {/* Public, so it is shown rather than counted. */}
                  <MirrorRetire cards={state.zones.retire} scale={scale} />
                  <ZoomControls scale={scale} onChange={onScaleChange} />
                </div>
              </div>

              <MlpGameZone
                state={{ ...state, goingFirst }}
                scale={scale}
                selection={EMPTY_SELECTION}
                setSelection={() => {}}
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
