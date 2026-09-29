<?php

namespace App\Events;

use App\Models\Game;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * A seat accepted the match, so the other one can stop waiting.
 *
 * Carries both seats' acceptance rather than only the sender's: whoever receives
 * this needs to know whether the match is now live, and the answer depends on
 * the seat that did not just move.
 *
 * The seat is stamped from the session, as {@see BoardStateUpdated} is and for
 * the same reason.
 *
 * @see documentation/board-sync/spec.md
 */
class MatchAccepted implements ShouldBroadcastNow, ShouldRescue
{
    use Dispatchable;

    /** @param  'host'|'guest'  $seat */
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
        return 'match.accepted';
    }

    /** @return array{seat: string, accepted: array<string, bool>} */
    public function broadcastWith(): array
    {
        return [
            'seat' => $this->seat,
            'accepted' => $this->game->acceptance(),
        ];
    }
}
