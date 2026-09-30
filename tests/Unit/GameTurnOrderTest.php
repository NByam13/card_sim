<?php

namespace Tests\Unit;

use App\Enums\Seat;
use App\Models\Game;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Who goes first, and whose turn it is.
 *
 * @see documentation/pvp-decoupling/spec.md
 */
class GameTurnOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_game_has_no_turn_order_and_no_turn(): void
    {
        $game = Game::factory()->create()->refresh();

        $this->assertNull($game->first_player);
        $this->assertNull($game->turn_order_roll);
        $this->assertSame(0, $game->turn_number);
        $this->assertNull($game->active_seat);
        $this->assertNull($game->turn_stop);
    }

    public function test_the_turn_columns_round_trip(): void
    {
        $game = Game::factory()->turnOrderDecided(Seat::Guest)->onTurn(3, Seat::Host, 'contact:2')->create()->refresh();

        $this->assertSame(Seat::Guest, $game->first_player);
        $this->assertSame('guest', $game->turn_order_roll['winner']);
        $this->assertSame(3, $game->turn_number);
        $this->assertSame(Seat::Host, $game->active_seat);
        $this->assertSame('contact:2', $game->turn_stop);
        $this->assertDatabaseHas('games', ['id' => $game->id, 'first_player' => 'guest', 'active_seat' => 'host']);
    }

    public function test_turn_order_is_undecided_before_a_first_player(): void
    {
        $game = Game::factory()->make();

        $this->assertFalse($game->turnOrderDecided());
        $this->assertNull($game->rollWinner());
    }

    public function test_turn_order_is_decided_once_a_first_player_is_recorded(): void
    {
        $this->assertTrue(Game::factory()->turnOrderDecided(Seat::Guest)->make()->turnOrderDecided());
    }

    public function test_the_roll_winner_can_elect_to_go_second(): void
    {
        $game = Game::factory()->turnOrderDecided(firstPlayer: Seat::Guest, rollWinner: Seat::Host)->make();

        $this->assertSame(Seat::Host, $game->rollWinner());
        $this->assertSame(Seat::Guest, $game->first_player);
    }

    public function test_goes_first_answers_for_each_seat(): void
    {
        $game = Game::factory()->turnOrderDecided(Seat::Guest)->make();

        $this->assertTrue($game->goesFirst(Seat::Guest));
        $this->assertFalse($game->goesFirst(Seat::Host));
    }

    public function test_goes_first_is_unknown_before_turn_order_is_decided(): void
    {
        $this->assertNull(Game::factory()->make()->goesFirst(Seat::Host));
    }

    public function test_goes_first_is_unknown_for_a_watcher(): void
    {
        $this->assertNull(Game::factory()->turnOrderDecided(Seat::Host)->make()->goesFirst(null));
    }

    public function test_no_turn_has_started_at_turn_zero(): void
    {
        $this->assertFalse(Game::factory()->turnOrderDecided()->make()->turnStarted());
    }

    public function test_a_turn_has_started_once_the_count_moves(): void
    {
        $this->assertTrue(Game::factory()->turnOrderDecided()->onTurn(1)->make()->turnStarted());
    }

    public function test_nobody_acts_before_turn_order_is_decided(): void
    {
        $this->assertNull(Game::factory()->make()->actingSeat());
    }

    public function test_the_player_on_the_play_opens_the_game(): void
    {
        $game = Game::factory()->turnOrderDecided(Seat::Guest)->make();

        $this->assertSame(Seat::Guest, $game->actingSeat());
    }

    public function test_the_active_seat_acts_once_a_turn_has_started(): void
    {
        $game = Game::factory()->turnOrderDecided(Seat::Guest)->onTurn(2, Seat::Host)->make();

        $this->assertSame(Seat::Host, $game->actingSeat());
    }

    public function test_the_higher_total_wins_the_roll(): void
    {
        $roll = Game::rollForTurnOrder($this->dice(2, 3, 6, 4));

        $this->assertSame(['host' => [2, 3], 'guest' => [6, 4], 'winner' => 'guest', 'rerolls' => 0], $roll);
    }

    public function test_the_host_wins_with_the_higher_total(): void
    {
        $this->assertSame('host', Game::rollForTurnOrder($this->dice(6, 5, 1, 2))['winner']);
    }

    public function test_a_tie_is_rerolled(): void
    {
        $roll = Game::rollForTurnOrder($this->dice(3, 4, 5, 2, 1, 1, 4, 4));

        $this->assertSame(['host' => [1, 1], 'guest' => [4, 4], 'winner' => 'guest', 'rerolls' => 1], $roll);
    }

    public function test_the_host_is_awarded_the_roll_once_the_reroll_cap_is_hit(): void
    {
        $rolled = 0;

        $roll = Game::rollForTurnOrder(function () use (&$rolled): int {
            $rolled++;

            return 3;
        });

        $this->assertSame(['host' => [6, 6], 'guest' => [1, 1], 'winner' => 'host', 'rerolls' => 10], $roll);
        $this->assertSame(Game::MAX_TURN_ORDER_REROLLS * 4, $rolled);
    }

    public function test_the_default_dice_roll_a_decided_2d6_each(): void
    {
        $roll = Game::rollForTurnOrder();

        foreach ([...$roll['host'], ...$roll['guest']] as $die) {
            $this->assertContains($die, range(1, 6));
        }

        $this->assertNotSame(array_sum($roll['host']), array_sum($roll['guest']));
    }

    /** A die that rolls these faces in order. */
    private function dice(int ...$faces): Closure
    {
        return function () use (&$faces): int {
            return array_shift($faces) ?? $this->fail('Rolled more dice than scripted.');
        };
    }
}
