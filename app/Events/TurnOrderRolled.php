<?php

namespace App\Events;

use App\Models\Game;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * The dice for turn order were rolled. Carries both seats' dice, so everyone at
 * the table watches the same roll. The winner has yet to choose who goes first.
 */
class TurnOrderRolled implements ShouldBroadcastNow, ShouldRescue
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
        return 'turn_order.rolled';
    }

    /** @return array{roll: array{host: array<int, int>, guest: array<int, int>, winner: 'host'|'guest', rerolls: int}|null} */
    public function broadcastWith(): array
    {
        return ['roll' => $this->game->turn_order_roll];
    }
}
