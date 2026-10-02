<?php

namespace App\Http\Requests;

use App\Enums\GameStatus;

/**
 * A seat accepting the match, or a rematch once it is over. Only once the other
 * seat is taken.
 */
class AcceptMatchRequest extends ActiveSeatRequest
{
    protected string $notSeated = 'Only a seated player can accept a match.';

    protected string $notActive = 'There is no second seat to accept yet.';

    protected array $statuses = [GameStatus::Active, GameStatus::Finished];
}
