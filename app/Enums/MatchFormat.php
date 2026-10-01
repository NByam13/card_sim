<?php

namespace App\Enums;

/**
 * How many games a match is played over. Stored as its value.
 */
enum MatchFormat: string
{
    case Bo1 = 'bo1';
    case Bo3 = 'bo3';

    /** Games one seat must win to take the match. */
    public function gamesToWin(): int
    {
        return match ($this) {
            self::Bo1 => 1,
            self::Bo3 => 2,
        };
    }
}
