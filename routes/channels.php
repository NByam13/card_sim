<?php

use App\Games\Participant;
use App\Games\SpectatorSeats;
use App\Models\Game;
use Illuminate\Support\Facades\Broadcast;

/**
 * A game's channel. Everyone who can open the page can be here; what differs is
 * the role, and the role is read from the session's seat token rather than from
 * anything the subscriber says.
 *
 * That is the lesson PON-42 taught PonyRec: a payload-carried seat is forgeable,
 * and the app key is public, so the server has to be the one that decides.
 */
Broadcast::channel('game.{game}', function (Participant $participant, Game $game) {
    $seat = $participant->roleIn($game);

    if ($seat !== null) {
        return [
            'id' => $participant->id,
            'role' => $seat,
            'name' => $game->nameFor($seat),
        ];
    }

    if (SpectatorSeats::full($game, $participant->id)) {
        return false;
    }

    // Watchers publish nothing but an opaque id: there is nothing about someone
    // watching for the rest of the table to learn.
    return [
        'id' => $participant->id,
        'role' => 'spectator',
        'name' => null,
    ];
}, ['guards' => ['seat']]);
