<?php

namespace App\Events;

use App\Http\Controllers\GameController;
use App\Models\Game;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Somebody took a seat in a game.
 *
 * Presence alone cannot say this. A member set says who is connected, not who
 * the row says is seated, and the page's copy of the game is a snapshot taken
 * when it loaded — so without this the other browsers keep showing an empty
 * seat until someone refreshes.
 *
 * The payload names the seat and nothing else: it is a nudge to re-ask the
 * server, not a copy of the game. Everything a page may know still comes back
 * through {@see GameController::show()}, where the seat is derived from the
 * session.
 */
class SeatClaimed implements ShouldBroadcastNow, ShouldRescue
{
    use Dispatchable;

    public function __construct(
        public readonly Game $game,
        public readonly string $seat,
    ) {}

    /** @return array<int, PresenceChannel> */
    public function broadcastOn(): array
    {
        return [new PresenceChannel('game.'.$this->game->code)];
    }

    public function broadcastAs(): string
    {
        return 'seat.claimed';
    }

    /** @return array<string, string> */
    public function broadcastWith(): array
    {
        return ['seat' => $this->seat];
    }
}
