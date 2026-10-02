<?php

namespace App\Http\Controllers;

use App\Events\TurnOrderDecided;
use App\Events\TurnOrderRolled;
use App\Http\Requests\ElectFirstPlayerRequest;
use App\Http\Requests\RollTurnOrderRequest;
use App\Models\Game;
use Illuminate\Http\JsonResponse;

/**
 * Deciding who goes first: roll the dice, then the winner elects. Between games
 * of a Bo3 there is no roll, and the loser elects.
 */
class TurnOrderController extends Controller
{
    /** Roll for turn order, or return the roll already stored. */
    public function roll(Game $game, RollTurnOrderRequest $request): JsonResponse
    {
        if ($game->recordTurnOrderRoll(Game::rollForTurnOrder())) {
            TurnOrderRolled::dispatch($game);
        }

        abort_if($game->turn_order_roll === null, 403, 'This match is not in play.');

        return response()->json(['roll' => $game->turn_order_roll]);
    }

    /** The roll winner, or the last game's loser, chooses which seat goes first. */
    public function elect(Game $game, ElectFirstPlayerRequest $request): JsonResponse
    {
        if (! $game->electFirstPlayer($request->firstPlayer())) {
            abort_if($game->fresh()?->game_number !== $request->gameNumber(), 409, 'That was for an earlier game.');
            abort(403, 'Turn order is already decided.');
        }

        TurnOrderDecided::dispatch($game, $game->first_player);

        return response()->json(['first_player' => $game->first_player->value, 'game_number' => $game->game_number]);
    }
}
