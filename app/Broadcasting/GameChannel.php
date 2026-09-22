<?php

namespace App\Broadcasting;

use App\Games\Participant;
use App\Games\SpectatorSeats;
use App\Models\Game;

/**
 * Who may be on a game's channel, and as what.
 *
 * Everyone who can open the page can be here; what differs is the role, and the
 * role is read from the session's seat token rather than from anything the
 * subscriber says. That is the lesson PON-42 taught PonyRec: a payload-carried
 * seat is forgeable, and the app key is public, so the server has to be the one
 * that decides.
 *
 * This is the slice's authorization boundary, which is why it is a class and not
 * a closure in `routes/channels.php`: a decision worth testing needs somewhere
 * to be called from, and tests/Feature/Games/GameChannelTest.php is where it is
 * called from.
 */
class GameChannel
{
    /**
     * The member to publish for this participant, or false to refuse them.
     *
     * @return array<string, string|null>|false
     */
    public function join(Participant $participant, Game $game): array|bool
    {
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

        // Watchers publish nothing but an opaque id: there is nothing about
        // someone watching for the rest of the table to learn.
        return [
            'id' => $participant->id,
            'role' => 'spectator',
            'name' => null,
        ];
    }
}
