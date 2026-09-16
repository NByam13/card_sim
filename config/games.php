<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Spectators per game
    |--------------------------------------------------------------------------
    |
    | How many people may watch one game at once, on top of its two players. The
    | limit bounds websocket use rather than enforcing any rule, so the right
    | number depends on the Reverb tier this runs on.
    |
    | Checked when a spectator authorizes the game's presence channel. That check
    | fails *open* when the count cannot be read, so raising this takes effect at
    | once while a broken check never locks an audience out.
    |
    */

    'max_spectators' => (int) env('GAMES_MAX_SPECTATORS', 4),

];
