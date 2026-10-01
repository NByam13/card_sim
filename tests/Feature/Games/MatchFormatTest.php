<?php

namespace Tests\Feature\Games;

use App\Enums\MatchFormat;
use App\Enums\Seat;
use App\Events\MatchFormatChanged;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

/**
 * The host choosing Bo1 or Bo3 before the match goes live.
 */
class MatchFormatTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Event::fake([MatchFormatChanged::class]);
    }

    public function test_a_game_opens_as_bo1(): void
    {
        $game = Game::factory()->hostToken('host-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'host-token']])
            ->get("/games/{$game->code}")
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('game.format', 'bo1')
                ->where('canChangeFormat', true));
    }

    public function test_the_host_can_switch_while_waiting_for_a_guest(): void
    {
        $game = Game::factory()->hostToken('host-token')->create();

        $this->asSeat($game, 'host-token')->patch("/games/{$game->code}/format", ['format' => 'bo3'])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $this->assertSame(MatchFormat::Bo3, $game->refresh()->format);
    }

    public function test_the_host_can_switch_back_before_the_match_is_live(): void
    {
        // The guest has taken the seat and is looking at the format before accepting.
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->bo3()->create();

        $this->asSeat($game, 'host-token')->patch("/games/{$game->code}/format", ['format' => 'bo1'])
            ->assertSessionHasNoErrors();

        $this->assertSame(MatchFormat::Bo1, $game->refresh()->format);
    }

    public function test_switching_tells_the_table(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();

        $this->asSeat($game, 'host-token')->patch("/games/{$game->code}/format", ['format' => 'bo3']);

        Event::assertDispatched(
            MatchFormatChanged::class,
            fn (MatchFormatChanged $event) => $event->game->is($game)
                && $event->broadcastWith() === ['format' => 'bo3']
        );
    }

    public function test_the_guest_cannot_switch(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();

        $this->asSeat($game, 'guest-token')->patch("/games/{$game->code}/format", ['format' => 'bo3'])
            ->assertForbidden();

        $this->assertSame(MatchFormat::Bo1, $game->refresh()->format);
        Event::assertNotDispatched(MatchFormatChanged::class);
    }

    public function test_a_watcher_cannot_switch(): void
    {
        $game = Game::factory()->create();

        $this->patch("/games/{$game->code}/format", ['format' => 'bo3'])->assertForbidden();

        $this->assertSame(MatchFormat::Bo1, $game->refresh()->format);
    }

    public function test_the_host_cannot_switch_once_the_match_is_live(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->create();

        $this->asSeat($game, 'host-token')->patch("/games/{$game->code}/format", ['format' => 'bo3'])
            ->assertForbidden();

        $this->assertSame(MatchFormat::Bo1, $game->refresh()->format);
        Event::assertNotDispatched(MatchFormatChanged::class);
    }

    public function test_the_lobby_stops_offering_the_switch_once_the_match_is_live(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->matchLive()->create();

        $this->asSeat($game, 'host-token')->get("/games/{$game->code}")
            ->assertInertia(fn (AssertableInertia $page) => $page->where('canChangeFormat', false));
    }

    public function test_the_guest_is_never_offered_the_switch(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();

        $this->asSeat($game, 'guest-token')->get("/games/{$game->code}")
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('game.format', 'bo1')
                ->where('canChangeFormat', false));
    }

    public function test_an_unknown_format_is_rejected(): void
    {
        $game = Game::factory()->hostToken('host-token')->create();

        $this->asSeat($game, 'host-token')->patch("/games/{$game->code}/format", ['format' => 'bo5'])
            ->assertSessionHasErrors('format');

        $this->assertSame(MatchFormat::Bo1, $game->refresh()->format);
    }

    public function test_a_change_that_loses_the_race_to_the_match_going_live_is_refused(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();
        $stale = Game::find($game->id);

        $game->acceptFor(Seat::Host);

        $this->assertFalse($stale->changeFormat(MatchFormat::Bo3));
        $this->assertSame(MatchFormat::Bo1, $game->refresh()->format);
    }

    private function asSeat(Game $game, string $token): static
    {
        return $this->withSession(['seat_tokens' => [$game->code => $token]]);
    }
}
