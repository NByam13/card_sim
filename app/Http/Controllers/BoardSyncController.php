<?php

namespace App\Http\Controllers;

use App\Events\BoardStateUpdated;
use App\Games\Participant;
use App\Models\Game;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
    public function relay(Game $game, Request $request): JsonResponse
    {
        $seat = $this->seatOrAbort($game, $request);

        // A board played alone is nobody else's business. The browser already
        // holds its frames back until the match is live; this is the same rule
        // where it can actually be enforced.
        abort_if(! $game->matchIsLive(), 403, 'The match has not started yet.');

        $validated = $request->validate([
            'session' => ['required', 'string', 'max:64'],
            'seq' => ['required', 'integer', 'min:0'],
            'state' => ['required', 'array'],
        ]);

        broadcast(new BoardStateUpdated(
            $game,
            $seat,
            $validated['state'],
            $validated['session'],
            $validated['seq'],
        ))->toOthers();

        return response()->json(['relayed' => true]);
    }

    /** Save this seat's board, whole and redacted, so a refresh resumes it. */
    public function save(Game $game, Request $request): JsonResponse
    {
        $seat = $this->seatOrAbort($game, $request);

        $validated = $request->validate([
            'seq' => ['required', 'integer', 'min:0'],
            'state' => ['required', 'array'],
            'public_state' => ['required', 'array'],
        ]);

        $game->forceFill([
            "{$seat}_state" => $validated['state'],
            "{$seat}_public_state" => $validated['public_state'],
            "{$seat}_seq" => $validated['seq'],
            'last_activity_at' => now(),
        ])->save();

        return response()->json(['saved' => true]);
    }

    /** The caller's seat, or 403. A watcher has no board to send. */
    private function seatOrAbort(Game $game, Request $request): string
    {
        $seat = Participant::fromRequest($request)?->roleIn($game);

        abort_if($seat === null || $game->status !== 'active', 403);

        return $seat;
    }
}
