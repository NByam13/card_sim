<?php

namespace App\Http\Controllers;

use App\Events\TurnAdvanced;
use App\Http\Requests\AdvanceCursorRequest;
use App\Models\Game;
use Illuminate\Http\JsonResponse;

/**
 * The shared turn cursor. `turn_stop` is stored as given and never parsed; the
 * clients' shared setup decides what a legal stop is.
 */
class TurnCursorController extends Controller
{
    /** Move the cursor to a stop, or end the turn. Only the acting seat may. */
    public function advance(Game $game, AdvanceCursorRequest $request): JsonResponse
    {
        abort_if(
            ! $game->advanceCursor($request->turnStop(), $request->endsTurn()),
            409,
            'The turn has already moved on.',
        );

        TurnAdvanced::dispatch($game);

        return response()->json(['cursor' => $game->cursor()]);
    }
}
