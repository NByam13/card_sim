<?php

namespace App\Events;

use App\Models\Game;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * One seat's redacted board, relayed to the rest of the table.
 *
 * The seat is read from the session and stamped here, never taken from the
 * payload: everyone at the table shares this channel and the app key is public,
 * so a sender-claimed seat would be forgeable.
 *
 * The state is whatever the sender redacted. The server does not inspect it —
 * it holds no rules and cannot tell a legal board from an illegal one.
 *
 * @see documentation/board-sync/spec.md
 */
class BoardStateUpdated implements ShouldBroadcastNow, ShouldRescue
{
    use Dispatchable;

    /**
     * @param  'host'|'guest'  $seat
     * @param  array<string, mixed>  $state  Already redacted by the sender.
     * @param  string  $session  Changes when the sender's board remounts, restarting $seq.
     */
    public function __construct(
        public readonly Game $game,
        public readonly string $seat,
        public readonly array $state,
        public readonly string $session,
        public readonly int $seq,
    ) {}

    /** @return array<int, PresenceChannel> */
    public function broadcastOn(): array
    {
        return [new PresenceChannel('game.'.$this->game->code)];
    }

    public function broadcastAs(): string
    {
        return 'board.state';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'seat' => $this->seat,
            'session' => $this->session,
            'seq' => $this->seq,
            'state' => $this->state,
        ];
    }
}
