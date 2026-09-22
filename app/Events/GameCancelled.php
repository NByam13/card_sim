<?php

namespace App\Events;

use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * The host cancelled a game before anyone joined it.
 *
 * Leaving without saying so is the same bug {@see SeatClaimed} fixes, one step
 * worse: the row is gone, so a page that kept showing the lobby offers a seat
 * that cannot be claimed, and the join comes back a bare 404.
 *
 * Carries the code rather than the game, because by the time this is heard
 * there is no row to load.
 */
class GameCancelled implements ShouldBroadcastNow, ShouldRescue
{
    use Dispatchable;

    public function __construct(public readonly string $code) {}

    /** @return array<int, PresenceChannel> */
    public function broadcastOn(): array
    {
        return [new PresenceChannel('game.'.$this->code)];
    }

    public function broadcastAs(): string
    {
        return 'game.cancelled';
    }

    /** @return array<string, string> */
    public function broadcastWith(): array
    {
        return ['code' => $this->code];
    }
}
