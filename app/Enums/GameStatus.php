<?php

namespace App\Enums;

/**
 * Where a game is in its lifecycle. Stored and sent as its value. Mirrored in
 * `resources/js/types/game.ts`; keep the two in step.
 */
enum GameStatus: string
{
    case Waiting = 'waiting';
    case Active = 'active';
    case Finished = 'finished';
}
