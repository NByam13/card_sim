<?php

namespace App\Http\Controllers;

use App\Enums\Seat;
use App\Enums\WinReason;
use App\Events\GameFinished;
use App\Http\Requests\ClaimWinRequest;
use App\Http\Requests\ConcedeRequest;
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

        $finished = $this->record($game, $seat, WinReason::Story);

        Log::info('game.win_claimed', ['game' => $game->code, 'game_number' => $game->game_number, 'seat' => $seat->value]);

        return response()->json($finished->broadcastWith());
    }

    /** Concede the game: the opponent takes it. */
    public function concede(Game $game, ConcedeRequest $request): JsonResponse
    {
        $seat = $request->seat();

        $finished = $this->record($game, $seat->opposing(), WinReason::Concede);

        Log::info('game.conceded', ['game' => $game->code, 'game_number' => $game->game_number, 'seat' => $seat->value]);

        return response()->json($finished->broadcastWith());
    }

    private function record(Game $game, Seat $winner, WinReason $reason): GameFinished
    {
        abort_if(! $game->recordGameResult($winner, $reason), 409, 'This game has already been decided.');

        $finished = new GameFinished($game);
        event($finished);

        return $finished;
    }
}
