<?php

namespace Database\Factories;

use App\Enums\GameStatus;
use App\Enums\Seat;
use App\Games\Seating;
use App\Models\Game;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Game>
 */
class GameFactory extends Factory
{
    /**
     * A game waiting for its guest, with the host seat claimed.
     *
     * The host's token is discarded here: a test that needs to *act* as the host
     * uses `hostToken()` to set a known one.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'setup' => 'mlp',
            'status' => GameStatus::Waiting,
            'host_token_hash' => Game::hashToken(Game::newToken()),
            'host_name' => 'Host',
            'host_deck_code' => Str::lower(Str::random(12)),
            'host_deck' => self::deck('Host deck'),
        ];
    }

    /** Give the host seat a token the test knows. */
    public function hostToken(string $token): static
    {
        return $this->state(fn () => ['host_token_hash' => Game::hashToken($token)]);
    }

    /**
     * Give the guest seat a token the test knows, and start the game.
     *
     * Accepted, as {@see Seating::claimGuestSeat} leaves it: a seat
     * that joins has no board for a match to start underneath.
     */
    public function guestToken(string $token): static
    {
        return $this->state(fn () => [
            'guest_token_hash' => Game::hashToken($token),
            'guest_name' => 'Guest',
            'guest_deck_code' => Str::lower(Str::random(12)),
            'guest_deck' => self::deck('Guest deck'),
            'status' => GameStatus::Active,
            'guest_accepted_at' => now(),
        ]);
    }

    /** Both seats in, so boards are relayed between them. */
    public function matchLive(): static
    {
        return $this->state(fn () => ['host_accepted_at' => now()]);
    }

    public function finished(): static
    {
        return $this->state(fn () => ['status' => GameStatus::Finished]);
    }

    /** The dice rolled, with the winner yet to elect who goes first. */
    public function turnOrderRolled(Seat $rollWinner = Seat::Host): static
    {
        $roll = ['winner' => $rollWinner->value, 'rerolls' => 0];

        foreach (Seat::cases() as $seat) {
            $roll[$seat->value] = $seat === $rollWinner ? [6, 5] : [2, 1];
        }

        return $this->state(fn () => ['turn_order_roll' => $roll]);
    }

    /**
     * The roll decided, and its winner elected who goes first. No turn started.
     *
     * @param  Seat|null  $rollWinner  defaults to the first player
     */
    public function turnOrderDecided(Seat $firstPlayer = Seat::Host, ?Seat $rollWinner = null): static
    {
        return $this->turnOrderRolled($rollWinner ?? $firstPlayer)
            ->state(fn () => ['first_player' => $firstPlayer]);
    }

    /** A turn under way, with the cursor at a stop. */
    public function onTurn(int $turnNumber = 1, Seat $activeSeat = Seat::Host, ?string $turnStop = 'main'): static
    {
        return $this->state(fn () => [
            'turn_number' => $turnNumber,
            'active_seat' => $activeSeat,
            'turn_stop' => $turnStop,
        ]);
    }

    /**
     * A deck snapshot in the shape PonyRec's deck endpoint returns. Small on
     * purpose: nothing in this slice reads a card.
     *
     * @return array<string, mixed>
     */
    public static function deck(string $name = 'A deck'): array
    {
        return [
            'code' => Str::lower(Str::random(12)),
            'name' => $name,
            'main_character' => null,
            'cards' => [
                [
                    'zone' => 'main',
                    'quantity' => 4,
                    'card' => [
                        'card_number' => 'TEST-C01',
                        'name' => 'A card',
                        'subtype' => 'character',
                        'rarity' => 'C',
                        'set_code' => 'TEST',
                        'harmony_cost' => 2,
                        'inspiration' => 3,
                        'story_stage' => null,
                        'image_url' => 'https://example.test/images/TEST/TEST-C01.webp',
                        'thumb_url' => 'https://example.test/images/TEST/thumb/TEST-C01.webp',
                        'card_back_url' => null,
                        'release_status' => 'released',
                        'variant' => null,
                    ],
                ],
            ],
            'tokens' => [],
        ];
    }
}
