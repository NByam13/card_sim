<?php

namespace App\Enums;

/**
 * Where a game is in its lifecycle. Stored and sent as its value.
 */
enum GameStatus: string
{
    case Waiting = 'waiting';
    case Active = 'active';
    case Finished = 'finished';
}
