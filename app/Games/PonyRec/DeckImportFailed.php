<?php

namespace App\Games\PonyRec;

use RuntimeException;

/**
 * A deck code did not become a deck. Carries a message written for the player,
 * because every one of these is something they see on the form they just
 * submitted.
 */
final class DeckImportFailed extends RuntimeException
{
    private function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }

    public static function private(): self
    {
        return new self(
            'deck.private',
            'That deck is private. Set it to Unlisted on PonyRec, then try again.',
        );
    }

    public static function notFound(): self
    {
        return new self(
            'deck.not_found',
            'No deck has that code. Check it was copied in full.',
        );
    }

    /** Anything else: a timeout, a 5xx, a throttle, a body we cannot read. */
    public static function unavailable(): self
    {
        return new self(
            'deck.unavailable',
            "PonyRec didn't answer. Try again in a moment.",
        );
    }
}
