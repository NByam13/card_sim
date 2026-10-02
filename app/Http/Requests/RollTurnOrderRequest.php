<?php

namespace App\Http\Requests;

use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Auth\Access\Response;

/**
 * Rolling for turn order, which only game 1 does.
 */
class RollTurnOrderRequest extends ActiveSeatRequest
{
    protected function authorizeSeat(Seat $seat, Game $game): Response
    {
        return $game->isFirstGame()
            ? Response::allow()
            : Response::deny('The loser of the last game chooses who goes first.');
    }
}
