<?php

namespace App\Http\Requests;

use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Auth\Access\Response;

/**
 * A seat claiming the game in progress. The board is not checked: the server
 * cannot see it, so the claim is taken on trust.
 */
class ClaimWinRequest extends GameScopedRequest
{
    protected string $notActive = 'This match is not in play.';

    protected function authorizeSeat(Seat $seat, Game $game): Response
    {
        if (! $game->matchIsLive()) {
            return Response::deny('Both players need to start the match first.');
        }

        return $game->turnOrderDecided() ? Response::allow() : Response::deny('Turn order is not decided yet.');
    }
}
