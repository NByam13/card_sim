<?php

namespace Tests\Unit;

use App\Enums\Seat;
use App\Enums\WinReason;
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

    public function test_recording_a_roll_takes_it_without_a_reload(): void
    {
        $game = $this->activeGame();
        $roll = Game::rollForTurnOrder();

        $this->assertTrue($game->recordTurnOrderRoll($roll));

        $this->assertSame($roll, $game->turn_order_roll);
        $this->assertFalse($game->isDirty());
        $this->assertSame($roll, $game->fresh()->turn_order_roll);
    }

    /** A seat whose copy of the game predates the other seat's roll. */
    public function test_a_stale_roll_loses_and_picks_up_the_stored_one(): void
    {
        $game = $this->activeGame();
        $stale = Game::find($game->id);
        $stored = Game::rollForTurnOrder();
        $game->recordTurnOrderRoll($stored);

        $this->assertFalse($stale->recordTurnOrderRoll(Game::rollForTurnOrder()));

        $this->assertSame($stored, $stale->turn_order_roll);
        $this->assertSame($stored, $game->fresh()->turn_order_roll);
    }

    public function test_a_losing_election_leaves_the_model_as_it_was(): void
    {
        $game = Game::factory()->guestToken('guest-token')->turnOrderRolled(Seat::Host)->create();
        $stale = Game::find($game->id);
        $game->electFirstPlayer(Seat::Guest);

        $this->assertFalse($stale->electFirstPlayer(Seat::Host));

        $this->assertNull($stale->first_player);
        $this->assertFalse($stale->isDirty());
        $this->assertSame(Seat::Guest, $game->fresh()->first_player);
    }

    public function test_writing_turn_order_leaves_other_unsaved_changes_alone(): void
    {
        $game = $this->activeGame();
        $game->host_name = 'Unsaved';

        $game->recordTurnOrderRoll(Game::rollForTurnOrder());

        $this->assertTrue($game->isDirty('host_name'));
        $this->assertSame('Host', $game->fresh()->host_name);
    }

    /** A seat whose copy of the game predates the match being decided. */
    public function test_a_roll_racing_the_match_finishing_is_not_stored(): void
    {
        $game = $this->activeGame();
        $stale = Game::find($game->id);
        $game->recordGameResult(Seat::Host, WinReason::Concede);

        $this->assertFalse($stale->recordTurnOrderRoll(Game::rollForTurnOrder()));

        $this->assertNull($stale->turn_order_roll);
        $this->assertNull($game->fresh()->turn_order_roll);
    }

    public function test_an_election_racing_the_match_finishing_is_not_stored(): void
    {
        $game = Game::factory()->guestToken('guest-token')->turnOrderRolled(Seat::Host)->create();
        $stale = Game::find($game->id);
        $game->recordGameResult(Seat::Host, WinReason::Concede);

        $this->assertFalse($stale->electFirstPlayer(Seat::Host));

        $this->assertNull($game->fresh()->first_player);
    }

    /** Both seats in, so turn order may be written. */
    private function activeGame(): Game
    {
        return Game::factory()->guestToken('guest-token')->create();
    }

    /** A die that rolls these faces in order. */
    private function dice(int ...$faces): Closure
    {
        return function () use (&$faces): int {
            return array_shift($faces) ?? $this->fail('Rolled more dice than scripted.');
        };
    }
}
