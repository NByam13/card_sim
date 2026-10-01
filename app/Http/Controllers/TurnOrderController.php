<?php

namespace App\Http\Controllers;

use App\Events\TurnOrderDecided;
use App\Events\TurnOrderRolled;
use App\Http\Requests\ActiveSeatRequest;
use App\Http\Requests\ElectFirstPlayerRequest;
use App\Models\Game;
use Illuminate\Http\JsonResponse;

/**
 * Deciding who goes first: roll the dice, then the winner elects.
 */
class TurnOrderController extends Controller
{
    /** Roll for turn order, or return the roll already stored. */
    public function roll(Game $game, ActiveSeatRequest $request): JsonResponse
    {
        if ($game->recordTurnOrderRoll(Game::rollForTurnOrder())) {
            TurnOrderRolled::dispatch($game);
        }

        abort_if($game->turn_order_roll === null, 403, 'This match is not in play.');

        return response()->json(['roll' => $game->turn_order_roll]);
    }

    /** The roll winner chooses which seat goes first. */
    public function elect(Game $game, ElectFirstPlayerRequest $request): JsonResponse
    {
        abort_if(! $game->electFirstPlayer($request->firstPlayer()), 403, 'Turn order is already decided.');

        TurnOrderDecided::dispatch($game, $game->first_player);

        return response()->json(['first_player' => $game->first_player->value]);
    }
}
