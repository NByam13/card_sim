<?php

namespace App\Enums;

/**
 * One of a game's two seats. Stored and sent as its value.
 */
enum Seat: string
{
    case Host = 'host';
    case Guest = 'guest';

    public function opposing(): self
    {
        return $this === self::Host ? self::Guest : self::Host;
    }

    /** This seat's half of a per-seat column pair, e.g. `host_state`. */
    public function column(string $suffix): string
    {
        return "{$this->value}_{$suffix}";
    }
}
