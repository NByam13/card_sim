<?php

namespace Tests\Feature\Games;

use App\Enums\GameStatus;
use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

/**
 * A seat claiming the game when its Main Character reaches Story Stage IV.
 */
class ClaimWinTest extends TestCase
{
    use RefreshDatabase;

    private function as(Seat $seat, Game $game): self
    {
        return $this->withSession(['seat_tokens' => [$game->code => "{$seat->value}-token"]]);
    }

    private function live(): Game
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->turnOrderDecided()->onTurn(4)->create();
    }

    public function test_the_host_claims_a_bo1_and_wins_the_match(): void
    {
        $game = $this->live();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/claim-win")
            ->assertOk()
            ->assertExactJson([
                'status' => 'finished',
                'game_results' => [['game' => 1, 'winner' => 'host', 'reason' => 'story']],
                'winner_seat' => 'host',
            ]);

        $game->refresh();
        $this->assertSame(GameStatus::Finished, $game->status);
        $this->assertSame(Seat::Host, $game->winner_seat);
    }

    public function test_the_guest_claims_the_game_for_the_guest(): void
    {
        $game = $this->live();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/claim-win")
            ->assertOk()
            ->assertJsonPath('winner_seat', 'guest');

        $this->assertSame(
            [['game' => 1, 'winner' => 'guest', 'reason' => 'story']],
            $game->refresh()->game_results,
        );
    }

    public function test_the_seat_comes_from_the_session_not_the_body(): void
    {
        $game = $this->live();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/claim-win", ['seat' => 'host', 'winner' => 'host'])
            ->assertOk();

        $this->assertSame(Seat::Guest, $game->refresh()->winner_seat);
    }

    public function test_a_claim_in_a_bo3_takes_the_game_and_leaves_the_match_live(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->bo3()->turnOrderDecided()->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/claim-win")
            ->assertOk()
            ->assertJsonPath('status', 'active')
            ->assertJsonPath('winner_seat', null);

        $this->assertSame(1, $game->refresh()->winsFor(Seat::Host));
    }

    public function test_a_claim_on_a_finished_match_is_refused(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->turnOrderDecided()->gamesWonBy(Seat::Guest)->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/claim-win")
            ->assertForbidden()
            ->assertJson(['message' => 'This match is not in play.']);

        $game->refresh();
        $this->assertSame(Seat::Guest, $game->winner_seat);
        $this->assertCount(1, $game->game_results);
    }

    public function test_a_game_already_decided_is_not_claimed_twice(): void
    {
        // A Bo3 between games: game 1 is recorded and game 2 has not started.
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->bo3()->turnOrderDecided()
            ->state(['game_results' => [['game' => 1, 'winner' => 'guest', 'reason' => 'story']]])
            ->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/claim-win")
            ->assertConflict();

        $this->assertCount(1, $game->refresh()->game_results);
    }

    public function test_a_watcher_cannot_claim(): void
    {
        $game = $this->live();

        $this->postJson("/games/{$game->code}/claim-win")->assertForbidden();

        $this->assertSame([], $game->refresh()->game_results);
    }

    public function test_a_seat_playing_alone_cannot_claim(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided()->create();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/claim-win")
            ->assertForbidden();

        $this->assertSame([], $game->refresh()->game_results);
    }

    public function test_a_claim_waits_for_turn_order(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/claim-win")
            ->assertForbidden();
    }

    public function test_the_page_carries_the_score_the_claim_is_judged_against(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->bo3()->gamesWonBy(Seat::Guest)->create();

        $this->as(Seat::Host, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('game.game_number', 2)
                ->where('game.games_to_win', 2)
                ->where('game.wins', ['host' => 0, 'guest' => 1]));
    }
}
