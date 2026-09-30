<?php

namespace App\Http\Requests;

/**
 * A seat accepting the match. Only once the other seat is taken.
 */
class AcceptMatchRequest extends ActiveSeatRequest
{
    protected string $notSeated = 'Only a seated player can accept a match.';

    protected string $notActive = 'There is no second seat to accept yet.';
}
