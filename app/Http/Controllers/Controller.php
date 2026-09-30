<?php

namespace App\Http\Controllers;

use App\Enums\Seat;
use App\Games\Participant;
use App\Models\Game;
use Illuminate\Http\Request;

abstract class Controller
{
    /** The caller's seat in a game with both seats taken, or 403. */
    protected function activeSeatOrAbort(
        Game $game,
        Request $request,
        string $notSeated = 'Only a seated player can do that.',
        string $notActive = 'Both seats need to be taken first.',
    ): Seat {
        $seat = Participant::fromRequest($request)?->roleIn($game);

        abort_if($seat === null, 403, $notSeated);
        abort_if($game->status !== 'active', 403, $notActive);

        return $seat;
    }
}
