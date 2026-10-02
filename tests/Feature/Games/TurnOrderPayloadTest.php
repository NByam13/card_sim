<?php

namespace Tests\Feature\Games;

use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Turn order on the show payload, which the seam bar renders before the first turn.
 */
class TurnOrderPayloadTest extends TestCase
{
    use RefreshDatabase;

    public function test_before_the_roll_there_is_no_roll_and_no_first_player(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();

        $this->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('turnOrder', ['game_number' => 1, 'roll' => null, 'first_player' => null, 'chooser' => null]));
    }

    public function test_the_roll_is_shown_before_the_winner_elects(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderRolled(Seat::Guest)->create();

        $this->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page
                ->where('turnOrder.roll', ['winner' => 'guest', 'rerolls' => 0, 'host' => [2, 1], 'guest' => [6, 5]])
                ->where('turnOrder.first_player', null));
    }

    public function test_the_first_player_is_shown_once_elected(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided(Seat::Guest, Seat::Host)->create();

        $this->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page
                ->where('turnOrder.roll.winner', 'host')
                ->where('turnOrder.first_player', 'guest'));
    }
}
