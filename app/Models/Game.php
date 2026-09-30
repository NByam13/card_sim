<?php

namespace App\Models;

use App\Enums\Seat;
use Closure;
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
 * @property Seat|null $first_player
 * @property array{host: array<int, int>, guest: array<int, int>, winner: 'host'|'guest', rerolls: int}|null $turn_order_roll
 * @property int $turn_number
 * @property Seat|null $active_seat
 * @property string|null $turn_stop
 */
class Game extends Model
{
    /** @use HasFactory<GameFactory> */
    use HasFactory;

    public const STATUSES = ['waiting', 'active', 'finished'];

    /** The setups a game may be played with. One, so far. */
    public const SETUPS = ['mlp'];

    /** Ties rerolled before the host is awarded the roll. */
    public const MAX_TURN_ORDER_REROLLS = 10;

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
            'first_player' => Seat::class,
            'turn_order_roll' => 'array',
            'turn_number' => 'integer',
            'active_seat' => Seat::class,
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
    public function seatFor(?string $token): ?Seat
    {
        if ($token === null || $token === '') {
            return null;
        }

        $hash = self::hashToken($token);

        foreach (Seat::cases() as $seat) {
            $stored = $this->{$seat->column('token_hash')};

            if (is_string($stored) && hash_equals($stored, $hash)) {
                return $seat;
            }
        }

        return null;
    }

    public function guestSeatOpen(): bool
    {
        return $this->status === 'waiting' && $this->guest_token_hash === null;
    }

    /** The display name for a seat, falling back to its label. */
    public function nameFor(Seat $seat): string
    {
        $name = $this->{$seat->column('name')};

        return is_string($name) && $name !== '' ? $name : $seat->name;
    }

    /**
     * The deck snapshot a seat brought, as the deck endpoint returned it.
     *
     * @return array<string, mixed>|null
     */
    public function deckFor(Seat $seat): ?array
    {
        return $this->{$seat->column('deck')};
    }

    /** The deck's name at import time, for the lobby. */
    public function deckNameFor(Seat $seat): ?string
    {
        $deck = $this->deckFor($seat);

        return is_string($deck['name'] ?? null) ? $deck['name'] : null;
    }

    /**
     * The board a seat last saved, or null before it has saved one.
     *
     * @return array<string, mixed>|null
     */
    public function stateFor(Seat $seat): ?array
    {
        return $this->{$seat->column('state')};
    }

    /**
     * The redacted board a seat last saved, to seed the other side's mirror.
     *
     * @return array<string, mixed>|null
     */
    public function publicStateFor(Seat $seat): ?array
    {
        return $this->{$seat->column('public_state')};
    }

    // ── The match ───────────────────────────────────────────────────────────

    /**
     * Which seats have accepted the match.
     *
     * @return array<string, bool> Keyed by seat value.
     */
    public function acceptance(): array
    {
        $acceptance = [];

        foreach (Seat::cases() as $seat) {
            $acceptance[$seat->value] = $this->{$seat->column('accepted_at')} !== null;
        }

        return $acceptance;
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
     */
    public function acceptFor(Seat $seat): void
    {
        if ($this->{$seat->column('accepted_at')} !== null) {
            return;
        }

        $this->forceFill([
            $seat->column('accepted_at') => now(),
            'last_activity_at' => now(),
            ...$this->clearedBoard($seat),
        ])->save();

        // The other seat has been playing alone while it waited, and that board
        // goes too — it is the hand they goldfished, not one they were dealt.
        if ($this->matchIsLive()) {
            $this->forceFill($this->clearedBoard($seat->opposing()))->save();
        }
    }

    /**
     * The columns that make a seat's saved board absent.
     *
     * @return array<string, null|int>
     */
    private function clearedBoard(Seat $seat): array
    {
        return [
            $seat->column('state') => null,
            $seat->column('public_state') => null,
            $seat->column('seq') => 0,
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
     * for a watcher, who holds no seat.
     */
    public function goesFirst(?Seat $seat): ?bool
    {
        if ($seat === null || $this->first_player === null) {
            return null;
        }

        return $seat === $this->first_player;
    }

    /**
     * The seat that won the dice roll, or null before a roll. The winner only
     * chooses who goes first, so this can differ from `first_player`.
     */
    public function rollWinner(): ?Seat
    {
        $winner = $this->turn_order_roll['winner'] ?? null;

        return $winner === null ? null : Seat::from($winner);
    }

    /**
     * Roll 2d6 per seat, rerolling ties, in the shape `turn_order_roll` stores.
     *
     * @param  (Closure(): int)|null  $d6  rolls one die; defaults to `random_int(1, 6)`
     * @return array{host: array<int, int>, guest: array<int, int>, winner: 'host'|'guest', rerolls: int}
     */
    public static function rollForTurnOrder(?Closure $d6 = null): array
    {
        $d6 ??= fn (): int => random_int(1, 6);

        for ($rerolls = 0; $rerolls < self::MAX_TURN_ORDER_REROLLS; $rerolls++) {
            $host = [$d6(), $d6()];
            $guest = [$d6(), $d6()];

            if (array_sum($host) !== array_sum($guest)) {
                $winner = array_sum($host) > array_sum($guest) ? Seat::Host : Seat::Guest;

                return ['host' => $host, 'guest' => $guest, 'winner' => $winner->value, 'rerolls' => $rerolls];
            }
        }

        return ['host' => [6, 6], 'guest' => [1, 1], 'winner' => Seat::Host->value, 'rerolls' => self::MAX_TURN_ORDER_REROLLS];
    }

    // ── Turn cursor ─────────────────────────────────────────────────────────

    public function turnStarted(): bool
    {
        return $this->turn_number > 0;
    }

    /**
     * The seat entitled to move the cursor. `active_seat` is null until the
     * first turn starts, so the player on the play opens the game.
     */
    public function actingSeat(): ?Seat
    {
        return $this->active_seat ?? $this->first_player;
    }

    public function touchActivity(): void
    {
        $this->forceFill(['last_activity_at' => now()])->save();
    }
}
