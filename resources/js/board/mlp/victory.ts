import { GameState } from '../types';
import { promotionTarget } from '../useGame';

/** Whether this board's Main Character stands on Story Stage IV, MLP's win condition. */
export function mainCharacterOnFinalStage(state: GameState): boolean {
  return state.started && promotionTarget(state.zones)?.from === 'storyIV';
}
