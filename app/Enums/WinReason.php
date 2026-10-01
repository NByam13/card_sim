<?php

namespace App\Enums;

/**
 * How a game was won. Stored as its value in `games.game_results`.
 */
enum WinReason: string
{
    /** The winner reached the setup's win condition and claimed it. */
    case Story = 'story';

    /** The loser conceded. */
    case Concede = 'concede';
}
