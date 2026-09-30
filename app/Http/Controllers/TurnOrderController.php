<?php

namespace App\Http\Controllers;

use App\Enums\Seat;
use App\Events\TurnOrderDecided;
use App\Events\TurnOrderRolled;
use App\Models\Game;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Deciding who goes first: roll the dice, then the winner elects.
 *
 * The seat is always derived from the session, never read from the request.
 */
class TurnOrderController extends Controller
{
    /** Roll for turn order, or return the roll already stored. */
    public function roll(Game $game, Request $request): JsonResponse
    {
        $this->activeSeatOrAbort($game, $request);

        if ($game->recordTurnOrderRoll(Game::rollForTurnOrder())) {
            TurnOrderRolled::dispatch($game);
        }

        return response()->json(['roll' => $game->turn_order_roll]);
    }

    /** The roll winner chooses which seat goes first. */
    public function elect(Game $game, Request $request): JsonResponse
    {
        $seat = $this->activeSeatOrAbort($game, $request);
        $rollWinner = $game->rollWinner();

        abort_if($rollWinner === null, 403, 'Nobody has rolled for turn order yet.');
        abort_if($seat !== $rollWinner, 403, 'Only the roll winner chooses who goes first.');

        $validated = $request->validate([
            'first_player' => ['required', Rule::enum(Seat::class)],
        ]);

        abort_if(
            ! $game->electFirstPlayer(Seat::from($validated['first_player'])),
            403,
            'Turn order is already decided.',
        );

        TurnOrderDecided::dispatch($game, $game->first_player);

        return response()->json(['first_player' => $game->first_player->value]);
    }
}
