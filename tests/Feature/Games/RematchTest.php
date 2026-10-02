<?php

namespace Tests\Feature\Games;

use App\Enums\GameStatus;
use App\Enums\MatchFormat;
use App\Enums\Seat;
use App\Events\GameFinished;
use App\Events\MatchAccepted;
use App\Models\Game;
use Database\Factories\GameFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * A finished match, and both seats playing it again on the same row.
 *
 * @see documentation/board-sync/spec.md
 */
class RematchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Event::fake([GameFinished::class, MatchAccepted::class]);
    }

    /** Forgets the guards too, since the seat guard holds its user across requests in a test. */
    private function as(Seat $seat, Game $game): self
    {
        $this->app['auth']->forgetGuards();

        return $this->withSession(['seat_tokens' => [$game->code => "{$seat->value}-token"]]);
    }

    /** A Bo3 the host won 2–1, with both final boards saved. */
    private function finishedBo3(): GameFactory
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->bo3()
            ->gamesWonBy(Seat::Host, Seat::Guest, Seat::Host)
            ->turnOrderDecided(Seat::Guest)->onTurn(7, Seat::Host, 'main')
            ->state([
                'host_state' => ['zones' => ['hand' => []]],
                'host_public_state' => ['counts' => ['hand' => 2]],
                'host_seq' => 80,
                'guest_state' => ['zones' => ['hand' => []]],
                'guest_public_state' => ['counts' => ['hand' => 5]],
                'guest_seq' => 74,
            ]);
    }

    public function test_finishing_the_match_clears_both_acceptances(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()
            ->turnOrderDecided()->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/claim-win", ['game_number' => 1])
            ->assertOk();

        $game->refresh();
        $this->assertSame(GameStatus::Finished, $game->status);
        $this->assertSame(['host' => false, 'guest' => false], $game->acceptance());
    }

    public function test_the_finished_match_is_shown_to_both_seats_with_the_final_boards(): void
    {
        $game = $this->finishedBo3()->create();

        $this->as(Seat::Guest, $game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page
                ->where('game.status', 'finished')
                ->where('game.winner_seat', 'host')
                ->where('game.match_number', 1)
                ->where('game.game_results.2', ['game' => 3, 'winner' => 'host', 'reason' => 'story'])
                ->where('game.accepted', ['host' => false, 'guest' => false])
                ->where('game.saved_state', ['zones' => ['hand' => []]])
                ->where('game.opponent_state', ['counts' => ['hand' => 2]]));
    }

    public function test_a_watcher_is_shown_the_result(): void
    {
        $game = $this->finishedBo3()->create();

        $this->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page
                ->where('seat', null)
                ->where('game.winner_seat', 'host')
                ->where('game.wins', ['host' => 2, 'guest' => 1])
                ->where('game.opponent_state', null));
    }

    public function test_one_seat_asking_for_a_rematch_leaves_the_result_standing(): void
    {
        $game = $this->finishedBo3()->create();

        $this->as(Seat::Guest, $game)->post("/games/{$game->code}/accept")->assertRedirect();

        $game->refresh();
        $this->assertSame(GameStatus::Finished, $game->status);
        $this->assertSame(['host' => false, 'guest' => true], $game->acceptance());
        $this->assertSame(Seat::Host, $game->winner_seat);
        $this->assertCount(3, $game->game_results);
        $this->assertNotNull($game->stateFor(Seat::Host));
        $this->assertNotNull($game->publicStateFor(Seat::Guest));
        Event::assertDispatched(MatchAccepted::class, fn (MatchAccepted $event) => $event->broadcastWith() === [
            'seat' => 'guest',
            'accepted' => ['host' => false, 'guest' => true],
        ]);
    }

    public function test_both_seats_accepting_starts_the_next_match_from_game_one(): void
    {
        $game = $this->finishedBo3()->create();

        $this->as(Seat::Guest, $game)->post("/games/{$game->code}/accept");
        $this->as(Seat::Host, $game)->post("/games/{$game->code}/accept")->assertRedirect("/games/{$game->code}");

        $game->refresh();
        $this->assertSame(GameStatus::Active, $game->status);
        $this->assertTrue($game->matchIsLive());
        $this->assertSame(2, $game->match_number);
        $this->assertSame(1, $game->game_number);
        $this->assertSame([], $game->game_results);
        $this->assertNull($game->winner_seat);
        $this->assertSame(['game_number' => 1, 'roll' => null, 'first_player' => null, 'chooser' => null], $game->turnOrder());
        $this->assertSame(['game_number' => 1, 'turn_number' => 0, 'active_seat' => null, 'turn_stop' => null], $game->cursor());
        foreach (Seat::cases() as $seat) {
            $this->assertNull($game->stateFor($seat));
            $this->assertNull($game->publicStateFor($seat));
            $this->assertSame(0, $game->{$seat->column('seq')});
        }
        Event::assertDispatched(MatchAccepted::class, fn (MatchAccepted $event) => $event->broadcastWith()['accepted'] === ['host' => true, 'guest' => true]);
    }

    public function test_a_rematch_keeps_the_seats_the_decks_and_the_format(): void
    {
        $game = $this->finishedBo3()->create();
        $decks = [$game->deckFor(Seat::Host), $game->deckFor(Seat::Guest)];

        $this->as(Seat::Host, $game)->post("/games/{$game->code}/accept");
        $this->as(Seat::Guest, $game)->post("/games/{$game->code}/accept");

        $game->refresh();
        $this->assertSame(MatchFormat::Bo3, $game->format);
        $this->assertSame($decks, [$game->deckFor(Seat::Host), $game->deckFor(Seat::Guest)]);
        $this->assertSame(Seat::Guest, $game->seatFor('guest-token'));
    }

    public function test_the_rematch_rolls_for_turn_order(): void
    {
        $game = $this->finishedBo3()->create();
        $game->acceptFor(Seat::Host);
        $game->acceptFor(Seat::Guest);

        $this->as(Seat::Guest, $game)->postJson("/games/{$game->code}/turn-order/roll")->assertOk();

        $this->assertNotNull($game->refresh()->turn_order_roll);
    }

    public function test_asking_twice_does_not_start_a_rematch_alone(): void
    {
        $game = $this->finishedBo3()->create();

        $this->as(Seat::Host, $game)->post("/games/{$game->code}/accept");
        $this->as(Seat::Host, $game)->post("/games/{$game->code}/accept");

        $game->refresh();
        $this->assertSame(GameStatus::Finished, $game->status);
        $this->assertSame(1, $game->match_number);
    }

    public function test_a_watcher_cannot_ask_for_a_rematch(): void
    {
        $game = $this->finishedBo3()->create();

        $this->post("/games/{$game->code}/accept")->assertForbidden();

        $this->assertSame(['host' => false, 'guest' => false], $game->refresh()->acceptance());
        Event::assertNotDispatched(MatchAccepted::class);
    }

    /** A tab left on the last match names a game number the new match is also on. */
    public function test_a_request_from_the_last_match_is_refused_in_the_next(): void
    {
        $game = $this->finishedBo3()->create();
        $game->acceptFor(Seat::Host);
        $game->acceptFor(Seat::Guest);

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/state", [
                'match_number' => 1,
                'game_number' => 1,
                'seq' => 81,
                'state' => ['zones' => ['hand' => []]],
                'public_state' => ['counts' => ['hand' => 2]],
            ])
            ->assertConflict();

        $this->assertNull($game->refresh()->stateFor(Seat::Host));
    }

    public function test_a_request_naming_the_current_match_goes_through(): void
    {
        $game = $this->finishedBo3()->create();
        $game->acceptFor(Seat::Host);
        $game->acceptFor(Seat::Guest);

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/state", [
                'match_number' => 2,
                'game_number' => 1,
                'seq' => 1,
                'state' => ['zones' => ['hand' => []]],
                'public_state' => ['counts' => ['hand' => 6]],
            ])
            ->assertOk();
    }
}
