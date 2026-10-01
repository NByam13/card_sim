<?php

namespace Tests\Feature\Games;

use App\Broadcasting\GameChannel;
use App\Enums\GameStatus;
use App\Enums\Seat;
use App\Events\GameFinished;
use App\Games\Participant;
use App\Models\Game;
use Database\Factories\GameFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * Recording a game's result across a Bo3, and announcing it to the table.
 */
class GameResultTest extends TestCase
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

    private function bo3(): GameFactory
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->turnOrderDecided()->bo3();
    }

    public function test_a_bo3_at_1_0_stays_live(): void
    {
        $game = $this->bo3()->create();

        $this->as(Seat::Host, $game)->postJson("/games/{$game->code}/claim-win")->assertOk();

        $game->refresh();
        $this->assertSame(GameStatus::Active, $game->status);
        $this->assertNull($game->winner_seat);
        $this->assertSame(1, $game->winsFor(Seat::Host));
        $this->assertSame(0, $game->winsFor(Seat::Guest));
        $this->assertAnnounced($game, ['status' => 'active', 'winner_seat' => null]);
    }

    public function test_a_bo3_at_2_0_finishes_the_match(): void
    {
        $game = $this->bo3()->gamesWonBy(Seat::Host)->create();

        $this->as(Seat::Guest, $game)->postJson("/games/{$game->code}/concede")->assertOk();

        $game->refresh();
        $this->assertSame(GameStatus::Finished, $game->status);
        $this->assertSame(Seat::Host, $game->winner_seat);
        $this->assertSame(2, $game->winsFor(Seat::Host));
        $this->assertAnnounced($game, ['status' => 'finished', 'winner_seat' => 'host']);
    }

    public function test_the_announcement_goes_to_the_channel_both_seats_and_watchers_join(): void
    {
        $game = $this->bo3()->create();

        $this->as(Seat::Host, $game)->postJson("/games/{$game->code}/claim-win")->assertOk();

        $channel = new GameChannel;
        $this->assertSame('host', $channel->join(new Participant('v:host', [$game->code => 'host-token']), $game)['role']);
        $this->assertSame('guest', $channel->join(new Participant('v:guest', [$game->code => 'guest-token']), $game)['role']);
        $this->assertSame(GameChannel::SPECTATOR_ROLE, $channel->join(new Participant('v:watcher', []), $game)['role']);
        Event::assertDispatched(GameFinished::class, fn (GameFinished $event) => $event->broadcastOn()[0]->name === "presence-game.{$game->code}");
    }

    public function test_the_page_carries_the_score_after_a_result(): void
    {
        $game = $this->bo3()->gamesWonBy(Seat::Guest)->create();

        $this->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page
                ->where('game.games_to_win', 2)
                ->where('game.wins', ['host' => 0, 'guest' => 1]));
    }

    /**
     * @param  array{status: string, winner_seat: string|null}  $expected
     */
    private function assertAnnounced(Game $game, array $expected): void
    {
        Event::assertDispatched(GameFinished::class, fn (GameFinished $event) => $event->broadcastWith() === [
            'status' => $expected['status'],
            'game_results' => $game->game_results,
            'winner_seat' => $expected['winner_seat'],
        ]);
    }
}
