<?php

namespace App\Models;

use App\Enums\GameStatus;
use App\Enums\MatchFormat;
use App\Enums\Seat;
use App\Enums\WinReason;
use App\Games\Seating;
use Closure;
use Database\Factories\GameFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use LogicException;

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
 * @property GameStatus $status
 * @property Seat|null $first_player
 * @property array{host: array<int, int>, guest: array<int, int>, winner: 'host'|'guest', rerolls: int}|null $turn_order_roll
 * @property int $turn_number
 * @property Seat|null $active_seat
 * @property string|null $turn_stop
 * @property MatchFormat $format
 * @property int $game_number
 * @property list<array{game: int, winner: 'host'|'guest', reason: 'story'|'concede'}> $game_results
 * @property Seat|null $winner_seat
 */
class Game extends Model
{
    /** @use HasFactory<GameFactory> */
    use HasFactory;

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
        'format',
        'game_number',
        'game_results',
        'winner_seat',
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
        'status' => GameStatus::Waiting->value,
        'turn_number' => 0,
        'format' => MatchFormat::Bo1->value,
        'game_number' => 1,
        'game_results' => '[]',
    ];

    /** The token hashes never leave the server. */
    protected $hidden = ['host_token_hash', 'guest_token_hash'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'status' => GameStatus::class,
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
            'format' => MatchFormat::class,
            'game_number' => 'integer',
            'game_results' => 'array',
            'winner_seat' => Seat::class,
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
        return $this->status === GameStatus::Waiting && $this->guest_token_hash === null;
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
     * Save a seat's board for the game it was played in. Returns false, writing
     * nothing, once the match has moved on to another game.
     *
     * @param  array<string, mixed>  $state
     * @param  array<string, mixed>  $publicState
     */
    public function saveBoard(Seat $seat, int $gameNumber, array $state, array $publicState, int $seq): bool
    {
        return $this->fillWhere([
            $seat->column('state') => $state,
            $seat->column('public_state') => $publicState,
            $seat->column('seq') => $seq,
        ], fn (Builder $query) => $query->where('game_number', $gameNumber));
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

    // ── Match format ────────────────────────────────────────────────────────

    public function gamesToWin(): int
    {
        return $this->format->gamesToWin();
    }

    /** Whether the game in progress is the match's first, the one decided by a roll. */
    public function isFirstGame(): bool
    {
        return $this->game_number === 1;
    }

    /** Whether the game in progress already has its result recorded. */
    public function currentGameDecided(): bool
    {
        return count($this->game_results) >= $this->game_number;
    }

    public function winsFor(Seat $seat): int
    {
        return count(array_filter($this->game_results, fn (array $result) => $result['winner'] === $seat->value));
    }

    /** Whether the format can no longer change: once the guest seat is taken. */
    public function formatLocked(): bool
    {
        return ! $this->guestSeatOpen();
    }

    /**
     * Change the format unless it has locked since this model was read. Returns
     * whether the change was kept.
     *
     * Guarded on the same columns {@see Seating::claimGuestSeat()} is, so a
     * change racing the guest's join cannot land after they took the seat.
     */
    public function changeFormat(MatchFormat $format): bool
    {
        if ($this->formatLocked()) {
            return false;
        }

        return $this->fillWhere(['format' => $format], fn (Builder $query) => $query
            ->where('status', GameStatus::Waiting)
            ->whereNull('guest_token_hash'));
    }

    /**
     * Record the winner of the game in progress, then either finish the match or
     * set up the next game. Returns whether this call's result was the one kept.
     *
     * The next game goes back through the turn-order gate with both boards
     * cleared, the loser electing in place of a roll: a null `first_player` is
     * what opens the gate, and a null board is what makes a client deal fresh.
     *
     * Guarded on the results already recorded, so a claim and a concession
     * landing at once record one game, not two.
     */
    public function recordGameResult(Seat $winnerSeat, WinReason $reason): bool
    {
        $recorded = count($this->game_results);

        if ($this->status !== GameStatus::Active || $this->currentGameDecided()) {
            return false;
        }

        $values = ['game_results' => [
            ...$this->game_results,
            ['game' => $this->game_number, 'winner' => $winnerSeat->value, 'reason' => $reason->value],
        ]];

        $values += $this->winsFor($winnerSeat) + 1 >= $this->gamesToWin()
            ? ['status' => GameStatus::Finished, 'winner_seat' => $winnerSeat]
            : $this->nextGame();

        return $this->fillWhere($values, fn (Builder $query) => $query
            ->where('status', GameStatus::Active)
            ->whereJsonLength('game_results', $recorded));
    }

    /**
     * The columns that start the next game: turn order undecided, the cursor
     * back before turn 1, and both boards gone.
     *
     * @return array<string, mixed>
     */
    private function nextGame(): array
    {
        return [
            'game_number' => $this->game_number + 1,
            'first_player' => null,
            'turn_order_roll' => null,
            'turn_number' => 0,
            'active_seat' => null,
            'turn_stop' => null,
            ...$this->clearedBoard(Seat::Host),
            ...$this->clearedBoard(Seat::Guest),
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
     * The seat that elects who goes first: the roll winner in game 1, and the
     * loser of the last game after it. Null in game 1 before the roll.
     */
    public function turnOrderChooser(): ?Seat
    {
        if ($this->isFirstGame()) {
            return $this->rollWinner();
        }

        $last = Arr::last($this->game_results);

        return $last === null ? null : Seat::from($last['winner'])->opposing();
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

                return [Seat::Host->value => $host, Seat::Guest->value => $guest, 'winner' => $winner->value, 'rerolls' => $rerolls];
            }
        }

        return [Seat::Host->value => [6, 6], Seat::Guest->value => [1, 1], 'winner' => Seat::Host->value, 'rerolls' => self::MAX_TURN_ORDER_REROLLS];
    }

    /**
     * Store a roll unless one is already stored, or the game has moved on.
     * Returns whether this call's roll was the one kept; either way the model
     * holds the stored row afterwards.
     *
     * The conditional update settles both seats rolling at once.
     *
     * @param  array{host: array<int, int>, guest: array<int, int>, winner: 'host'|'guest', rerolls: int}  $roll
     */
    public function recordTurnOrderRoll(array $roll): bool
    {
        if ($this->fillIfNull('turn_order_roll', $roll)) {
            return true;
        }

        $this->refresh();

        return false;
    }

    /**
     * Record who goes first unless it is already decided. Returns whether this
     * call's choice was the one kept; the model is left as it was when it was not.
     */
    public function electFirstPlayer(Seat $firstPlayer): bool
    {
        return $this->fillIfNull('first_player', $firstPlayer);
    }

    /**
     * Turn order as it stands, for everyone at the table.
     *
     * @return array{roll: array{host: array<int, int>, guest: array<int, int>, winner: 'host'|'guest', rerolls: int}|null, first_player: string|null, chooser: string|null, game_number: int}
     */
    public function turnOrder(): array
    {
        return [
            'game_number' => $this->game_number,
            'roll' => $this->turn_order_roll,
            'first_player' => $this->first_player?->value,
            'chooser' => $this->turnOrderChooser()?->value,
        ];
    }

    /** Write a column only while it is still null, in the same game, with the match in play. */
    private function fillIfNull(string $column, mixed $value): bool
    {
        $gameNumber = $this->getRawOriginal('game_number');

        return $this->fillWhere([$column => $value], fn (Builder $query) => $query
            ->where('status', GameStatus::Active)
            ->where('game_number', $gameNumber)
            ->whereNull($column));
    }

    /**
     * Write columns only while the row still matches `$unchanged`. On success the
     * model takes the written values without a reload; on failure it is left as
     * it was.
     *
     * @param  array<string, mixed>  $values
     * @param  Closure(Builder<self>): Builder<self>  $unchanged
     */
    private function fillWhere(array $values, Closure $unchanged): bool
    {
        $columns = [...array_keys($values), 'last_activity_at'];
        $before = $this->getAttributes();

        $this->forceFill([...$values, 'last_activity_at' => now()]);

        $filled = $unchanged(self::whereKey($this->id))
            ->update(Arr::only($this->getAttributes(), $columns)) === 1;

        if ($filled) {
            $this->syncOriginalAttributes($columns);
        } else {
            $this->setRawAttributes($before);
        }

        return $filled;
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

    /**
     * Move the cursor on the acting seat's behalf. Before the first turn this
     * opens turn 1 for the first player; after it, ending the turn hands the
     * next one to the other seat with no stop yet. Returns false when the turn
     * changed hands, a result was recorded, or the match moved on to another
     * game since this model was read.
     *
     * @throws LogicException before turn order is decided
     */
    public function advanceCursor(?string $turnStop, bool $endsTurn): bool
    {
        $seat = $this->actingSeat() ?? throw new LogicException('Turn order is not decided yet.');

        $cursor = match (true) {
            ! $this->turnStarted() => ['turn_number' => 1, 'active_seat' => $seat, 'turn_stop' => $turnStop],
            $endsTurn => ['turn_number' => $this->turn_number + 1, 'active_seat' => $seat->opposing(), 'turn_stop' => null],
            default => ['turn_stop' => $turnStop],
        };

        $gameNumber = $this->getRawOriginal('game_number');
        $turnNumber = $this->getRawOriginal('turn_number');
        $activeSeat = $this->getRawOriginal('active_seat');
        $recorded = count($this->game_results);

        return $this->fillWhere($cursor, fn (Builder $query) => $query
            ->where('status', GameStatus::Active)
            ->where('game_number', $gameNumber)
            ->whereJsonLength('game_results', $recorded)
            ->where('turn_number', $turnNumber)
            ->where('active_seat', $activeSeat));
    }

    /**
     * The whole cursor, as it is broadcast and returned.
     *
     * @return array{game_number: int, turn_number: int, active_seat: string|null, turn_stop: string|null}
     */
    public function cursor(): array
    {
        return [
            'game_number' => $this->game_number,
            'turn_number' => $this->turn_number,
            'active_seat' => $this->active_seat?->value,
            'turn_stop' => $this->turn_stop,
        ];
    }

    /**
     * Whether this seat may move the cursor now. Always false for a watcher, and
     * for everyone once the game in progress is decided.
     */
    public function isTurnOf(?Seat $seat): bool
    {
        return $seat !== null
            && $this->status === GameStatus::Active
            && ! $this->currentGameDecided()
            && $seat === $this->actingSeat();
    }

    /**
     * The cursor as one viewer sees it, with whether it is theirs to move.
     *
     * @return array{game_number: int, turn_number: int, active_seat: string|null, turn_stop: string|null, my_turn: bool}
     */
    public function phaseState(?Seat $viewer): array
    {
        return [...$this->cursor(), 'my_turn' => $this->isTurnOf($viewer)];
    }

    public function touchActivity(): void
    {
        $this->forceFill(['last_activity_at' => now()])->save();
    }
}
