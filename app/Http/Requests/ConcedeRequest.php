<?php

namespace App\Http\Requests;

use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Auth\Access\Response;

/**
 * A seat giving the game in progress to its opponent.
 */
class ConcedeRequest extends GameScopedRequest
{
    protected string $notActive = 'This match is not in play.';

    protected function authorizeSeat(Seat $seat, Game $game): Response
    {
        return $game->matchIsLive() ? Response::allow() : Response::deny('Both players need to start the match first.');
    }
}
