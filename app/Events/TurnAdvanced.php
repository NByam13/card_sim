<?php

namespace App\Events;

use App\Models\Game;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * The shared turn cursor moved. Carries the whole cursor.
 */
class TurnAdvanced implements ShouldBroadcastNow, ShouldRescue
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
        return 'turn.advanced';
    }

    /** @return array{cursor: array{turn_number: int, active_seat: string|null, turn_stop: string|null}} */
    public function broadcastWith(): array
    {
        return ['cursor' => $this->game->cursor()];
    }
}
