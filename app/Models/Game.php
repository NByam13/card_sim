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
 *
 * @property 'host'|'guest'|null $first_player
 * @property array{host: array<int, int>, guest: array<int, int>, winner: 'host'|'guest', rerolls: int}|null $turn_order_roll
 * @property int $turn_number
 * @property 'host'|'guest'|null $active_seat
 * @property string|null $turn_stop
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
        'host_state',
        'guest_state',
        'host_public_state',
        'guest_public_state',
        'host_seq',
        'guest_seq',
        'host_accepted_at',
        'guest_accepted_at',
        'first_player',
        'turn_order_roll',
        'turn_number',
        'active_seat',
        'turn_stop',
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
        'turn_number' => 0,
    ];

    /** The token hashes never leave the server. */
    protected $hidden = ['host_token_hash', 'guest_token_hash'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'host_deck' => 'array',
            'guest_deck' => 'array',
            'host_state' => 'array',
            'guest_state' => 'array',
            'host_public_state' => 'array',
            'guest_public_state' => 'array',
            'host_seq' => 'integer',
            'guest_seq' => 'integer',
            'host_accepted_at' => 'datetime',
            'guest_accepted_at' => 'datetime',
            'turn_order_roll' => 'array',
            'turn_number' => 'integer',
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
     *
     * @return 'host'|'guest'|null
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

    /**
     * The other seat. Takes a seat rather than a token — callers have one.
     *
     * @param  'host'|'guest'  $seat
     * @return 'host'|'guest'
     */
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

    /**
     * The board a seat last saved, or null before it has saved one.
     *
     * @return array<string, mixed>|null
     */
    public function stateFor(string $seat): ?array
    {
        return $this->{"{$seat}_state"};
    }

    /**
     * The redacted board a seat last saved, to seed the other side's mirror.
     *
     * @return array<string, mixed>|null
     */
    public function publicStateFor(string $seat): ?array
    {
        return $this->{"{$seat}_public_state"};
    }

    // ── The match ───────────────────────────────────────────────────────────

    /**
     * Which seats have accepted the match.
     *
     * @return array<string, bool>
     */
    public function acceptance(): array
    {
        return [
            'host' => $this->host_accepted_at !== null,
            'guest' => $this->guest_accepted_at !== null,
        ];
    }

    /**
     * Both seats in, so boards may be relayed.
     *
     * A seat playing alone has accepted nothing, and its board is its own until
     * it says otherwise.
     */
    public function matchIsLive(): bool
    {
        return $this->host_accepted_at !== null && $this->guest_accepted_at !== null;
    }

    /**
     * Accept on this seat's behalf. Idempotent: the first answer is the one kept.
     *
     * Drops the boards the acceptance discards. Both halves are re-dealt in the
     * browser when a match starts, and a saved board left behind would be
     * restored over the fresh one by anyone who refreshed before it first saved.
     *
     * @param  'host'|'guest'  $seat
     */
    public function acceptFor(string $seat): void
    {
        if ($this->{"{$seat}_accepted_at"} !== null) {
            return;
        }

        $this->forceFill([
            "{$seat}_accepted_at" => now(),
            'last_activity_at' => now(),
            ...$this->clearedBoard($seat),
        ])->save();

        // The other seat has been playing alone while it waited, and that board
        // goes too — it is the hand they goldfished, not one they were dealt.
        if ($this->matchIsLive()) {
            $this->forceFill($this->clearedBoard($this->opposingSeat($seat)))->save();
        }
    }

    /**
     * The columns that make a seat's saved board absent.
     *
     * @param  'host'|'guest'  $seat
     * @return array<string, null|int>
     */
    private function clearedBoard(string $seat): array
    {
        return [
            "{$seat}_state" => null,
            "{$seat}_public_state" => null,
            "{$seat}_seq" => 0,
        ];
    }

    // ── Turn order ──────────────────────────────────────────────────────────

    /** Turn order is settled once a first player is recorded. */
    public function turnOrderDecided(): bool
    {
        return $this->first_player !== null;
    }

    /**
     * Whether this seat is on the play. Null before turn order is decided, or
     * for a seat that is not in this game.
     */
    public function goesFirst(?string $seat): ?bool
    {
        if (! in_array($seat, self::SEATS, true) || $this->first_player === null) {
            return null;
        }

        return $seat === $this->first_player;
    }

    /**
     * The seat that won the dice roll, or null before a roll. The winner only
     * chooses who goes first, so this can differ from `first_player`.
     *
     * @return 'host'|'guest'|null
     */
    public function rollWinner(): ?string
    {
        return $this->turn_order_roll['winner'] ?? null;
    }

    // ── Turn cursor ─────────────────────────────────────────────────────────

    public function turnStarted(): bool
    {
        return $this->turn_number > 0;
    }

    /**
     * The seat entitled to move the cursor. `active_seat` is null until the
     * first turn starts, so the player on the play opens the game.
     *
     * @return 'host'|'guest'|null
     */
    public function actingSeat(): ?string
    {
        return $this->active_seat ?? $this->first_player;
    }

    public function touchActivity(): void
    {
        $this->forceFill(['last_activity_at' => now()])->save();
    }
}
