<?php

namespace Tests\Feature\Games;

use App\Enums\GameStatus;
use App\Enums\Seat;
use App\Enums\WinReason;
use App\Events\GameFinished;
use App\Events\TurnOrderDecided;
use App\Events\TurnOrderRolled;
use App\Models\Game;
use Database\Factories\GameFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * Between games of a Bo3: the match moves on, the loser elects, and both boards
 * re-deal.
 */
class NextGameTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Event::fake([GameFinished::class, TurnOrderDecided::class, TurnOrderRolled::class]);
    }

    /** Forgets the guards too, since the seat guard holds its user across requests in a test. */
    private function as(Seat $seat, Game $game): self
    {
        $this->app['auth']->forgetGuards();

        return $this->withSession(['seat_tokens' => [$game->code => "{$seat->value}-token"]]);
    }

    /** Game 1 of a Bo3 under way, with both boards saved. */
    private function midGameOne(): GameFactory
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->bo3()
            ->turnOrderDecided(Seat::Host)->onTurn(5, Seat::Guest, 'contact:2')
            ->state([
                'host_state' => ['zones' => ['hand' => []]],
                'host_public_state' => ['counts' => ['hand' => 4]],
                'host_seq' => 31,
                'guest_state' => ['zones' => ['hand' => []]],
                'guest_public_state' => ['counts' => ['hand' => 6]],
                'guest_seq' => 27,
            ]);
    }

    public function test_a_bo3_walks_from_game_one_into_game_two_with_the_loser_electing(): void
    {
        $game = $this->midGameOne()->create();

        $this->as(Seat::Host, $game)->postJson("/games/{$game->code}/claim-win")->assertOk();

        $game->refresh();
        $this->assertSame(GameStatus::Active, $game->status);
        $this->assertSame(2, $game->game_number);
        $this->assertSame(1, $game->winsFor(Seat::Host));
        foreach (Seat::cases() as $seat) {
            $this->assertNull($game->stateFor($seat));
            $this->assertNull($game->publicStateFor($seat));
            $this->assertSame(0, $game->{$seat->column('seq')});
        }
        $this->assertSame(['game_number' => 2, 'turn_number' => 0, 'active_seat' => null, 'turn_stop' => null], $game->cursor());
        $this->assertSame(['game_number' => 2, 'roll' => null, 'first_player' => null, 'chooser' => 'guest'], $game->turnOrder());

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/turn-order/elect", ['first_player' => 'guest'])
            ->assertOk()
            ->assertExactJson(['first_player' => 'guest', 'game_number' => 2]);

        $this->as(Seat::Guest, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page
                ->where('game.game_number', 2)
                ->where('game.saved_state', null)
                ->where('game.opponent_state', null)
                ->where('cursor', ['game_number' => 2, 'turn_number' => 0, 'active_seat' => null, 'turn_stop' => null, 'my_turn' => true]));
        Event::assertDispatched(TurnOrderDecided::class, fn (TurnOrderDecided $event) => $event->broadcastWith() === ['first_player' => 'guest', 'game_number' => 2]);
    }

    public function test_the_winner_of_the_last_game_does_not_elect(): void
    {
        $game = $this->midGameOne()->create();
        $game->recordGameResult(Seat::Host, WinReason::Story);

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/turn-order/elect", ['first_player' => 'host'])
            ->assertForbidden()
            ->assertJson(['message' => 'Only the loser of the last game chooses who goes first.']);

        $this->assertNull($game->refresh()->first_player);
    }

    public function test_nobody_rolls_between_games(): void
    {
        $game = $this->midGameOne()->create();
        $game->recordGameResult(Seat::Guest, WinReason::Concede);

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/turn-order/roll")
            ->assertForbidden()
            ->assertJson(['message' => 'The loser of the last game chooses who goes first.']);

        $this->assertNull($game->refresh()->turn_order_roll);
        Event::assertNotDispatched(TurnOrderRolled::class);
    }

    public function test_the_loser_of_game_two_elects_for_the_decider(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->bo3()
            ->gamesWonBy(Seat::Guest)->turnOrderDecided(Seat::Host)->create();

        $this->as(Seat::Guest, $game)->postJson("/games/{$game->code}/concede")->assertOk();

        $game->refresh();
        $this->assertSame(3, $game->game_number);
        $this->assertSame(Seat::Guest, $game->turnOrderChooser());
    }

    public function test_the_deciding_game_finishes_the_match_without_clearing_the_table(): void
    {
        $game = $this->midGameOne()->gamesWonBy(Seat::Host)->create();

        $this->as(Seat::Host, $game)->postJson("/games/{$game->code}/claim-win")->assertOk();

        $game->refresh();
        $this->assertSame(GameStatus::Finished, $game->status);
        $this->assertSame(2, $game->game_number);
        $this->assertSame(Seat::Host, $game->first_player);
        $this->assertSame(5, $game->turn_number);
        $this->assertNotNull($game->stateFor(Seat::Guest));
    }

    /** A seat whose copy of the game predates the match moving on. */
    public function test_an_election_racing_into_the_next_game_is_not_stored(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->bo3()->turnOrderRolled(Seat::Host)->create();
        $stale = Game::find($game->id);
        $game->recordGameResult(Seat::Guest, WinReason::Concede);

        $this->assertFalse($stale->electFirstPlayer(Seat::Host));

        $this->assertNull($game->fresh()->first_player);
    }
}
