<?php

namespace Tests\Feature\Games;

use App\Enums\Seat;
use App\Events\BoardStateUpdated;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Relaying and saving a seat's board.
 *
 * @see documentation/board-sync/spec.md
 */
class BoardSyncTest extends TestCase
{
    use RefreshDatabase;

    /** A game with both seats taken, so it is active and both can send. */
    private function activeGame(): Game
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();
    }

    /** The same game, with both seats having accepted the match. */
    private function liveGame(): Game
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->create();
    }

    /** @return array<string, mixed> */
    private function frame(int $seq = 1): array
    {
        return [
            'game_number' => 1,
            'session' => 'session-1',
            'seq' => $seq,
            'state' => ['zones' => ['reveal' => []], 'counts' => ['hand' => 5], 'turn' => 2],
        ];
    }

    private function asHost(Game $game): self
    {
        return $this->withSession(['seat_tokens' => [$game->code => 'host-token']]);
    }

    public function test_a_seat_relays_its_board_to_the_table(): void
    {
        Event::fake([BoardStateUpdated::class]);
        $game = $this->liveGame();

        $this->asHost($game)
            ->postJson("/games/{$game->code}/sync", $this->frame(3))
            ->assertOk()
            ->assertJson(['relayed' => true]);

        Event::assertDispatched(BoardStateUpdated::class, fn (BoardStateUpdated $event) => $event->seat === Seat::Host
            && $event->seq === 3
            && $event->session === 'session-1'
            && $event->broadcastWith()['game_number'] === 1);
    }

    public function test_a_board_from_an_earlier_game_is_not_relayed(): void
    {
        Event::fake([BoardStateUpdated::class]);
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->bo3()->gamesWonBy(Seat::Guest)->create();

        $this->asHost($game)
            ->postJson("/games/{$game->code}/sync", $this->frame())
            ->assertConflict();

        Event::assertNotDispatched(BoardStateUpdated::class);
    }

    /**
     * The whole point of deriving the seat: everyone at the table shares the
     * channel, so a claimed seat would be a forgery.
     */
    public function test_the_seat_comes_from_the_session_not_the_payload(): void
    {
        Event::fake([BoardStateUpdated::class]);
        $game = $this->liveGame();

        $this->asHost($game)
            ->postJson("/games/{$game->code}/sync", [...$this->frame(), 'seat' => 'guest'])
            ->assertOk();

        Event::assertDispatched(BoardStateUpdated::class, fn (BoardStateUpdated $event) => $event->seat === Seat::Host);
    }

    public function test_a_watcher_cannot_relay_a_board(): void
    {
        Event::fake([BoardStateUpdated::class]);
        $game = $this->liveGame();

        $this->postJson("/games/{$game->code}/sync", $this->frame())->assertForbidden();

        Event::assertNotDispatched(BoardStateUpdated::class);
    }

    public function test_a_board_cannot_be_relayed_before_both_seats_are_taken(): void
    {
        Event::fake([BoardStateUpdated::class]);
        $game = Game::factory()->hostToken('host-token')->create();

        $this->asHost($game)
            ->postJson("/games/{$game->code}/sync", $this->frame())
            ->assertForbidden();

        Event::assertNotDispatched(BoardStateUpdated::class);
    }

    public function test_relaying_writes_nothing(): void
    {
        Event::fake([BoardStateUpdated::class]);
        $game = $this->liveGame();

        $this->asHost($game)->postJson("/games/{$game->code}/sync", $this->frame())->assertOk();

        $this->assertNull($game->fresh()->stateFor(Seat::Host));
        $this->assertSame(0, $game->fresh()->host_seq);
    }

    public function test_a_seat_saves_both_boards_and_its_sequence(): void
    {
        $game = $this->activeGame();

        $this->asHost($game)
            ->postJson("/games/{$game->code}/state", [
                'game_number' => 1,
                'seq' => 7,
                'state' => ['zones' => ['hand' => [['uid' => 'u1', 'cardNumber' => 'TEST-C01']]]],
                'public_state' => ['counts' => ['hand' => 1]],
            ])
            ->assertOk();

        $game->refresh();

        $this->assertSame('TEST-C01', $game->stateFor(Seat::Host)['zones']['hand'][0]['cardNumber']);
        $this->assertSame(['hand' => 1], $game->publicStateFor(Seat::Host)['counts']);
        $this->assertSame(7, $game->host_seq);
    }

    public function test_a_seat_saves_only_its_own_half(): void
    {
        $game = $this->activeGame();

        $this->asHost($game)
            ->postJson("/games/{$game->code}/state", [
                'game_number' => 1,
                'seq' => 1,
                'state' => ['zones' => []],
                'public_state' => ['counts' => []],
            ])
            ->assertOk();

        $this->assertNull($game->fresh()->stateFor(Seat::Guest));
    }

    public function test_a_save_from_an_earlier_game_is_refused(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->bo3()->gamesWonBy(Seat::Guest)->create();

        $this->asHost($game)
            ->postJson("/games/{$game->code}/state", [
                'game_number' => 1,
                'seq' => 9,
                'state' => ['zones' => []],
                'public_state' => ['counts' => []],
            ])
            ->assertConflict();

        $this->assertNull($game->fresh()->stateFor(Seat::Host));
    }

    public function test_a_watcher_cannot_save_a_board(): void
    {
        $game = $this->activeGame();

        $this->postJson("/games/{$game->code}/state", [
            'game_number' => 1,
            'seq' => 1,
            'state' => ['zones' => []],
            'public_state' => ['counts' => []],
        ])->assertForbidden();

        $this->assertNull($game->fresh()->stateFor(Seat::Host));
    }

    public function test_saving_marks_the_game_active(): void
    {
        $game = $this->activeGame();
        $game->forceFill(['last_activity_at' => now()->subHour()])->save();

        $this->asHost($game)
            ->postJson("/games/{$game->code}/state", [
                'game_number' => 1,
                'seq' => 1,
                'state' => ['zones' => []],
                'public_state' => ['counts' => []],
            ])
            ->assertOk();

        $this->assertTrue($game->fresh()->last_activity_at->isAfter(now()->subMinute()));
    }

    public function test_a_seat_is_given_its_own_saved_board_back(): void
    {
        $game = $this->activeGame();
        $game->forceFill(['host_state' => ['zones' => ['hand' => [['uid' => 'mine']]]]])->save();

        $this->asHost($game)
            ->get("/games/{$game->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('game.saved_state.zones.hand.0.uid', 'mine'));
    }

    /**
     * The opponent's *redacted* board and never their whole one: that is their
     * hand, and the saved pair exists precisely so this can be handed over.
     */
    public function test_a_seat_is_given_only_the_opponents_redacted_board(): void
    {
        $game = $this->liveGame();
        $game->forceFill([
            'guest_state' => ['zones' => ['hand' => [['uid' => 'secret', 'cardNumber' => 'TEST-C01']]]],
            'guest_public_state' => ['counts' => ['hand' => 1], 'zones' => []],
        ])->save();

        $response = $this->asHost($game)->get("/games/{$game->code}")->assertOk();

        $response->assertInertia(fn ($page) => $page->where('game.opponent_state.counts.hand', 1));
        $this->assertStringNotContainsString('secret', $response->getContent());
    }

    /** A solo board is nobody else's business until both seats have accepted. */
    public function test_a_seat_is_not_given_the_other_ones_board_before_the_match_is_live(): void
    {
        $game = $this->activeGame();
        $game->forceFill(['guest_public_state' => ['counts' => ['hand' => 1], 'zones' => []]])->save();

        $this->asHost($game)
            ->get("/games/{$game->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('game.opponent_state', null));
    }

    public function test_a_watcher_is_given_neither_board(): void
    {
        $game = $this->activeGame();
        $game->forceFill([
            'host_state' => ['zones' => []],
            'host_public_state' => ['counts' => []],
        ])->save();

        $this->get("/games/{$game->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('game.saved_state', null)
                ->where('game.opponent_state', null));
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function badFrames(): array
    {
        return [
            'no game number' => [['session' => 's', 'seq' => 1, 'state' => []]],
            'no session' => [['seq' => 1, 'state' => []]],
            'no seq' => [['session' => 's', 'state' => []]],
            'negative seq' => [['session' => 's', 'seq' => -1, 'state' => []]],
            'no state' => [['session' => 's', 'seq' => 1]],
            'state is not an array' => [['session' => 's', 'seq' => 1, 'state' => 'nope']],
        ];
    }

    /**
     * @param  array<string, mixed>  $frame
     */
    #[DataProvider('badFrames')]
    public function test_a_malformed_frame_is_refused(array $frame): void
    {
        $game = $this->liveGame();

        $this->asHost($game)
            ->postJson("/games/{$game->code}/sync", $frame)
            ->assertStatus(422);
    }
}
