<?php

namespace Tests\Feature\Games;

use App\Enums\Seat;
use App\Events\TurnOrderDecided;
use App\Events\TurnOrderRolled;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * Rolling for turn order, and the winner electing who goes first.
 *
 * @see documentation/pvp-decoupling/spec.md
 */
class TurnOrderTest extends TestCase
{
    use RefreshDatabase;

    private function activeGame(): Game
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();
    }

    /** An active game whose roll `$winner` won, with nobody elected yet. */
    private function rolledGame(Seat $winner): Game
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderRolled($winner)->create();
    }

    private function as(Seat $seat, Game $game): self
    {
        return $this->withSession(['seat_tokens' => [$game->code => "{$seat->value}-token"]]);
    }

    public function test_a_seat_rolls_for_turn_order(): void
    {
        Event::fake([TurnOrderRolled::class]);
        $game = $this->activeGame();

        $response = $this->as(Seat::Guest, $game)->postJson("/games/{$game->code}/turn-order/roll")->assertOk();

        $roll = $game->refresh()->turn_order_roll;
        $this->assertNotNull($roll);
        $response->assertExactJson(['roll' => $roll]);
        $this->assertNull($game->first_player);
        Event::assertDispatched(TurnOrderRolled::class, fn (TurnOrderRolled $event) => $event->broadcastWith() === ['roll' => $roll]);
    }

    public function test_a_second_roll_returns_the_stored_roll(): void
    {
        $game = $this->activeGame();
        $first = $this->as(Seat::Host, $game)->postJson("/games/{$game->code}/turn-order/roll")->json('roll');

        Event::fake([TurnOrderRolled::class]);
        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/turn-order/roll")
            ->assertOk()
            ->assertExactJson(['roll' => $first]);

        $this->assertSame($first, $game->refresh()->turn_order_roll);
        Event::assertNotDispatched(TurnOrderRolled::class);
    }

    public function test_rolling_with_an_empty_seat_is_forbidden(): void
    {
        Event::fake([TurnOrderRolled::class]);
        $game = Game::factory()->hostToken('host-token')->create();

        $this->as(Seat::Host, $game)->postJson("/games/{$game->code}/turn-order/roll")->assertForbidden();

        $this->assertNull($game->refresh()->turn_order_roll);
        Event::assertNotDispatched(TurnOrderRolled::class);
    }

    public function test_a_watcher_cannot_roll(): void
    {
        $game = $this->activeGame();

        $this->postJson("/games/{$game->code}/turn-order/roll")->assertForbidden();

        $this->assertNull($game->refresh()->turn_order_roll);
    }

    public function test_the_roll_winner_may_elect_to_go_second(): void
    {
        Event::fake([TurnOrderDecided::class]);
        $game = $this->rolledGame(Seat::Host);

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/turn-order/elect", ['game_number' => $game->game_number, 'first_player' => 'guest'])
            ->assertOk()
            ->assertExactJson(['first_player' => 'guest', 'game_number' => 1]);

        $this->assertSame(Seat::Guest, $game->refresh()->first_player);
        Event::assertDispatched(TurnOrderDecided::class, fn (TurnOrderDecided $event) => $event->firstPlayer === Seat::Guest);
    }

    public function test_the_roll_loser_cannot_elect(): void
    {
        Event::fake([TurnOrderDecided::class]);
        $game = $this->rolledGame(Seat::Host);

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/turn-order/elect", ['game_number' => $game->game_number, 'first_player' => 'guest'])
            ->assertForbidden();

        $this->assertNull($game->refresh()->first_player);
        Event::assertNotDispatched(TurnOrderDecided::class);
    }

    public function test_electing_before_a_roll_is_forbidden(): void
    {
        $game = $this->activeGame();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/turn-order/elect", ['game_number' => $game->game_number, 'first_player' => 'host'])
            ->assertForbidden();

        $this->assertNull($game->refresh()->first_player);
    }

    public function test_the_first_election_is_kept(): void
    {
        $game = $this->rolledGame(Seat::Guest);
        $this->as(Seat::Guest, $game)->postJson("/games/{$game->code}/turn-order/elect", ['game_number' => $game->game_number, 'first_player' => 'guest'])->assertOk();

        Event::fake([TurnOrderDecided::class]);
        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/turn-order/elect", ['game_number' => $game->game_number, 'first_player' => 'host'])
            ->assertForbidden();

        $this->assertSame(Seat::Guest, $game->refresh()->first_player);
        Event::assertNotDispatched(TurnOrderDecided::class);
    }

    public function test_the_election_must_name_a_seat(): void
    {
        $game = $this->rolledGame(Seat::Host);

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/turn-order/elect", ['game_number' => $game->game_number, 'first_player' => 'spectator'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('first_player');
    }
}
