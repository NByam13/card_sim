<?php

namespace App\Models;

use Database\Factories\GameFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * A two-seat game. The server runs no game logic and knows no rules: it owns the
 * lifecycle (waiting → active → finished), who holds which seat, and the deck
 * each seat brought.
 *
 * Seats are anonymous. `seatFor()` is the one place a token becomes a seat, and
 * every other question about "who is this" goes through it.
 *
 * @see documentation/anonymous-games/spec.md
 */
class Game extends Model
{
    /** @use HasFactory<GameFactory> */
    use HasFactory;

    public const STATUSES = ['waiting', 'active', 'finished'];

    public const SEATS = ['host', 'guest'];

    /** The setups a game may be played with. One, so far. */
    public const SETUPS = ['mlp'];

    protected $fillable = [
        'code',
        'setup',
        'status',
        'host_token_hash',
        'guest_token_hash',
        'host_name',
        'guest_name',
        'host_deck_code',
        'guest_deck_code',
        'host_deck',
        'guest_deck',
        'last_activity_at',
    ];

    /**
     * Mirrors the schema defaults, so a Game reads consistently before it has
     * been reloaded from the database.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'setup' => 'mlp',
        'status' => 'waiting',
    ];

    /** The token hashes never leave the server. */
    protected $hidden = ['host_token_hash', 'guest_token_hash'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'host_deck' => 'array',
            'guest_deck' => 'array',
            'last_activity_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Game $game) {
            // Unguessable invite code, in the same shape as a PonyRec deck slug
            // (36^12). The link is the only thing protecting a game.
            $game->code ??= Str::lower(Str::random(12));
            $game->last_activity_at ??= now();
        });
    }

    public function getRouteKeyName(): string
    {
        return 'code';
    }

    // ── Seats ───────────────────────────────────────────────────────────────

    /**
     * Hash a seat token for storage and comparison.
     *
     * SHA-256, not a password hash: the token is 32 random bytes, so there is
     * nothing to brute-force, and bcrypt's cost would be paid on every request
     * that asks which seat is calling.
     */
    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function newToken(): string
    {
        return Str::random(64);
    }

    /**
     * The seat this token holds, or null for a token that holds neither.
     *
     * Compared in constant time, and against both seats rather than a claimed
     * one: the caller says what it has, never which seat it is.
     */
    public function seatFor(?string $token): ?string
    {
        if ($token === null || $token === '') {
            return null;
        }

        $hash = self::hashToken($token);

        foreach (self::SEATS as $seat) {
            $stored = $this->{"{$seat}_token_hash"};

            if (is_string($stored) && hash_equals($stored, $hash)) {
                return $seat;
            }
        }

        return null;
    }

    /** The other seat. Takes a seat rather than a token — callers have one. */
    public function opposingSeat(string $seat): string
    {
        return $seat === 'host' ? 'guest' : 'host';
    }

    public function guestSeatOpen(): bool
    {
        return $this->status === 'waiting' && $this->guest_token_hash === null;
    }

    /** The display name for a seat, falling back to its label. */
    public function nameFor(string $seat): string
    {
        $name = $this->{"{$seat}_name"};

        return is_string($name) && $name !== '' ? $name : ucfirst($seat);
    }

    /**
     * The deck snapshot a seat brought, as the deck endpoint returned it.
     *
     * @return array<string, mixed>|null
     */
    public function deckFor(string $seat): ?array
    {
        return $this->{"{$seat}_deck"};
    }

    /** The deck's name at import time, for the lobby. */
    public function deckNameFor(string $seat): ?string
    {
        $deck = $this->deckFor($seat);

        return is_string($deck['name'] ?? null) ? $deck['name'] : null;
    }

    public function touchActivity(): void
    {
        $this->forceFill(['last_activity_at' => now()])->save();
    }
}
