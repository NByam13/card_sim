<?php

namespace Tests\Feature\Games;

use App\Enums\GameStatus;
use App\Enums\Seat;
use App\Events\GameFinished;
use App\Models\Game;
use Database\Factories\GameFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * A seat giving the game in progress to its opponent.
 */
class ConcedeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Event::fake([GameFinished::class]);
    }

    private function as(Seat $seat, Game $game): self
    {
        return $this->withSession(['seat_tokens' => [$game->code => "{$seat->value}-token"]]);
    }

    private function seated(): GameFactory
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token');
    }

    public function test_conceding_a_bo1_gives_the_opponent_the_match(): void
    {
        $game = $this->seated()->matchLive()->turnOrderDecided()->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/concede", ['game_number' => $game->game_number, 'game_number' => $game->game_number])
            ->assertOk()
            ->assertExactJson([
                'status' => 'finished',
                'game_results' => [['game' => 1, 'winner' => 'guest', 'reason' => 'concede']],
                'winner_seat' => 'guest',
            ]);

        $game->refresh();
        $this->assertSame(GameStatus::Finished, $game->status);
        $this->assertSame(Seat::Guest, $game->winner_seat);
    }

    public function test_conceding_the_deciding_game_of_a_bo3_ends_the_match(): void
    {
        $game = $this->seated()->matchLive()->turnOrderDecided()->bo3()->gamesWonBy(Seat::Host, Seat::Guest)->create();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/concede", ['game_number' => $game->game_number, 'game_number' => $game->game_number])
            ->assertOk()
            ->assertJsonPath('status', 'finished')
            ->assertJsonPath('winner_seat', 'host')
            ->assertJsonPath('game_results.2', ['game' => 3, 'winner' => 'host', 'reason' => 'concede']);
    }

    public function test_conceding_the_first_game_of_a_bo3_leaves_the_match_live(): void
    {
        $game = $this->seated()->matchLive()->turnOrderDecided()->bo3()->create();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/concede", ['game_number' => $game->game_number, 'game_number' => $game->game_number])
            ->assertOk()
            ->assertJsonPath('status', 'active')
            ->assertJsonPath('winner_seat', null);

        $game->refresh();
        $this->assertSame(GameStatus::Active, $game->status);
        $this->assertSame(1, $game->winsFor(Seat::Host));
        $this->assertSame(0, $game->winsFor(Seat::Guest));
    }

    public function test_the_opponent_hears_the_concede(): void
    {
        $game = $this->seated()->matchLive()->turnOrderDecided()->bo3()->create();

        $this->as(Seat::Guest, $game)->postJson("/games/{$game->code}/concede", ['game_number' => $game->game_number, 'game_number' => $game->game_number])->assertOk();

        Event::assertDispatched(GameFinished::class, fn (GameFinished $event) => $event->broadcastOn()[0]->name === "presence-game.{$game->code}"
            && $event->broadcastWith() === [
                'status' => 'active',
                'game_results' => [['game' => 1, 'winner' => 'host', 'reason' => 'concede']],
                'winner_seat' => null,
            ]);
    }

    public function test_the_seat_comes_from_the_session_not_the_body(): void
    {
        $game = $this->seated()->matchLive()->turnOrderDecided()->create();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/concede", ['game_number' => $game->game_number, 'seat' => 'host', 'winner' => 'guest'])
            ->assertOk();

        $this->assertSame(Seat::Host, $game->refresh()->winner_seat);
    }

    public function test_a_concede_may_come_before_turn_order_is_decided(): void
    {
        $game = $this->seated()->matchLive()->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/concede", ['game_number' => $game->game_number, 'game_number' => $game->game_number])
            ->assertOk()
            ->assertJsonPath('winner_seat', 'guest');
    }

    public function test_a_game_already_decided_is_not_conceded_too(): void
    {
        $game = $this->seated()->matchLive()->turnOrderDecided()->bo3()
            ->state(['game_results' => [['game' => 1, 'winner' => 'guest', 'reason' => 'story']]])
            ->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/concede", ['game_number' => $game->game_number, 'game_number' => $game->game_number])
            ->assertConflict();

        $this->assertCount(1, $game->refresh()->game_results);
        Event::assertNotDispatched(GameFinished::class);
    }

    public function test_a_finished_match_cannot_be_conceded(): void
    {
        $game = $this->seated()->matchLive()->turnOrderDecided()->gamesWonBy(Seat::Guest)->create();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/concede", ['game_number' => $game->game_number, 'game_number' => $game->game_number])
            ->assertForbidden()
            ->assertJson(['message' => 'This match is not in play.']);

        $this->assertSame(Seat::Guest, $game->refresh()->winner_seat);
        Event::assertNotDispatched(GameFinished::class);
    }

    public function test_a_watcher_cannot_concede(): void
    {
        $game = $this->seated()->matchLive()->turnOrderDecided()->create();

        $this->postJson("/games/{$game->code}/concede", ['game_number' => $game->game_number, 'game_number' => $game->game_number])->assertForbidden();

        $this->assertSame([], $game->refresh()->game_results);
    }

    public function test_a_seat_playing_alone_cannot_concede(): void
    {
        $game = $this->seated()->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/concede", ['game_number' => $game->game_number, 'game_number' => $game->game_number])
            ->assertForbidden()
            ->assertJson(['message' => 'Both players need to start the match first.']);
    }
}
