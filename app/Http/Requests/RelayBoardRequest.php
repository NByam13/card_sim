<?php

namespace App\Http\Requests;

use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Auth\Access\Response;

/**
 * A seat's redacted board, relayed to the table. Only once the match is live.
 */
class RelayBoardRequest extends ActiveSeatRequest
{
    protected function authorizeSeat(Seat $seat, Game $game): Response
    {
        return $game->matchIsLive() ? Response::allow() : Response::deny('The match has not started yet.');
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'session' => ['required', 'string', 'max:64'],
            'seq' => ['required', 'integer', 'min:0'],
            'state' => ['required', 'array'],
        ];
    }
}
