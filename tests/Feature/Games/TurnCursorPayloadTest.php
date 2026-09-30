<?php

namespace Tests\Feature\Games;

use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The shared turn cursor on the show payload, as each viewer gets it.
 *
 * @see documentation/pvp-decoupling/spec.md
 */
class TurnCursorPayloadTest extends TestCase
{
    use RefreshDatabase;

    /** Forgets the guard too, which memoizes the participant across requests in one test. */
    private function as(Seat $seat, Game $game): self
    {
        $this->app['auth']->forgetGuards();

        return $this->withSession(['seat_tokens' => [$game->code => "{$seat->value}-token"]]);
    }

    private function midTurn(): Game
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided()->onTurn(3, Seat::Guest, 'contact:2')->create();
    }

    public function test_the_active_seat_is_told_it_is_their_turn(): void
    {
        $game = $this->midTurn();

        $this->as(Seat::Guest, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('cursor', [
                'turn_number' => 3, 'active_seat' => 'guest', 'turn_stop' => 'contact:2', 'my_turn' => true,
            ]));
    }

    public function test_the_other_seat_is_told_it_is_not(): void
    {
        $game = $this->midTurn();

        $this->as(Seat::Host, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('cursor', [
                'turn_number' => 3, 'active_seat' => 'guest', 'turn_stop' => 'contact:2', 'my_turn' => false,
            ]));
    }

    public function test_a_watcher_gets_the_cursor_and_never_the_turn(): void
    {
        $game = $this->midTurn();

        $this->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page
                ->where('seat', null)
                ->where('cursor', [
                    'turn_number' => 3, 'active_seat' => 'guest', 'turn_stop' => 'contact:2', 'my_turn' => false,
                ]));
    }

    public function test_before_turn_one_the_first_player_holds_the_turn(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided(Seat::Guest)->create();

        $this->as(Seat::Guest, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('cursor', [
                'turn_number' => 0, 'active_seat' => null, 'turn_stop' => null, 'my_turn' => true,
            ]));

        $this->as(Seat::Host, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('cursor.my_turn', false));
    }

    public function test_nobody_holds_the_turn_before_turn_order_is_decided(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderRolled()->create();

        foreach (Seat::cases() as $seat) {
            $this->as($seat, $game)
                ->get("/games/{$game->code}")
                ->assertInertia(fn ($page) => $page->where('cursor.my_turn', false));
        }
    }

    public function test_nobody_holds_the_turn_once_the_game_is_finished(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided()->onTurn(3, Seat::Guest)->finished()->create();

        $this->as(Seat::Guest, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('cursor.my_turn', false));
    }

    public function test_a_partial_reload_returns_only_the_cursor(): void
    {
        $game = $this->midTurn();

        $this->as(Seat::Guest, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page
                ->has('game')
                ->reloadOnly('cursor', fn ($reload) => $reload
                    ->missing('game')
                    ->where('cursor.my_turn', true)));
    }

    public function test_a_reload_mid_turn_comes_back_with_the_cursor_the_move_left(): void
    {
        $game = $this->midTurn();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/cursor", ['turn_stop' => 'end'])
            ->assertOk();

        $this->as(Seat::Guest, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('cursor', [
                'turn_number' => 3, 'active_seat' => 'guest', 'turn_stop' => 'end', 'my_turn' => true,
            ]));

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/cursor", ['ends_turn' => true])
            ->assertOk();

        $this->as(Seat::Guest, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('cursor', [
                'turn_number' => 4, 'active_seat' => 'host', 'turn_stop' => null, 'my_turn' => false,
            ]));
    }
}
