<?php

namespace App\Events;

use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * The roll winner chose who goes first.
 */
class TurnOrderDecided implements ShouldBroadcastNow, ShouldRescue
{
    use Dispatchable;

    public function __construct(
        public readonly Game $game,
        public readonly Seat $firstPlayer,
    ) {}

    /** @return array<int, PresenceChannel> */
    public function broadcastOn(): array
    {
        return [new PresenceChannel('game.'.$this->game->code)];
    }

    public function broadcastAs(): string
    {
        return 'turn_order.decided';
    }

    /** @return array{first_player: string, game_number: int} */
    public function broadcastWith(): array
    {
        return ['first_player' => $this->firstPlayer->value, 'game_number' => $this->game->game_number];
    }
}
