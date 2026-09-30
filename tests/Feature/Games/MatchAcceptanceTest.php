<?php

namespace Tests\Feature\Games;

use App\Enums\Seat;
use App\Events\MatchAccepted;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * Starting a match between a seat that was playing alone and one that just
 * arrived.
 *
 * @see documentation/board-sync/spec.md
 */
class MatchAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    /** A game whose guest has joined — and so accepted — while the host plays alone. */
    private function gameAwaitingHost(): Game
    {
        return Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();
    }

    private function asHost(Game $game): self
    {
        return $this->withSession(['seat_tokens' => [$game->code => 'host-token']]);
    }

    private function asGuest(Game $game): self
    {
        return $this->withSession(['seat_tokens' => [$game->code => 'guest-token']]);
    }

    public function test_joining_is_accepting(): void
    {
        $game = $this->gameAwaitingHost();

        $this->assertNotNull($game->guest_accepted_at);
        $this->assertNull($game->host_accepted_at);
        $this->assertFalse($game->matchIsLive());
    }

    public function test_a_seat_accepts_the_match(): void
    {
        Event::fake([MatchAccepted::class]);
        $game = $this->gameAwaitingHost();

        $this->asHost($game)->post("/games/{$game->code}/accept")->assertRedirect();

        $this->assertTrue($game->refresh()->matchIsLive());
        Event::assertDispatched(MatchAccepted::class, fn (MatchAccepted $event) => $event->seat === Seat::Host);
    }

    /**
     * Everyone at the table shares the channel, so the seat is derived from the
     * session here exactly as the relay derives it.
     */
    public function test_a_watcher_cannot_accept_a_match(): void
    {
        Event::fake([MatchAccepted::class]);
        $game = $this->gameAwaitingHost();

        $this->post("/games/{$game->code}/accept")->assertForbidden();

        $this->assertFalse($game->refresh()->matchIsLive());
        Event::assertNotDispatched(MatchAccepted::class);
    }

    public function test_accepting_twice_keeps_the_first_answer(): void
    {
        $game = $this->gameAwaitingHost();

        $this->asHost($game)->post("/games/{$game->code}/accept");
        $accepted = $game->refresh()->host_accepted_at;

        $this->travel(5)->minutes();
        $this->asHost($game)->post("/games/{$game->code}/accept");

        $this->assertTrue($accepted->equalTo($game->refresh()->host_accepted_at));
    }

    /**
     * Both halves are re-dealt when a match starts, so neither seat carries in
     * the hand it goldfished while it waited. A board left on the row would be
     * restored over the fresh one by anyone who refreshed.
     */
    public function test_starting_a_match_discards_both_solo_boards(): void
    {
        $game = $this->gameAwaitingHost();

        $game->forceFill([
            'host_state' => ['zones' => ['hand' => ['TEST-C01']]],
            'host_public_state' => ['counts' => ['hand' => 1]],
            'host_seq' => 9,
            'guest_state' => ['zones' => ['hand' => ['TEST-C02']]],
            'guest_public_state' => ['counts' => ['hand' => 1]],
            'guest_seq' => 4,
        ])->save();

        $this->asHost($game)->post("/games/{$game->code}/accept");

        $game->refresh();

        foreach (Seat::cases() as $seat) {
            $this->assertNull($game->stateFor($seat), "{$seat->value} kept a board");
            $this->assertNull($game->publicStateFor($seat), "{$seat->value} kept a public board");
            $this->assertSame(0, $game->{$seat->column('seq')});
        }
    }

    /**
     * A seat that accepts while the other has not yet has no match to play, so
     * the other's board stays where it is — they are still using it.
     */
    public function test_accepting_alone_leaves_the_other_board_alone(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create([
            'guest_accepted_at' => null,
            'guest_state' => ['zones' => ['hand' => ['TEST-C02']]],
        ]);

        $this->asHost($game)->post("/games/{$game->code}/accept");

        $game->refresh();

        $this->assertFalse($game->matchIsLive());
        $this->assertNotNull($game->stateFor(Seat::Guest));
    }

    public function test_the_page_tells_a_seat_who_has_accepted(): void
    {
        $game = $this->gameAwaitingHost();

        $this->asGuest($game)
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page
                ->where('game.accepted.host', false)
                ->where('game.accepted.guest', true)
            );
    }
}
