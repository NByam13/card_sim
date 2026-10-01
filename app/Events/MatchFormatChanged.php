<?php

namespace App\Events;

use App\Models\Game;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * The host changed the match format before the match went live.
 */
class MatchFormatChanged implements ShouldBroadcastNow, ShouldRescue
{
    use Dispatchable;

    public function __construct(public readonly Game $game) {}

    /** @return array<int, PresenceChannel> */
    public function broadcastOn(): array
    {
        return [new PresenceChannel('game.'.$this->game->code)];
    }

    public function broadcastAs(): string
    {
        return 'match.format_changed';
    }

    /** @return array{format: string} */
    public function broadcastWith(): array
    {
        return ['format' => $this->game->format->value];
    }
}
