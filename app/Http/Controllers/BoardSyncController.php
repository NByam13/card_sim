<?php

namespace App\Http\Controllers;

use App\Events\BoardStateUpdated;
use App\Http\Requests\RelayBoardRequest;
use App\Http\Requests\SaveBoardRequest;
use App\Models\Game;
use Illuminate\Http\JsonResponse;

/**
 * A seat's board leaving the browser, two ways.
 *
 * `relay` goes out to the table on every action and writes nothing. `save` is
 * debounced and writes the row. Splitting them keeps a write off every drag
 * while still letting a refresh resume.
 *
 * The seat is always derived here, never read from the request. Neither endpoint
 * inspects a board: the server holds no rules.
 *
 * @see documentation/board-sync/spec.md
 */
class BoardSyncController extends Controller
{
    /** Relay this seat's redacted board to everyone else at the table. */
    public function relay(Game $game, RelayBoardRequest $request): JsonResponse
    {
        $validated = $request->validated();

        broadcast(new BoardStateUpdated(
            $game,
            $request->seat(),
            $validated['state'],
            $validated['session'],
            $validated['seq'],
        ))->toOthers();

        return response()->json(['relayed' => true]);
    }

    /** Save this seat's board, whole and redacted, so a refresh resumes it. */
    public function save(Game $game, SaveBoardRequest $request): JsonResponse
    {
        $seat = $request->seat();
        $validated = $request->validated();

        $game->forceFill([
            $seat->column('state') => $validated['state'],
            $seat->column('public_state') => $validated['public_state'],
            $seat->column('seq') => $validated['seq'],
            'last_activity_at' => now(),
        ])->save();

        return response()->json(['saved' => true]);
    }
}
