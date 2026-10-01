<?php

namespace App\Events;

use App\Models\Game;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * A game was recorded, by a claim or a concede. Carries the whole result, and
 * says whether it ended the match.
 */
class GameFinished implements ShouldBroadcastNow, ShouldRescue
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
        return 'game.finished';
    }

    /** @return array{status: string, game_results: array<int, array{game: int, winner: string, reason: string}>, winner_seat: string|null} */
    public function broadcastWith(): array
    {
        return [
            'status' => $this->game->status->value,
            'game_results' => $this->game->game_results,
            'winner_seat' => $this->game->winner_seat?->value,
        ];
    }
}
