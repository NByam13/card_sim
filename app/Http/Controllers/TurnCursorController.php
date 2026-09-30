<?php

namespace App\Http\Controllers;

use App\Events\TurnAdvanced;
use App\Models\Game;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The shared turn cursor. `turn_stop` is stored as given and never parsed; the
 * clients' shared setup decides what a legal stop is.
 */
class TurnCursorController extends Controller
{
    /** Move the cursor to a stop, or end the turn. Only the acting seat may. */
    public function advance(Game $game, Request $request): JsonResponse
    {
        $seat = $this->activeSeatOrAbort($game, $request);

        abort_if(! $game->turnOrderDecided(), 403, 'Turn order is not decided yet.');
        abort_if($seat !== $game->actingSeat(), 403, 'It is not your turn.');

        $validated = $request->validate([
            'turn_stop' => [Rule::requiredIf(! $request->boolean('ends_turn')), 'nullable', 'string', 'max:255'],
            'ends_turn' => ['sometimes', 'boolean'],
        ]);

        abort_if(
            ! $game->advanceCursor($validated['turn_stop'] ?? null, $validated['ends_turn'] ?? false),
            409,
            'The turn has already moved on.',
        );

        TurnAdvanced::dispatch($game);

        return response()->json(['cursor' => $game->cursor()]);
    }
}
