<?php

namespace App\Http\Controllers;

use App\Enums\WinReason;
use App\Http\Requests\ClaimWinRequest;
use App\Models\Game;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

/**
 * Ending the game in progress, for the seat the session holds.
 */
class GameResultController extends Controller
{
    /** Claim the game: this seat's Main Character reached the final Story stage. */
    public function claim(Game $game, ClaimWinRequest $request): JsonResponse
    {
        $seat = $request->seat();

        abort_if(! $game->recordGameResult($seat, WinReason::Story), 409, 'This game has already been decided.');

        Log::info('game.win_claimed', ['game' => $game->code, 'game_number' => $game->game_number, 'seat' => $seat->value]);

        return response()->json([
            'status' => $game->status,
            'game_results' => $game->game_results,
            'winner_seat' => $game->winner_seat,
        ]);
    }
}
