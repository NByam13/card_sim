<?php

namespace Database\Factories;

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
            'status' => 'waiting',
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

    /** Give the guest seat a token the test knows, and start the game. */
    public function guestToken(string $token): static
    {
        return $this->state(fn () => [
            'guest_token_hash' => Game::hashToken($token),
            'guest_name' => 'Guest',
            'guest_deck_code' => Str::lower(Str::random(12)),
            'guest_deck' => self::deck('Guest deck'),
            'status' => 'active',
        ]);
    }

    public function finished(): static
    {
        return $this->state(fn () => ['status' => 'finished']);
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
